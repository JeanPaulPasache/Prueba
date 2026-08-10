import os
import re
import asyncio
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pyrogram import Client

app = FastAPI(title="VK Music Downloader API")

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING", "")

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
    """
    Parsea el mensaje con formato de lista que devuelve VK Music Bot.
    Ejemplo de línea: "1. Artist Name - Track Title (03:45)"
    """
    results = []
    lines = text.split("\n")

    for line in lines:
        line = line.strip()
        # Busca patrones tipo: 1. Artista - Canción (03:15)
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
    """
    Envía /song <q> al bot de Telegram y devuelve la lista de las 10 opciones encontradas.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="El parámetro de búsqueda no puede estar vacío.")

    try:
        # 1. Limpiar historial del chat
        await telegram_client.read_chat_history(BOT_USERNAME)

        # 2. Enviar comando /song <busqueda>
        await telegram_client.send_message(BOT_USERNAME, q.strip())

        # 3. Esperar la respuesta del bot
        await asyncio.sleep(2.5)

        bot_message_text = None

        async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=5):
            if message.from_user and message.from_user.username.lower() == BOT_USERNAME.lower():
                if message.text:
                    bot_message_text = message.text
                    break

        if not bot_message_text:
            raise HTTPException(
                status_code=404,
                detail="El bot no devolvió ninguna lista de resultados."
            )

        # 4. Procesar el texto devuelto por el bot
        tracks = parse_bot_search_response(bot_message_text)

        if not tracks:
            raise HTTPException(
                status_code=404,
                detail="No se pudieron extraer canciones de la respuesta del bot."
            )

        return tracks

    except Exception as e:
        print(f"[VK MUSIC SEARCH ERROR]: {e}")
        raise HTTPException(status_code=500, detail=f"Error al realizar la búsqueda: {str(e)}")


@app.get("/download-track")
async def download_track(
    q: str = Query(..., description="Nombre de la canción original de búsqueda"),
    index: int = Query(1, ge=1, le=10, description="Índice de la canción seleccionada (1 al 10)")
):
    """
    Selecciona y descarga la canción correspondiente al índice indicado.
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
                
                # Botones inline
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

                # Comandos de texto (/1, /2, etc.)
                elif message.text and ("/" in message.text):
                    await telegram_client.send_message(BOT_USERNAME, f"/{index}")
                    await asyncio.sleep(3.5)
                    break

        if not audio_msg:
            async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=3):
                if message.audio:
                    audio_msg = message
                    break

        if not audio_msg:
            raise HTTPException(
                status_code=404,
                detail="No se encontró el audio o el bot tardó en responder."
            )

        file_name = audio_msg.audio.file_name or f"track_{index}.mp3"
        local_path = os.path.join("/tmp", file_name)

        downloaded_path = await telegram_client.download_media(audio_msg, file_name=local_path)

        return FileResponse(
            path=downloaded_path,
            filename=os.path.basename(downloaded_path),
            media_type="audio/mpeg"
        )

    except Exception as e:
        print(f"[VK MUSIC DOWNLOAD ERROR]: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar la descarga: {str(e)}")