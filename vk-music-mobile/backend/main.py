import httpx
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="VK Music API", redirect_slashes=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instancias públicas de respaldo para Piped e Invidious
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.yt",
    "https://pipedapi.mha.fi",
    "https://pipedapi.rh2.kavin.rocks"
]

INVIDIOUS_INSTANCES = [
    "https://invidious.nerdvpn.de",
    "https://inv.tux.pizza",
    "https://invidious.drgns.space",
    "https://vid.puffyan.us",
    "https://invidious.projectsegfau.lt"
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

@app.get("/search")
async def search(q: str = Query(..., description="Término de búsqueda")):
    async with httpx.AsyncClient(timeout=6.0, headers=HEADERS, follow_redirects=True) as client:
        # 1. Intentar búsqueda con Piped
        for instance in PIPED_INSTANCES:
            try:
                res = await client.get(f"{instance}/search", params={"q": q, "filter": "music_songs"})
                if res.status_code == 200:
                    items = res.json().get("items", [])
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
            except Exception as e:
                print(f"[SEARCH ERROR] Piped ({instance}): {e}")

        # 2. Intentar búsqueda con Invidious
        for instance in INVIDIOUS_INSTANCES:
            try:
                res = await client.get(f"{instance}/api/v1/search", params={"q": q, "type": "video"})
                if res.status_code == 200:
                    items = res.json()
                    if isinstance(items, list):
                        results = []
                        for item in items[:10]:
                            results.append({
                                "id": item.get("videoId"),
                                "title": item.get("title"),
                                "uploader": item.get("author") or "Desconocido",
                                "duration": item.get("lengthSeconds"),
                                "webpage_url": f"https://www.youtube.com/watch?v={item.get('videoId')}"
                            })
                        if results:
                            return results
            except Exception as e:
                print(f"[SEARCH ERROR] Invidious ({instance}): {e}")

    raise HTTPException(
        status_code=500,
        detail="No se pudo obtener resultados de búsqueda de las fuentes disponibles."
    )

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL del video")):
    video_id = None
    if "v=" in url:
        video_id = url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url:
        video_id = url.split("youtu.be/")[1].split("?")[0]

    async with httpx.AsyncClient(timeout=8.0, headers=HEADERS, follow_redirects=True) as client:
        # 1. Intentar con Cobalt API
        try:
            res = await client.post(
                "https://api.cobalt.tools/api/json",
                json={"url": url, "downloadMode": "audio", "audioFormat": "mp3"},
                headers={"Accept": "application/json", "Content-Type": "application/json", **HEADERS}
            )
            if res.status_code == 200:
                data = res.json()
                audio_url = data.get("url")
                if audio_url:
                    return {
                        "title": "Audio Track",
                        "uploader": "YouTube",
                        "duration": 0,
                        "audio_url": audio_url
                    }
        except Exception as e:
            print(f"[AUDIO ERROR] Cobalt: {e}")

        # 2. Intentar con Piped Streams
        if video_id:
            for instance in PIPED_INSTANCES:
                try:
                    res = await client.get(f"{instance}/streams/{video_id}")
                    if res.status_code == 200:
                        data = res.json()
                        audio_streams = data.get("audioStreams", [])
                        if audio_streams:
                            best = next((s for s in audio_streams if s.get("mimeType") == "audio/mp4"), audio_streams[0])
                            return {
                                "title": data.get("title"),
                                "uploader": data.get("uploader"),
                                "duration": data.get("duration"),
                                "audio_url": best.get("url")
                            }
                except Exception as e:
                    print(f"[AUDIO ERROR] Piped ({instance}): {e}")

        # 3. Intentar con Invidious Streams
        if video_id:
            for instance in INVIDIOUS_INSTANCES:
                try:
                    res = await client.get(f"{instance}/api/v1/videos/{video_id}")
                    if res.status_code == 200:
                        data = res.json()
                        adaptive = data.get("adaptiveFormats", [])
                        audio_streams = [f for f in adaptive if "audio" in f.get("type", "")]
                        if audio_streams:
                            return {
                                "title": data.get("title"),
                                "uploader": data.get("author"),
                                "duration": data.get("lengthSeconds"),
                                "audio_url": audio_streams[0].get("url")
                            }
                except Exception as e:
                    print(f"[AUDIO ERROR] Invidious ({instance}): {e}")

    raise HTTPException(
        status_code=500,
        detail="No se pudo extraer el stream de audio."
    )