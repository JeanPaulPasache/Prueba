import re
import json
import httpx
import urllib.parse
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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Lista de instancias Piped estables
PIPED_INSTANCES = [
    "https://api.piped.privacydev.net",
    "https://pipedapi.palvelu.net",
    "https://pipedapi.mha.fi",
    "https://piped-api.garudalinux.org",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.kavin.rocks"
]

# Lista de instancias Invidious estables
INVIDIOUS_INSTANCES = [
    "https://invidious.nerdvpn.de",
    "https://inv.tux.pizza",
    "https://invidious.projectsegfau.lt",
    "https://invidious.privacydev.net",
    "https://inv.in.projectsegfau.lt",
    "https://invidious.drgns.space"
]

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API activa"}

def extract_youtube_id(text: str) -> str | None:
    if not text:
        return None
    unquoted = urllib.parse.unquote(urllib.parse.unquote(text)).strip()
    
    if re.match(r'^[a-zA-Z0-9_-]{11}$', unquoted):
        return unquoted
        
    match = re.search(r'(?:v=|/v/|embed/|youtu\.be/|/shorts/)([a-zA-Z0-9_-]{11})', unquoted)
    if match:
        return match.group(1)
        
    return None

def parse_yt_initial_data(html: str):
    results = []
    try:
        match = re.search(r'ytInitialData\s*=\s*({.*?});</script>', html)
        if not match:
            match = re.search(r'var ytInitialData\s*=\s*({.*?});', html)
        if match:
            data = json.loads(match.group(1))
            contents = data.get("contents", {}).get("twoColumnSearchResultsRenderer", {}).get("primaryContents", {}).get("sectionListRenderer", {}).get("contents", [])
            for section in contents:
                item_section = section.get("itemSectionRenderer", {}).get("contents", [])
                for item in item_section:
                    video = item.get("videoRenderer")
                    if video and "videoId" in video:
                        v_id = video["videoId"]
                        title = video.get("title", {}).get("runs", [{}])[0].get("text", "Sin título")
                        uploader = video.get("ownerText", {}).get("runs", [{}])[0].get("text", "Desconocido")
                        duration_text = video.get("lengthText", {}).get("simpleText", "0:00")
                        
                        parts = duration_text.split(":")
                        duration_sec = 0
                        try:
                            if len(parts) == 2:
                                duration_sec = int(parts[0]) * 60 + int(parts[1])
                            elif len(parts) == 3:
                                duration_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                        except ValueError:
                            duration_sec = 0
                            
                        results.append({
                            "id": v_id,
                            "title": title,
                            "uploader": uploader,
                            "duration": duration_sec,
                            "webpage_url": f"https://www.youtube.com/watch?v={v_id}"
                        })
    except Exception as e:
        print(f"[YT PARSE ERROR]: {e}")
    return results

async def search_youtube_direct(query: str):
    search_term = query
    if "search_query=" in query:
        search_term = query.split("search_query=")[-1]
    search_term = urllib.parse.unquote(urllib.parse.unquote(search_term))

    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_term)}"
    async with httpx.AsyncClient(timeout=7.0, headers=HEADERS, follow_redirects=True, verify=False) as client:
        try:
            res = await client.get(url)
            if res.status_code == 200:
                parsed = parse_yt_initial_data(res.text)
                if parsed:
                    return parsed
                raw_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', res.text)
                unique_ids = []
                for vid in raw_ids:
                    if vid not in unique_ids:
                        unique_ids.append(vid)
                if unique_ids:
                    return [{
                        "id": vid,
                        "title": f"YouTube Video ({vid})",
                        "uploader": "YouTube",
                        "duration": 0,
                        "webpage_url": f"https://www.youtube.com/watch?v={vid}"
                    } for vid in unique_ids[:10]]
        except Exception as e:
            print(f"[DIRECT YT SEARCH ERROR]: {e}")
    return []

async def fetch_dynamic_invidious_instances():
    try:
        async with httpx.AsyncClient(timeout=4.0, headers={"User-Agent": HEADERS["User-Agent"]}, verify=False) as client:
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
    return INVIDIOUS_INSTANCES

async def search_itunes_fallback(query: str):
    try:
        async with httpx.AsyncClient(timeout=5.0, headers={"User-Agent": HEADERS["User-Agent"]}, verify=False) as client:
            res = await client.get("https://itunes.apple.com/search", params={"term": query, "media": "music", "limit": 10})
            if res.status_code == 200:
                results = []
                for item in res.json().get("results", []):
                    artist = item.get("artistName", "Desconocido")
                    track = item.get("trackName", "Sin título")
                    search_term = f"{artist} - {track}"
                    results.append({
                        "id": search_term,
                        "title": track,
                        "uploader": artist,
                        "duration": int(item.get("trackTimeMillis", 0) / 1000),
                        "webpage_url": f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_term)}"
                    })
                return results
    except Exception:
        pass
    return []

