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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

async def fetch_dynamic_invidious_instances():
    """Obtiene instancias saludables desde el registro oficial de Invidious"""
    try:
        async with httpx.AsyncClient(timeout=4.0, headers=HEADERS) as client:
            res = await client.get("https://api.invidious.io/instances.json?sort_by=health")
            if res.status_code == 200:
                data = res.json()
                healthy = []
                for domain, info in data:
                    if info.get("type") == "https" and info.get("api") and info.get("health"):
                        try:
                            if float(info.get("health", 0)) > 70:
                                healthy.append(info.get("uri"))
                        except (ValueError, TypeError):
                            continue
                if healthy:
                    return healthy[:5]
    except Exception as e:
        print(f"[INSTANCES ERROR]: {e}")
    return []

async def search_itunes_fallback(query: str):
    """Respaldo de búsqueda ultra estable usando la API pública de iTunes"""
    try:
        async with httpx.AsyncClient(timeout=5.0, headers=HEADERS) as client:
            res = await client.get("https://itunes.apple.com/search", params={"term": query, "media": "music", "limit": 10})
            if res.status_code == 200:
                results = []
                for item in res.json().get("results", []):
                    artist = item.get("artistName", "Desconocido")
                    track = item.get("trackName", "Sin título")
                    search_term = f"{artist} - {track}"
                    results.append({
                        "id": f"yt_{search_term}",
                        "title": track,
                        "uploader": artist,
                        "duration": int(item.get("trackTimeMillis", 0) / 1000),
                        "webpage_url": f"https://www.youtube.com/results?search_query={httpx.QueryParams({'q': search_term})['q']}"
                    })
                return results
    except Exception as e:
        print(f"[ITUNES SEARCH ERROR]: {e}")
    return []

@app.get("/search")
async def search(q: str = Query(..., description="Término de búsqueda")):
    # 1. Obtener instancias activas de Invidious en tiempo real
    instances = await fetch_dynamic_invidious_instances()
    
    async with httpx.AsyncClient(timeout=6.0, headers=HEADERS, follow_redirects=True) as client:
        for instance in instances:
            try:
                res = await client.get(f"{instance}/api/v1/search", params={"q": q, "type": "video"})
                if res.status_code == 200:
                    items = res.json()
                    if isinstance(items, list) and len(items) > 0:
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
                print(f"[SEARCH ERROR] {instance}: {e}")

    # 2. Respaldo directo a iTunes si las instancias de YouTube fallan
    itunes_results = await search_itunes_fallback(q)
    if itunes_results:
        return itunes_results

    raise HTTPException(status_code=500, detail="No se pudieron obtener resultados de búsqueda.")

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL del video")):
    # Si la URL proviene de una búsqueda de iTunes, extraer mediante consulta general a Cobalt
    target_url = url
    if "youtube.com/results" in url:
        query_str = url.split("search_query=")[-1]
        target_url = f"https://www.youtube.com/watch?v={query_str}"

    async with httpx.AsyncClient(timeout=8.0, headers=HEADERS, follow_redirects=True) as client:
        # 1. Probar con la API de Cobalt
        try:
            res = await client.post(
                "https://api.cobalt.tools/api/json",
                json={"url": target_url, "downloadMode": "audio", "audioFormat": "mp3"},
                headers={"Accept": "application/json", "Content-Type": "application/json", **HEADERS}
            )
            if res.status_code == 200:
                data = res.json()
                audio_url = data.get("url")
                if audio_url:
                    return {
                        "title": "Audio Stream",
                        "uploader": "Artista",
                        "duration": 0,
                        "audio_url": audio_url
                    }
        except Exception as e:
            print(f"[AUDIO ERROR] Cobalt: {e}")

        # 2. Probar con instancias vivas de Invidious
        video_id = None
        if "v=" in target_url:
            video_id = target_url.split("v=")[1].split("&")[0]

        if video_id:
            instances = await fetch_dynamic_invidious_instances()
            for instance in instances:
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

    raise HTTPException(status_code=500, detail="No se pudo extraer el enlace de audio.")