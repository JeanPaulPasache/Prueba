import os
import httpx
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp

app = FastAPI(title="VK Music API", redirect_slashes=True)

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

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

async def search_piped(query: str):
    """Busca canciones usando instancias públicas de Piped"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        for instance in PIPED_INSTANCES:
            try:
                res = await client.get(f"{instance}/search", params={"q": query, "filter": "music_songs"})
                if res.status_code == 200:
                    data = res.json()
                    items = data.get("items", [])
                    results = []
                    for item in items[:10]:
                        if item.get("type") == "stream":
                            video_id = item.get("url", "").replace("/watch?v=", "")
                            results.append({
                                "id": video_id,
                                "title": item.get("title"),
                                "uploader": item.get("uploaderName") or "Desconocido",
                                "duration": item.get("duration"),
                                "webpage_url": f"https://www.youtube.com/watch?v={video_id}"
                            })
                    if results:
                        return results
            except Exception:
                continue
    return None

@app.get("/search")
async def search(q: str = Query(..., description="Término de búsqueda")):
    # 1. Intentar búsqueda vía Piped (libre de bloqueos de IP de datacenter)
    piped_results = await search_piped(q)
    if piped_results:
        return piped_results

    # 2. Respaldo vía yt-dlp
    ydl_opts = {
        'extract_flat': 'in_playlist',
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch5:{q}", download=False)
            results = []
            entries = info.get('entries', []) if info else []
            for entry in entries:
                if not entry:
                    continue
                results.append({
                    "id": entry.get("id"),
                    "title": entry.get("title"),
                    "uploader": entry.get("uploader") or entry.get("channel") or "Desconocido",
                    "duration": entry.get("duration"),
                    "webpage_url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id')}"
                })
            return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en la búsqueda: {str(e)}")

async def get_audio_from_piped(video_id: str):
    """Obtiene el enlace directo de audio usando Piped"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        for instance in PIPED_INSTANCES:
            try:
                res = await client.get(f"{instance}/streams/{video_id}")
                if res.status_code == 200:
                    data = res.json()
                    audio_streams = data.get("audioStreams", [])
                    if audio_streams:
                        best_stream = next(
                            (s for s in audio_streams if s.get("mimeType") == "audio/mp4"),
                            audio_streams[0]
                        )
                        return {
                            "title": data.get("title"),
                            "uploader": data.get("uploader"),
                            "duration": data.get("duration"),
                            "audio_url": best_stream.get("url")
                        }
            except Exception:
                continue
    return None

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL del video")):
    video_id = None
    if "v=" in url:
        video_id = url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url:
        video_id = url.split("youtu.be/")[1].split("?")[0]

    # 1. Intentar vía Piped
    if video_id:
        piped_data = await get_audio_from_piped(video_id)
        if piped_data:
            return piped_data

    # 2. Respaldo vía yt-dlp
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title"),
                "uploader": info.get("uploader"),
                "duration": info.get("duration"),
                "audio_url": info.get("url")
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener audio: {str(e)}")