import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp

app = FastAPI()

# Habilitar CORS para React Native / Expo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instancias públicas de Piped API
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.yt",
    "https://pipedapi.mha.fi",
    "https://piped-api.garudalinux.org"
]

async def get_audio_from_piped(video_id: str):
    """Intenta obtener el stream de audio desde instancias de Piped"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        for instance in PIPED_INSTANCES:
            try:
                res = await client.get(f"{instance}/streams/{video_id}")
                if res.status_code == 200:
                    data = res.json()
                    audio_streams = data.get("audioStreams", [])
                    if audio_streams:
                        # Preferir formato m4a/mp4 o tomar el primero disponible
                        best_stream = next(
                            (s for s in audio_streams if s.get("mimeType") == "audio/mp4"),
                            audio_streams[0]
                        )
                        return best_stream.get("url")
            except Exception:
                continue
    return None

@app.get("/get-audio")
async def get_audio(url: str):
    video_id = None

    # Extraer el ID del video de YouTube
    if "v=" in url:
        video_id = url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url:
        video_id = url.split("youtu.be/")[1].split("?")[0]

    # 1. Intentar vía Piped API (Especialmente útil para servidores en la nube)
    if video_id:
        audio_url = await get_audio_from_piped(video_id)
        if audio_url:
            return {"audio_url": audio_url}

    # 2. Respaldo vía yt-dlp (si hay cookies configuradas)
    cookie_path = "/etc/secrets/youtube_cookies.txt"
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
    }
    if os.path.exists(cookie_path):
        ydl_opts['cookiefile'] = cookie_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {"audio_url": info.get('url')}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo extraer el audio de YouTube: {str(e)}"
        )