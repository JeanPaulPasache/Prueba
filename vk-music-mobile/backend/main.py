import os
import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pyrogram import Client

app = FastAPI(title="VK Music Downloader API")

# Obtener credenciales desde las variables de entorno de Render
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING", "")

# Inicialización del cliente de Telegram usando la sesión en memoria
telegram_client = Client(
    "render_vk_session",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING,
    in_memory=True
)

BOT_USERNAME = "vkm_bot"

@app.on_event("startup")
async def startup():
    if not SESSION_STRING:
        print("[WARNING]: TELEGRAM_SESSION_STRING no está configurada.")
    else:
        await telegram_client.start()
        print("[TELEGRAM]: Cliente conectado exitosamente a Telegram en Render.")

@app.on_event("shutdown")
async def shutdown():
    if telegram_client.is_connected:
        await telegram_client.stop()

@app.get("/download-track")
async def download_track(q: str = Query(..., description="Nombre de la canción o Artista - Canción")):
    if not q.strip():
        raise HTTPException(status_code=400, detail="El parámetro de búsqueda no puede estar vacío.")

    try:
        # 1. Marcar como leídos los mensajes anteriores para evitar conflictos
        await telegram_client.read_chat_history(BOT_USERNAME)

        # 2. Enviar el nombre de la canción al bot de VK Music
        await telegram_client.send_message(BOT_USERNAME, q)

        # 3. Esperar la respuesta inicial del bot
        await asyncio.sleep(2.5)

        audio_msg = None

        # Revisar los últimos mensajes para ver si devolvió el archivo o la lista de opciones
        async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=5):
            if message.from_user and message.from_user.username.lower() == BOT_USERNAME.lower():
                
                # Caso A: El bot devolvió el archivo de audio directamente
                if message.audio:
                    audio_msg = message
                    break
                
                # Caso B: El bot devolvió una lista con botones Inline
                elif message.reply_markup and message.reply_markup.inline_keyboard:
                    first_button = message.reply_markup.inline_keyboard[0][0]
                    if first_button.callback_data:
                        await telegram_client.request_callback_answer(
                            chat_id=BOT_USERNAME,
                            message_id=message.id,
                            callback_data=first_button.callback_data
                        )
                        await asyncio.sleep(3.0)  # Esperar a que envíe el audio tras pulsar el botón
                        break
                
                # Caso C: El bot devolvió comandos de texto (ej. /1, /2)
                elif message.text and ("/" in message.text):
                    await telegram_client.send_message(BOT_USERNAME, "/1")
                    await asyncio.sleep(3.0)
                    break

        # Si interactuamos con botones/comandos, buscamos el mensaje de audio recién recibido
        if not audio_msg:
            async for message in telegram_client.get_chat_history(BOT_USERNAME, limit=3):
                if message.audio:
                    audio_msg = message
                    break

        if not audio_msg:
            raise HTTPException(
                status_code=404, 
                detail="No se encontró el audio o el bot de Telegram no respondió a tiempo."
            )

        # 4. Descargar el MP3 a la carpeta /tmp del servidor Render
        file_name = audio_msg.audio.file_name or f"{q.replace(' ', '_')}.mp3"
        local_path = os.path.join("/tmp", file_name)

        downloaded_path = await telegram_client.download_media(audio_msg, file_name=local_path)

        # 5. Entregar el archivo .mp3 a la app móvil para guardarlo localmente
        return FileResponse(
            path=downloaded_path,
            filename=os.path.basename(downloaded_path),
            media_type="audio/mpeg"
        )

    except Exception as e:
        print(f"[VK MUSIC ERROR]: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar la descarga: {str(e)}")