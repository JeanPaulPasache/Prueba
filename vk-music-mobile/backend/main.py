import re
import json
import httpx
import asyncio
import urllib.parse
import os
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

RENDER_SECRET_COOKIE = "/etc/secrets/cookies.txt"
LOCAL_COOKIE = os.path.join(os.path.dirname(__file__), "cookies.txt")
CLEAN_COOKIE_FILE = "/tmp/cookies_sanitized.txt"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}

def sanitize_and_get_cookie_path() -> str | None:
    """Busca el archivo de cookies y arregla los tabuladores en /tmp si Render los convirtió en espacios."""
    raw_path = None
    if os.path.exists(RENDER_SECRET_COOKIE):
        raw_path = RENDER_SECRET_COOKIE
    elif os.path.exists(LOCAL_COOKIE):
        raw_path = LOCAL_COOKIE

    if not raw_path:
        return None

    try:
        with open(raw_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        cleaned_lines = []
        has_netscape_header = False

        # Verificar encabezado
        for line in lines:
            if line.strip().startswith("# Netscape") or line.strip().startswith("# HTTP Cookie"):
                has_netscape_header = True
                break

        if not has_netscape_header:
            cleaned_lines.append("# Netscape HTTP Cookie File\n")

        # Reemplazar múltiples espacios por tabuladores reales (\t)
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                if stripped.startswith("#"):
                    cleaned_lines.append(stripped + "\n")
                continue

            # Separar por cualquier cantidad de espacios/tabs y unir con \t
            parts = re.split(r'\s+', stripped)
            if len(parts) >= 7:
                # Reensamblar con tabuladores exactos (los primeros 6 campos + el valor)
                domain, flag, path, secure, expiration, name = parts[:6]
                val = " ".join(parts[6:])
                clean_line = f"{domain}\t{flag}\t{path}\t{secure}\t{expiration}\t{name}\t{val}\n"
                cleaned_lines.append(clean_line)

        # Guardar archivo sanitized en /tmp
        with open(CLEAN_COOKIE_FILE, "w", encoding="utf-8") as f:
            f.writelines(cleaned_lines)

        print(f"[COOKIES SANITIZER]: Cookies procesadas con éxito en {CLEAN_COOKIE_FILE}")
        return CLEAN_COOKIE_FILE

    except Exception as e:
        print(f"[COOKIES SANITIZER ERROR]: {e}")
        return raw_path

# Obtener la ruta limpia
COOKIE_PATH = sanitize_and_get_cookie_path()

def get_ytdlp_opts(extra_opts: dict = None) -> dict:
    opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'extractor_args': {
            'youtube': {
                # Clientes en orden de prioridad para evitar bloqueos y fallos de formato
                'player_client': ['ios', 'android', 'mweb', 'web']
            }
        }
    }

    if COOKIE_PATH and os.path.exists(COOKIE_PATH):
        opts['cookiefile'] = COOKIE_PATH

    if extra_opts:
        opts.update(extra_opts)

    return opts

@app.get("/debug-cookies")
def debug_cookies():
    if not COOKIE_PATH or not os.path.exists(COOKIE_PATH):
        return {"status": "error", "message": "No se encontró archivo de cookies"}
    
    with open(COOKIE_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    return {
        "status": "ok",
        "sanitized_path": COOKIE_PATH,
        "total_lines": len(lines),
        "first_line": lines[0] if lines else "",
        "contains_tabs": any("\t" in line for line in lines)
    }

@app.get("/test-download")
def test_download(v: str = "dQw4w9WgXcQ"):
    try:
        opts = get_ytdlp_opts({'format': 'ba/b'})
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={v}", download=False)
            return {
                "status": "success", 
                "title": info.get("title"),
                "has_stream_url": bool(info.get("url") or info.get("formats"))
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en yt-dlp: {str(e)}")

@app.get("/")
def health_check():
    return {
        "status": "ok",
        "cookie_detected": COOKIE_PATH is not None,
        "cookie_path": COOKIE_PATH
    }

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
    """Obtiene dinámicamente solo instancias de Invidious activas y saludables"""
    try:
        async with httpx.AsyncClient(timeout=4.0, headers={"User-Agent": HEADERS["User-Agent"]}, verify=False) as client:
            res = await client.get("https://api.invidious.io/instances.json?sort_by=health")
            if res.status_code == 200:
                healthy = []
                for domain, info in res.json():
                    if info.get("type") == "https" and info.get("api") and info.get("health"):
                        try:
                            if float(info.get("health", 0)) > 80:
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
    # 1. Scraping directo de YouTube
    yt_results = await search_youtube_direct(q)
    if yt_results:
        return yt_results

    # 2. Respaldo por instancias Invidious dinámicas
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

    # 3. Respaldo por iTunes API
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

    return None

def sync_extract_audio_ytdlp(target_url: str):
    """Extracción directa del enlace de audio con yt-dlp"""
    # 'ba/b' busca el mejor audio (bestaudio), y si no lo halla, toma el mejor formato disponible
    opts = get_ytdlp_opts({'format': 'ba/b'})
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(target_url, download=False)
        
        audio_url = info.get("url")
        
        # Si la URL directa no viene en la raíz del diccionario, buscamos en la lista de formats
        if not audio_url and info.get("formats"):
            # Priorizar formatos que solo contengan audio
            audio_formats = [f for f in info["formats"] if f.get("vcodec") == "none" and f.get("url")]
            if audio_formats:
                audio_url = audio_formats[-1]["url"]
            else:
                # Si no hay formato de solo audio, tomar el último formato disponible con URL
                valid_formats = [f for f in info["formats"] if f.get("url")]
                if valid_formats:
                    audio_url = valid_formats[-1]["url"]

        if audio_url:
            return {
                "title": info.get("title", "Audio Stream"),
                "uploader": info.get("uploader") or info.get("artist") or "Desconocido",
                "duration": info.get("duration", 0),
                "audio_url": audio_url
            }
    return None

@app.get("/get-audio")
async def get_audio(url: str = Query(..., description="URL o término de búsqueda del video")):
    video_id = await resolve_video_id(url)

    if not video_id:
        raise HTTPException(status_code=400, detail="No se pudo resolver un ID de video válido para la solicitud.")

    target_youtube_url = f"https://www.youtube.com/watch?v={video_id}"

    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": HEADERS["User-Agent"]}, follow_redirects=True, verify=False) as client:
        # 1. API oficial de Cobalt v10
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
                res_json = res.json()
                audio_url = res_json.get("url")
                if audio_url:
                    return {
                        "title": "Audio Stream",
                        "uploader": "VK Engine",
                        "duration": 0,
                        "audio_url": audio_url
                    }
        except Exception as e:
            print(f"[COBALT ERROR]: {e}")

        # 2. Respaldo por yt-dlp con clientes móviles (Android/iOS)
        try:
            data = await asyncio.to_thread(sync_extract_audio_ytdlp, target_youtube_url)
            if data and data.get("audio_url"):
                return data
        except Exception as e:
            print(f"[YT-DLP ERROR]: {e}")

        # 3. Respaldo por instancias Invidious dinámicas saludables
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