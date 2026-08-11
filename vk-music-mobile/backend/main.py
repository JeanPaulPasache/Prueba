import os
import re
import asyncio
import secrets
import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel
from pyrogram import Client
import google.generativeai as genai

app = FastAPI(title="VK Music Downloader API")

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING", "")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
MY_BOT_USERNAME = os.getenv("MY_BOT_USERNAME", "")

# Render inyecta esta variable automáticamente en servicios web.
# Si no existe, cae a WEBHOOK_URL manual (debe ser https y público).
PUBLIC_URL = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("WEBHOOK_URL", "")
WEBHOOK_PATH = "/telegram-webhook"
# Token secreto para validar que el webhook realmente viene de Telegram.
WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET") or secrets.token_urlsafe(32)

telegram_client = Client(
    "render_vk_session",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING,
    in_memory=True
)

BOT_USERNAME = "vkmusic_bot"

# file_unique_id -> asyncio.Future que se resuelve cuando el webhook recibe
# ese mismo archivo desde la Bot API. file_unique_id es idéntico entre
# Pyrogram (MTProto) y la Bot API, así que sirve como clave de correlación
# segura incluso con varias descargas en paralelo.
pending_files: dict[str, "asyncio.Future[dict]"] = {}


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

    if BOT_TOKEN and PUBLIC_URL:
        webhook_url = f"{PUBLIC_URL.rstrip('/')}{WEBHOOK_PATH}"
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                params={
                    "url": webhook_url,
                    "secret_token": WEBHOOK_SECRET,
                    "drop_pending_updates": "true",
                    "allowed_updates": '["message","channel_post"]',
                },
            )
            print(f"[TELEGRAM WEBHOOK]: {res.json()}")
    else:
        print("[WARNING]: BOT_TOKEN o PUBLIC_URL no configurados; el webhook no se registró.")


@app.on_event("shutdown")
async def shutdown():
    if telegram_client.is_connected:
        await telegram_client.stop()


@app.post(WEBHOOK_PATH)
async def telegram_webhook(request: Request):
    """
    Telegram empuja acá cada update de MY_BOT_USERNAME. Cuando llega un
    audio/documento cuyo file_unique_id coincide con una descarga que
    estamos esperando, resolvemos su Future con el file_id de la Bot API.
    """
    secret_header = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if secret_header != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Token de webhook inválido.")

    update = await request.json()
    msg = update.get("message") or update.get("channel_post") or {}
    media_obj = msg.get("audio") or msg.get("document")

    if media_obj and "file_unique_id" in media_obj:
        fut = pending_files.get(media_obj["file_unique_id"])
        if fut and not fut.done():
            fut.set_result(media_obj)

    return {"ok": True}


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

    if not BOT_TOKEN or not PUBLIC_URL:
        raise HTTPException(
            status_code=500,
            detail="Falta configurar TELEGRAM_BOT_TOKEN o RENDER_EXTERNAL_URL/WEBHOOK_URL para el webhook."
        )

    try:
        await telegram_client.read_chat_history(BOT_USERNAME)
        await telegram_client.send_message(BOT_USERNAME, f"/song {q.strip()}")
        await asyncio.sleep(2.5)

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

        audio_msg = None
        async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=3):
            if message.audio:
                audio_msg = message
                break

        if not audio_msg:
            raise HTTPException(status_code=404, detail="No se encontró el audio de la canción.")

        # Registramos un Future ANTES de reenviar, para no perder el update
        # si llega muy rápido (evita la condición de carrera).
        file_unique_id = audio_msg.audio.file_unique_id
        loop = asyncio.get_event_loop()
        fut: "asyncio.Future[dict]" = loop.create_future()
        pending_files[file_unique_id] = fut

        try:
            # Reenviar audio a tu Bot
            await telegram_client.forward_messages(MY_BOT_USERNAME, BOT_USERNAME, audio_msg.id)

            try:
                media_obj = await asyncio.wait_for(fut, timeout=15)
            except asyncio.TimeoutError:
                raise HTTPException(
                    status_code=504,
                    detail="Timeout esperando el webhook de Telegram. Verifica que el webhook esté "
                           "registrado correctamente (revisa el log [TELEGRAM WEBHOOK] al iniciar)."
                )
        finally:
            pending_files.pop(file_unique_id, None)

        bot_api_file_id = media_obj["file_id"]

        async with httpx.AsyncClient() as client:
            file_res = await client.get(
                f"https://api.telegram.org/bot{BOT_TOKEN}/getFile",
                params={"file_id": bot_api_file_id}
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

    except HTTPException:
        raise
    except Exception as e:
        print(f"[VK MUSIC URL ERROR]: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener la URL: {str(e)}")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


async def translate_lyrics_with_ai(lrc_text: str) -> str:
    """Traduce las líneas del formato .LRC manteniendo intactas las marcas de tiempo [mm:ss.xx]."""
    if not GEMINI_API_KEY:
        return lrc_text

    prompt = f"""
Eres un traductor de canciones. Traduce el siguiente texto .LRC al español.
REGLAS:
1. MANTÉN intactas las marcas de tiempo [mm:ss.xx] al inicio de cada línea.
2. Si el idioma ya es español, devuelve el texto tal cual.
3. Responde ÚNICAMENTE con el formato LRC traducido, sin explicaciones ni markdown.

Texto LRC:
{lrc_text}
"""
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = await model.generate_content_async(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"[TRANSLATE ERROR]: {e}")
        return lrc_text


@app.get("/get-lyrics")
async def get_lyrics(
    track_name: str = Query(..., description="Nombre del tema"),
    artist_name: str = Query("", description="Nombre del artista"),
    duration: int = Query(0, description="Duración en segundos"),
    translate: bool = Query(False, description="Traducir al español")
):
    url = "https://lrclib.net/api/get"
    params = {
        "track_name": track_name,
        "artist_name": artist_name,
        "duration": duration
    }

    lyrics_data = None
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params)
        if res.status_code == 200:
            lyrics_data = res.json()
        else:
            # Fallback: Búsqueda abierta si la coincidencia exacta falla
            search_res = await client.get(
                "https://lrclib.net/api/search",
                params={"q": f"{track_name} {artist_name}".strip()}
            )
            if search_res.status_code == 200 and search_res.json():
                lyrics_data = search_res.json()[0]

    if not lyrics_data:
        raise HTTPException(status_code=404, detail="No se encontraron letras para esta canción.")

    synced_lyrics = lyrics_data.get("syncedLyrics")
    translated_lyrics = None

    if synced_lyrics and translate:
        translated_lyrics = await translate_lyrics_with_ai(synced_lyrics)

    return {
        "syncedLyrics": synced_lyrics,
        "translatedLyrics": translated_lyrics,
        "plainLyrics": lyrics_data.get("plainLyrics")
    }