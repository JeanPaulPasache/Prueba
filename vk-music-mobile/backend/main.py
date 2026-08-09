from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp

app = FastAPI(title="VK Music API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

@app.get("/search")
def search(q: str = Query(..., description="Término de búsqueda")):
    ydl_opts = {
        'extract_flat': True,
        'skip_download': True,
        'quiet': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(f"ytsearch5:{q}", download=False)
            results = []
            for entry in info.get('entries', []):
                results.append({
                    "id": entry.get("id"),
                    "title": entry.get("title"),
                    "uploader": entry.get("uploader"),
                    "duration": entry.get("duration"),
                    "webpage_url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id')}"
                })
            return results
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-audio")
def get_audio(url: str = Query(..., description="URL del video")):
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'quiet': True,
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
            raise HTTPException(status_code=500, detail=str(e))