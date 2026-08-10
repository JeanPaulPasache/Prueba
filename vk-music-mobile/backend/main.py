import os
import re
import asyncio
import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from pyrogram import Client

app = FastAPI(title="VK Music Downloader API")

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING", "")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
MY_BOT_USERNAME = os.getenv("MY_BOT_USERNAME", "")

telegram_client = Client(
    "render_vk_session",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING,
    in_memory=True
)

BOT_USERNAME = "vkmusic_bot"
class TrackItem(BaseModel):
    index: int
    title: str
    duration: Optional[str] = ""


@app.on_event("startup")
async def startup():
    if not SESSION_STRING:
        print("[WARNING]: TELEGRAM_SESSION_STRING no está configurada.")
    else:
        await telegram_client.start()
        print("[TELEGRAM]: Cliente conectado exitosamente en Render.")


@app.on_event("shutdown")
async def shutdown():
    if telegram_client.is_connected:
        await telegram_client.stop()


def parse_bot_search_response(text: str) -> List[dict]:
    results = []
    lines = text.split("\n")

    for line in lines:
        line = line.strip()
        match = re.match(r"^(\d+)[\.\)]\s+(.+?)(?:\s+\((\d+:\d+)\))?$", line)
        if match:
            idx = int(match.group(1))
            track_name = match.group(2).strip()
            duration = match.group(3) or ""
            results.append({
                "index": idx,
                "title": track_name,
                "duration": duration
            })

    return results


@app.get("/search", response_model=List[TrackItem])
async def search_tracks(q: str = Query(..., description="Nombre de la canción o artista")):
    if not q.strip():
        raise HTTPException(status_code=400, detail="El parámetro de búsqueda no puede estar vacío.")

    try:
        await telegram_client.read_chat_history(BOT_USERNAME)
        await telegram_client.send_message(BOT_USERNAME, q.strip())
        await asyncio.sleep(2.5)

        bot_message_text = None

        async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=5):
            if message.from_user and message.from_user.username.lower() == BOT_USERNAME.lower():
                if message.text:
                    bot_message_text = message.text
                    break

        if not bot_message_text:
            raise HTTPException(status_code=404, detail="El bot no devolvió ninguna lista de resultados.")

        tracks = parse_bot_search_response(bot_message_text)

        if not tracks:
            raise HTTPException(status_code=404, detail="No se pudieron extraer canciones de la respuesta.")

        return tracks

    except Exception as e:
        print(f"[VK MUSIC SEARCH ERROR]: {e}")
        raise HTTPException(status_code=500, detail=f"Error al realizar la búsqueda: {str(e)}")


@app.get("/get-track-url")
async def get_track_url(
    q: str = Query(..., description="Nombre de la canción original de búsqueda"),
    index: int = Query(1, ge=1, le=10, description="Índice de la canción seleccionada")
):
    """
    Obtiene la URL directa de descarga de Telegram para que el dispositivo móvil
    descargue el MP3 directamente sin consumir ancho de banda en Render.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="El parámetro de búsqueda no puede estar vacío.")

    try:
        await telegram_client.read_chat_history(BOT_USERNAME)
        await telegram_client.send_message(BOT_USERNAME, f"/song {q.strip()}")
        await asyncio.sleep(2.5)

        audio_msg = None

        async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=5):
            if message.from_user and message.from_user.username.lower() == BOT_USERNAME.lower():
                if message.reply_markup and message.reply_markup.inline_keyboard:
                    btn_idx = min(index - 1, len(message.reply_markup.inline_keyboard) - 1)
                    target_button = message.reply_markup.inline_keyboard[btn_idx][0]
                    if target_button.callback_data:
                        await telegram_client.request_callback_answer(
                            chat_id=BOT_USERNAME,
                            message_id=message.id,
                            callback_data=target_button.callback_data
                        )
                        await asyncio.sleep(3.5)
                        break

                elif message.text and ("/" in message.text):
                    await telegram_client.send_message(BOT_USERNAME, f"/{index}")
                    await asyncio.sleep(3.5)
                    break

        async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=3):
            if message.audio:
                audio_msg = message
                break

        if not audio_msg:
            raise HTTPException(status_code=404, detail="No se encontró el audio de la canción.")

        # 1. Reenviar audio a tu Bot
        await telegram_client.forward_messages(MY_BOT_USERNAME, BOT_USERNAME, audio_msg.id)

        bot_api_file_id = None
        
        async with httpx.AsyncClient() as client:
            # A) Asegurar que no haya webhooks activos
            await client.get(f"https://api.telegram.org/bot{BOT_TOKEN}/deleteWebhook")

            # B) Buscar el archivo en los mensajes recibidos
            for attempt in range(5):
                await asyncio.sleep(1.5)
                
                # Obtenemos las actualizaciones sin limitar con offset=-1
                updates_res = await client.get(
                    f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates"
                )
                updates_data = updates_res.json()

                # Print para inspeccionar en la consola de Render si vuelve a fallar
                print(f"[DEBUG BOT API Intento {attempt + 1}]: {updates_data}")

                if updates_data.get("ok") and updates_data.get("result"):
                    # Recorremos de las actualizaciones más recientes a las más antiguas
                    for update in reversed(updates_data["result"]):
                        msg = update.get("message") or update.get("channel_post") or {}
                        
                        # 🔑 Importante: Telegram puede enviarlo como 'audio' o como 'document'
                        media_obj = msg.get("audio") or msg.get("document")
                        
                        if media_obj and "file_id" in media_obj:
                            bot_api_file_id = media_obj["file_id"]
                            break

                if bot_api_file_id:
                    break

            if not bot_api_file_id:
                raise HTTPException(
                    status_code=500,
                    detail="El mensaje llegó a Telegram pero la Bot API no devolvió el file_id. Revisa la consola de Render para ver el Log de DEBUG."
                )

            # C) Obtener la ruta del archivo con getFile
            file_res = await client.get(
                f"https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={bot_api_file_id}"
            )
            file_data = file_res.json()
            
            if not file_data.get("ok") or "result" not in file_data:
                raise HTTPException(status_code=500, detail="Error al resolver file_path en Telegram.")

            file_path = file_data["result"]["file_path"]
            direct_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"

        display_title = f"{audio_msg.audio.performer or ''} - {audio_msg.audio.title or ''}".strip(" - ")
        if not display_title:
            display_title = audio_msg.audio.file_name or f"track_{index}"

        return {
            "url": direct_url,
            "title": display_title,
            "file_name": audio_msg.audio.file_name or f"track_{index}.mp3"
        }

    except Exception as e:
        print(f"[VK MUSIC URL ERROR]: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener la URL: {str(e)}")