@app.get("/search")
async def search(q: str = Query(..., description="Término de búsqueda")):
    yt_results = await search_youtube_direct(q)
    if yt_results:
        return yt_results

    instances = await fetch_dynamic_invidious_instances()
    async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": HEADERS["User-Agent"]}, follow_redirects=True, verify=False) as client:
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

async def resolve_video_id(query_or_url: str) -> str | None:
    direct_id = extract_youtube_id(query_or_url)
    if direct_id:
        return direct_id

    yt_results = await search_youtube_direct(query_or_url)
    if yt_results and yt_results[0].get("id"):
        return yt_results[0]["id"]

    clean_query = urllib.parse.unquote(urllib.parse.unquote(query_or_url))
    if "search_query=" in clean_query:
        clean_query = clean_query.split("search_query=")[-1]

    async with httpx.AsyncClient(timeout=5.0, headers={"User-Agent": HEADERS["User-Agent"]}, verify=False) as client:
        for p_inst in PIPED_INSTANCES:
            try:
                piped_res = await client.get(f"{p_inst}/search", params={"q": clean_query, "filter": "videos"})
                if piped_res.status_code == 200:
                    items = piped_res.json().get("items", [])
                    if items:
                        raw_url = items[0].get("url", "")
                        pipe_id = extract_youtube_id(raw_url)
                        if pipe_id:
                            return pipe_id
            except Exception:
                continue

    return None

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL o término de búsqueda del video")):
    video_id = await resolve_video_id(url)

    if not video_id:
        raise HTTPException(status_code=400, detail="No se pudo resolver un ID de video válido para la solicitud.")

    target_youtube_url = f"https://www.youtube.com/watch?v={video_id}"

    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": HEADERS["User-Agent"]}, follow_redirects=True, verify=False) as client:
        # 1. Extracción vía API oficial de Cobalt v10 con encabezados de origen
        try:
            cobalt_headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": HEADERS["User-Agent"],
                "Origin": "https://cobalt.tools",
                "Referer": "https://cobalt.tools/"
            }
            payload = {
                "url": target_youtube_url,
                "downloadMode": "audio",
                "audioFormat": "mp3"
            }
            res = await client.post("https://api.cobalt.tools/", json=payload, headers=cobalt_headers)
            if res.status_code in [200, 201]:
                data = res.json()
                audio_url = data.get("url")
                if audio_url:
                    return {
                        "title": "Audio Stream",
                        "uploader": "VK Engine",
                        "duration": 0,
                        "audio_url": audio_url
                    }
        except Exception as e:
            print(f"[COBALT ERROR]: {e}")

        # 2. Respaldo iterativo en múltiples servidores de Piped API
        for p_inst in PIPED_INSTANCES:
            try:
                piped_stream_res = await client.get(f"{p_inst}/streams/{video_id}")
                if piped_stream_res.status_code == 200:
                    stream_data = piped_stream_res.json()
                    audio_streams = stream_data.get("audioStreams", [])
                    if audio_streams:
                        return {
                            "title": stream_data.get("title", "Audio Stream"),
                            "uploader": stream_data.get("uploader", "VK Engine"),
                            "duration": stream_data.get("duration", 0),
                            "audio_url": audio_streams[0].get("url")
                        }
            except Exception as e:
                print(f"[PIPED STREAM ERROR] {p_inst}: {e}")

        # 3. Respaldo iterativo en instancias de Invidious (con SSL Bypass)
        instances = await fetch_dynamic_invidious_instances()
        for instance in instances:
            try:
                res = await client.get(f"{instance}/api/v1/videos/{video_id}")
                if res.status_code == 200:
                    data = res.json()
                    adaptive = data.get("adaptiveFormats", [])
                    audio_streams = [f for f in adaptive if "audio" in f.get("type", "")]
                    if audio_streams:
                        stream_url = audio_streams[0].get("url")
                        if not stream_url.startswith("http"):
                            stream_url = f"{instance}{stream_url}"
                        return {
                            "title": data.get("title"),
                            "uploader": data.get("author"),
                            "duration": data.get("lengthSeconds"),
                            "audio_url": stream_url
                        }
            except Exception as e:
                print(f"[INVIDIOUS AUDIO ERROR] {instance}: {e}")

    raise HTTPException(status_code=500, detail="No se pudo extraer el enlace de audio para este video.")