"""Import a song's audio from a YouTube link (yt-dlp).

Only youtube.com / youtu.be / music.youtube.com links are accepted, single
videos only (no playlists), max 15 minutes. YouTube needs a JavaScript runtime
for yt-dlp; we use Node, which the web app already requires.

Legal note: downloading from YouTube is against YouTube's Terms of Service, and
the audio is usually copyrighted. Songs stay private to the user's account and
are never redistributed (vision.md section 13). Revisit before a public launch.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, urlparse

MAX_DURATION = 15 * 60
ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def video_id(url: str) -> str:
    """Validate a YouTube link and return its 11-character video id."""
    u = urlparse(url.strip())
    if u.scheme not in ("http", "https") or u.hostname not in ALLOWED_HOSTS:
        raise ValueError("Not a YouTube link.")
    vid = None
    if u.hostname == "youtu.be":
        vid = u.path.lstrip("/").split("/")[0]
    elif u.path == "/watch":
        vid = (parse_qs(u.query).get("v") or [None])[0]
    elif u.path.startswith(("/shorts/", "/embed/", "/live/")):
        vid = u.path.split("/")[2]
    if not vid or not VIDEO_ID.match(vid):
        raise ValueError("Could not find a video id in that link.")
    return vid


def _node() -> str | None:
    return shutil.which("node")


FRIENDLY_ERRORS = [
    ("does not pass filter", "This video is longer than 15 minutes. Pick a single song."),
    ("confirm your age", "This video is age-restricted on YouTube, so it can't be imported. Upload the audio file instead."),
    ("not a bot", "YouTube asked for a bot check. Wait a minute and try again, or upload the audio file."),
    ("Private video", "This video is private."),
    ("members-only", "This video is for channel members only."),
    ("not available in your country", "This video isn't available in this country."),
    ("Video unavailable", "This video is unavailable (removed or blocked)."),
    ("Requested format is not available", "YouTube offers no audio stream for this video."),
    ("live event", "Live streams can't be imported. Use a finished upload of the song."),
]


def friendly(message: str) -> str:
    for needle, text in FRIENDLY_ERRORS:
        if needle.lower() in message.lower():
            return text
    return message.replace("ERROR: ", "").strip()[:300]


def fetch(url: str, out_dir: str, on_progress=None) -> dict:
    """Download the best audio-only stream. Returns {path, videoId, title, artist, track, duration, name}.

    Runs yt-dlp in this process (no second Python start-up) and reports every
    stage live through on_progress(fraction, message). The container fix-up is
    skipped here; the Node side re-packs the file for fast browser playback.
    """
    vid = video_id(url)
    os.makedirs(out_dir, exist_ok=True)
    import imageio_ffmpeg
    import yt_dlp

    report = on_progress or (lambda p, m: None)
    watch_url = f"https://www.youtube.com/watch?v={vid}"
    argv = [
        "--no-playlist",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "--match-filter", f"duration <= {MAX_DURATION}",
        "--max-filesize", "60M",
        "--ffmpeg-location", imageio_ffmpeg.get_ffmpeg_exe(),
        "-o", os.path.join(out_dir, "%(id)s.%(ext)s"),
        "--socket-timeout", "15",
        "--retries", "3",
        "--fixup", "never",
        "--no-progress",
    ]
    # IPv4 by default: on networks with broken IPv6, Python tries every IPv6
    # address before falling back (no "happy eyeballs"), which makes each
    # request take minutes. Browsers hide this; yt-dlp doesn't.
    if os.environ.get("STAGES_YTDLP_IPV6") != "1":
        argv.append("--force-ipv4")
    if _node():
        argv += ["--js-runtimes", "node"]
    opts = yt_dlp.parse_options(argv + ["--", watch_url]).ydl_opts

    stages = [
        ("Downloading webpage", 0.08, "Reading the YouTube page"),
        ("player API JSON", 0.12, "Asking YouTube for the audio"),
        ("Solving JS challenges", 0.16, "Solving YouTube's check"),
        ("Sleeping", 0.28, "YouTube asks for a short pause"),
        ("Downloading 1 format", 0.26, "Starting the download"),
        ("does not pass filter", 0.3, "does not pass filter"),
    ]
    rejected: list[str] = []

    class Logger:
        def _see(self, msg: str) -> None:
            for needle, p, text in stages:
                if needle in msg:
                    if needle == "does not pass filter":
                        rejected.append(msg)
                    else:
                        report(p, text)

        def debug(self, msg: str) -> None:
            self._see(msg)

        def info(self, msg: str) -> None:
            self._see(msg)

        def warning(self, msg: str) -> None:
            self._see(msg)

        def error(self, msg: str) -> None:
            pass

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                f = min(1.0, d.get("downloaded_bytes", 0) / total)
                report(0.3 + 0.7 * f, f"Downloading {f * 100:.0f}%")
        elif d.get("status") == "finished":
            report(1.0, "Downloaded")

    opts.update(logger=Logger(), progress_hooks=[hook], quiet=True, no_warnings=True)
    report(0.03, "Connecting to YouTube")
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(watch_url, download=True)
            path = None
            if info:
                downloads = info.get("requested_downloads") or []
                path = downloads[0].get("filepath") if downloads else None
                path = path or ydl.prepare_filename(info)
    except yt_dlp.utils.DownloadError as e:
        raise RuntimeError(friendly(str(e)))
    if rejected or not info or not path or not os.path.exists(path):
        raise RuntimeError(friendly(rejected[0] if rejected else "Requested format is not available"))

    title = info.get("title") or vid
    artist = info.get("artist") or info.get("creator") or info.get("uploader") or ""
    return {
        "path": path,
        "videoId": vid,
        "title": title,
        "artist": artist,
        "track": info.get("track") or "",
        "duration": float(info["duration"]) if info.get("duration") else None,
        "name": clean_title(title, artist),
    }


def clean_title(title: str, artist: str) -> str:
    """'Tame Impala - Dracula (Official Video)' -> 'Tame Impala – Dracula'."""
    t = re.sub(r"\s*[\(\[](official|lyric|lyrics|audio|video|music video|visualizer|hd|4k)[^\)\]]*[\)\]]", "", title, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" -")
    if " - " in t:
        a, b = t.split(" - ", 1)
        return f"{a.strip()} – {b.strip()}"
    if artist and artist not in ("NA", "None") and artist.lower() not in t.lower():
        return f"{artist} – {t}"
    return t
