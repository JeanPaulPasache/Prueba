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