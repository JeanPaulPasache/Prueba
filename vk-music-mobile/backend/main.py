import re
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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
}

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

async def fetch_dynamic_invidious_instances():
    try:
        async with httpx.AsyncClient(timeout=4.0, headers=HEADERS) as client:
            res = await client.get("https://api.invidious.io/instances.json?sort_by=health")
            if res.status_code == 200:
                healthy = []
                for domain, info in res.json():
                    if info.get("type") == "https" and info.get("api") and info.get("health"):
                        try:
                            if float(info.get("health", 0)) > 70:
                                healthy.append(info.get("uri"))
                        except (ValueError, TypeError):
                            continue
                if healthy:
                    return healthy[:5]
    except Exception:
        pass
    return []

async def search_itunes_fallback(query: str):
    try:
        async with httpx.AsyncClient(timeout=5.0, headers=HEADERS) as client:
            res = await client.get("https://itunes.apple.com/search", params={"term": query, "media": "music", "limit": 10})
            if res.status_code == 200:
                results = []
                for item in res.json().get("results", []):
                    artist = item.get("artistName", "Desconocido")
                    track = item.get("trackName", "Sin título")
                    search_term = f"{artist} {track}"
                    results.append({
                        "id": search_term,
                        "title": track,
                        "uploader": artist,
                        "duration": int(item.get("trackTimeMillis", 0) / 1000),
                        "webpage_url": f"https://www.youtube.com/watch?v={httpx.QueryParams({'q': search_term})['q']}"
                    })
                return results
    except Exception:
        pass
    return []

@app.get("/search")
async def search(q: str = Query(..., description="Término de búsqueda")):
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
            except Exception:
                continue

    itunes_results = await search_itunes_fallback(q)
    if itunes_results:
        return itunes_results

    raise HTTPException(status_code=500, detail="No se pudieron obtener resultados de búsqueda.")

async def extract_audio_y2mate(video_id: str):
    """Extrae el enlace directo MP3/M4A usando la API pública de Y2Mate"""
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=HEADERS, follow_redirects=True) as client:
            # Step 1: Analyze Video
            analyze_url = "https://www.y2mate.com/mates/analyzeV2/ajax"
            payload = {"k_query": f"https://www.youtube.com/watch?v={video_id}", "k_page": "home", "hl": "es", "q_auto": 0}
            res = await client.post(analyze_url, data=payload)
            if res.status_code == 200:
                data = res.json()
                links = data.get("links", {}).get("mp3", {})
                
                # Seleccionar la clave de conversión de la mejor calidad
                auto_key = None
                for quality in ["auto", "128", "320", "192"]:
                    if quality in links:
                        auto_key = links[quality].get("k")
                        break
                
                if not auto_key and links:
                    first_item = list(links.values())[0]
                    auto_key = first_item.get("k")

                if auto_key:
                    # Step 2: Convert Key to Direct Link
                    convert_url = "https://www.y2mate.com/mates/convertV2/index"
                    conv_payload = {"vid": video_id, "k": auto_key}
                    conv_res = await client.post(convert_url, data=conv_payload)
                    if conv_res.status_code == 200:
                        c_data = conv_res.json()
                        d_link = c_data.get("dlink")
                        if d_link:
                            return {
                                "title": data.get("title", "Audio Stream"),
                                "uploader": "Y2Mate Engine",
                                "duration": 0,
                                "audio_url": d_link
                            }
    except Exception as e:
        print(f"[Y2MATE ERROR]: {e}")
    return None

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL del video")):
    # Extraer ID del video
    video_id = None
    if "v=" in url:
        video_id = url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url:
        video_id = url.split("youtu.be/")[1].split("?")[0]
    else:
        # Extraer mediante búsqueda si el ID no es explícito
        video_id = url.replace("https://www.youtube.com/watch?v=", "")

    # 1. Intentar extracción rápida con Y2Mate
    if video_id and len(video_id) == 11:
        y2mate_data = await extract_audio_y2mate(video_id)
        if y2mate_data:
            return y2mate_data

    # 2. Respaldo a través de proxies Invidious de audio
    if video_id:
        instances = await fetch_dynamic_invidious_instances()
        async with httpx.AsyncClient(timeout=8.0, headers=HEADERS, follow_redirects=True) as client:
            for instance in instances:
                try:
                    res = await client.get(f"{instance}/api/v1/videos/{video_id}")
                    if res.status_code == 200:
                        data = res.json()
                        adaptive = data.get("adaptiveFormats", [])
                        audio_streams = [f for f in adaptive if "audio" in f.get("type", "")]
                        if audio_streams:
                            # Utilizar el proxy propio de la instancia de Invidious para saltar el bloqueo de IP móvil
                            stream_url = audio_streams[0].get("url")
                            if not stream_url.startswith("http"):
                                stream_url = f"{instance}{stream_url}"
                            return {
                                "title": data.get("title"),
                                "uploader": data.get("author"),
                                "duration": data.get("lengthSeconds"),
                                "audio_url": stream_url
                            }
                except Exception:
                    continue

    raise HTTPException(status_code=500, detail="No se pudo extraer el enlace directo de audio.")