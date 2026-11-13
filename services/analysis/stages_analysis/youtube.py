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


def fetch(url: str, out_dir: str) -> dict:
    """Download the best audio-only stream. Returns {path, videoId, title, artist, track, duration}."""
    vid = video_id(url)
    os.makedirs(out_dir, exist_ok=True)
    import imageio_ffmpeg

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--no-progress",
        "--no-simulate",
        "-f",
        "bestaudio[ext=m4a]/bestaudio",
        "--match-filter",
        f"duration <= {MAX_DURATION}",
        "--max-filesize",
        "60M",
        "--ffmpeg-location",
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-o",
        os.path.join(out_dir, "%(id)s.%(ext)s"),
        "--print",
        "after_move:filepath",
        "--print",
        "%(title)s\t%(artist,creator,uploader)s\t%(track)s\t%(duration)s",
    ]
    if _node():
        cmd += ["--js-runtimes", "node"]
    cmd += ["--", f"https://www.youtube.com/watch?v={vid}"]

    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    lines = [l for l in proc.stdout.splitlines() if l.strip()]
    meta_line = next((l for l in lines if "\t" in l), None)
    path_line = next((l for l in lines if os.path.exists(l.strip())), None)
    if proc.returncode != 0 or not path_line:
        err = (proc.stderr or proc.stdout).strip().splitlines()
        msg = next((l for l in reversed(err) if "ERROR" in l), err[-1] if err else "unknown error")
        if "does not pass filter" in proc.stdout + proc.stderr or (meta_line is None and "duration" in msg):
            msg = "This video is longer than 15 minutes."
        raise RuntimeError(msg.replace("ERROR: ", "")[:300])

    title, artist, track, duration = (meta_line or "\t\t\t").split("\t")[:4]
    return {
        "path": path_line.strip(),
        "videoId": vid,
        "title": title,
        "artist": "" if artist in ("NA", "None") else artist,
        "track": "" if track in ("NA", "None") else track,
        "duration": float(duration) if duration not in ("NA", "") else None,
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
