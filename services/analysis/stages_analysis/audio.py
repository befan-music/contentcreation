"""Audio decoding through ffmpeg (bundled by imageio-ffmpeg), so mp3, m4a, aac, wav, ogg and flac all work."""

from __future__ import annotations

import hashlib
import subprocess

import numpy as np


def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def load_audio(path: str, sr: int = 22050, channels: int = 1) -> np.ndarray:
    """Decode any audio file to float32 at `sr`. Returns shape (n,) for mono or (channels, n).

    libsndfile (wav, flac, ogg, mp3) + soxr is ~50x faster than piping through
    ffmpeg on Windows; ffmpeg handles everything else (m4a, aac, ...).
    """
    try:
        import soundfile as sf
        import soxr

        data, file_sr = sf.read(path, dtype="float32", always_2d=True)  # (n, ch)
        if channels == 1:
            mono = data.mean(axis=1)
            return soxr.resample(mono, file_sr, sr).astype(np.float32) if file_sr != sr else mono
        if data.shape[1] == 1:
            data = np.repeat(data, channels, axis=1)
        data = data[:, :channels]
        if file_sr != sr:
            data = soxr.resample(data, file_sr, sr)
        return np.ascontiguousarray(data.T.astype(np.float32))
    except Exception:
        pass
    try:
        return _load_pyav(path, sr, channels)
    except Exception:
        pass
    return _load_ffmpeg(path, sr, channels)


def _load_pyav(path: str, sr: int, channels: int) -> np.ndarray:
    """In-process decode (m4a, aac, webm/opus...). Avoids spawning ffmpeg, which costs ~6 s per launch on Windows."""
    import av

    layout = "mono" if channels == 1 else "stereo"
    chunks = []
    with av.open(path) as container:
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format="flt", layout=layout, rate=sr)
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    if not chunks:
        raise RuntimeError("no audio")
    data = np.concatenate(chunks).astype(np.float32)
    if channels == 1:
        return data
    return np.ascontiguousarray(data.reshape(-1, channels).T)


def _load_ffmpeg(path: str, sr: int, channels: int) -> np.ndarray:
    cmd = [
        ffmpeg_exe(),
        "-nostdin",
        "-v",
        "error",
        "-i",
        path,
        "-vn",
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        str(channels),
        "-ar",
        str(sr),
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=False)
    if proc.returncode != 0 or not proc.stdout:
        raise RuntimeError(f"Could not decode audio: {proc.stderr.decode(errors='ignore').strip()[:300]}")
    data = np.frombuffer(proc.stdout, dtype=np.float32).copy()
    if channels == 1:
        return data
    return data.reshape(-1, channels).T


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
