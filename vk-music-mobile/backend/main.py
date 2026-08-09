def sync_extract_ytdlp(target_youtube_url: str):
    """Extracción con yt-dlp usando clientes móviles para evadir bloqueos de IP/Cookies"""
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'nocheckcertificate': True,
        # Emular cliente Android/iOS evita la restricción de cookies en IPs de datacenter (Render)
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'mweb']
            }
        }
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(target_youtube_url, download=False)
        audio_url = info.get("url")
        if not audio_url and info.get("formats"):
            audio_formats = [f for f in info["formats"] if f.get("vcodec") == "none" and f.get("url")]
            if audio_formats:
                audio_url = audio_formats[-1]["url"]
        if audio_url:
            return {
                "title": info.get("title", "Audio Stream"),
                "uploader": info.get("uploader") or info.get("artist") or "VK Engine",
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
        # 1. Primera línea: API oficial de Cobalt (resuelve mediante sus proxies)
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

        # 2. Segunda línea: yt-dlp con imitación de cliente Android/iOS
        try:
            data = await asyncio.to_thread(sync_extract_ytdlp, target_youtube_url)
            if data and data.get("audio_url"):
                return data
        except Exception as e:
            print(f"[YT-DLP ERROR]: {e}")

        # 3. Tercera línea: Invidious dinámico
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