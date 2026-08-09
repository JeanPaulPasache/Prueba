import os
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

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

async def get_healthy_invidious_instances():
    """Obtiene instancias activas y saludables de Invidious desde el registro oficial"""
    url = "https://api.invidious.io/instances.json?sort_by=type,health"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                instances = []
                for domain, info in data:
                    # Filtrar instancias que soportan API y tienen buen estado
                    if info.get("type") == "https" and info.get("api") and info.get("health") and float(info.get("health", 0)) > 80:
                        instances.append(info.get("uri"))
                return instances[:5] # Devolver las 5 mejores
    except Exception:
        pass
    
    # Lista de respaldo fija si falla la consulta dinámica
    return [
        "https://invidious.nerdvpn.de",
        "https://inv.tux.pizza",
        "https://invidious.drgns.space",
        "https://vid.puffyan.us"
    ]

@app.get("/search")
async def search(q: str = Query(..., description="Término de búsqueda")):
    instances = await get_healthy_invidious_instances()
    
    async with httpx.AsyncClient(timeout=8.0) as client:
        for instance in instances:
            try:
                url = f"{instance}/api/v1/search"
                res = await client.get(url, params={"q": q, "type": "video"})
                if res.status_code == 200:
                    items = res.json()
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

    raise HTTPException(status_code=500, detail="No se pudieron obtener resultados de búsqueda")

async def get_audio_from_cobalt(video_url: str):
    """Obtiene el audio usando la API de Cobalt.tools como respaldo de alta velocidad"""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.post(
                "https://api.cobalt.tools/api/json",
                json={
                    "url": video_url,
                    "downloadMode": "audio",
                    "audioFormat": "mp3"
                },
                headers={"Accept": "application/json", "Content-Type": "application/json"}
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("status") in ["stream", "redirect"]:
                    return data.get("url")
    except Exception:
        pass
    return None

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL del video")):
    video_id = None
    if "v=" in url:
        video_id = url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url:
        video_id = url.split("youtu.be/")[1].split("?")[0]

    # 1. Intentar con instancias saludables de Invidious
    if video_id:
        instances = await get_healthy_invidious_instances()
        async with httpx.AsyncClient(timeout=8.0) as client:
            for instance in instances:
                try:
                    res = await client.get(f"{instance}/api/v1/videos/{video_id}")
                    if res.status_code == 200:
                        data = res.json()
                        adaptive_formats = data.get("adaptiveFormats", [])
                        # Buscar streams de audio
                        audio_streams = [f for f in adaptive_formats if "audio" in f.get("type", "")]
                        if audio_streams:
                            # Elegir el mejor stream de audio
                            best_audio = audio_streams[0]
                            return {
                                "title": data.get("title"),
                                "uploader": data.get("author"),
                                "duration": data.get("lengthSeconds"),
                                "audio_url": best_audio.get("url")
                            }
                except Exception:
                    continue

    # 2. Respaldo directo mediante la API de Cobalt
    cobalt_url = await get_audio_from_cobalt(url)
    if cobalt_url:
        return {
            "title": "Audio Stream",
            "uploader": "YouTube",
            "duration": 0,
            "audio_url": cobalt_url
        }

    raise HTTPException(status_code=500, detail="No se pudo extraer el enlace de audio de YouTube")