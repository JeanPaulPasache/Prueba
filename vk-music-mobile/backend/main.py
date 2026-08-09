from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp

app = FastAPI(title="VK Music API", redirect_slashes=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración base de yt-dlp para simular un cliente móvil nativo
YDL_COMMON_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'extractor_args': {
        'youtube': {
            'player_client': ['ios', 'android', 'mweb']
        }
    }
}

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

@app.get("/search")
def search(q: str = Query(..., description="Término de búsqueda")):
    ydl_opts = {
        **YDL_COMMON_OPTS,
        'extract_flat': 'in_playlist',
        'skip_download': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
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
            print(f"Error en /search: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error en la búsqueda: {str(e)}")

@app.get("/get-audio")
def get_audio(url: str = Query(..., description="URL del video")):
    ydl_opts = {
        **YDL_COMMON_OPTS,
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title"),
                "uploader": info.get("uploader"),
                "duration": info.get("duration"),
                "audio_url": info.get("url")
            }
        except Exception as e:
            print(f"Error en /get-audio: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error al obtener audio: {str(e)}")