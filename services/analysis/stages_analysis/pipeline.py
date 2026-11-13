"""Two-pass analysis.

Pass 1 (fast, seconds):  tempo, beats, bar starts, sections, energy, waveform, suggested clips
                          -> written with status "partial" so the UI can continue.
Pass 2 (slow, ~1 min):   stems (Demucs) -> drum hits, notes (basic-pitch)
                          -> written with status "complete".
"""

from __future__ import annotations

import json
import os
import time
from typing import Callable

import numpy as np

from . import ANALYSIS_VERSION
from .audio import load_audio, sha256_file
from .beats import detect_beats, meter_from, tempo_from_beats
from .drums import detect_drums
from .features import ENERGY_HOP, WAVEFORM_HOP, energy_curve, suggest_clips, waveform_peaks
from .notes import transcribe
from .sections import detect_sections
from .stems import STEM_SR, separate

SR = 22050

Progress = Callable[[float, str], None]


def _r(xs) -> list[float]:
    return [round(float(x), 3) for x in xs]


def write_json(path: str, data: dict) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def analyze(path: str, out_path: str | None, audio_hash: str | None = None, progress: Progress | None = None, full: bool = True) -> dict:
    progress = progress or (lambda p, m: None)
    timings: dict[str, float] = {}
    warnings: list[str] = []
    t0 = time.time()

    progress(0.02, "Decoding audio")
    y = load_audio(path, sr=SR)
    duration = len(y) / SR
    if duration < 3:
        raise ValueError("Song is shorter than 3 seconds.")
    timings["decode"] = time.time() - t0

    # Pass 0 (instant): waveform + loudness, so the song can be seen and played right away.
    energy = energy_curve(y, SR)
    waveform = waveform_peaks(y, SR)
    if out_path:
        write_json(
            out_path,
            {
                "version": ANALYSIS_VERSION,
                "audioHash": audio_hash or sha256_file(path),
                "status": "preview",
                "duration": round(duration, 3),
                "tempo": 0,
                "beats": [],
                "downbeats": [],
                "meter": 4,
                "sections": [],
                "notes": [],
                "drums": [],
                "energy": {"hop": ENERGY_HOP, "values": energy},
                "waveform": {"hop": WAVEFORM_HOP, "peaks": waveform},
                "suggestedClips": {},
                "engines": {},
                "warnings": [],
            },
        )
    progress(0.06, "PREVIEW")

    progress(0.08, "Finding the beat")
    t = time.time()
    beats, downbeats, beat_engine = detect_beats(y, SR, warnings)
    timings["beats"] = time.time() - t
    tempo = tempo_from_beats(beats)
    if len(beats) < 8:
        warnings.append("This song has no steady beat.")

    progress(0.25, "Finding sections")
    t = time.time()
    sections = detect_sections(y, SR, downbeats, duration)
    timings["sections"] = time.time() - t

    result = {
        "version": ANALYSIS_VERSION,
        "audioHash": audio_hash or sha256_file(path),
        "status": "partial",
        "duration": round(duration, 3),
        "tempo": round(tempo, 2),
        "beats": _r(beats),
        "downbeats": _r(downbeats),
        "meter": meter_from(beats, downbeats),
        "sections": sections,
        "notes": [],
        "drums": [],
        "energy": {"hop": ENERGY_HOP, "values": energy},
        "waveform": {"hop": WAVEFORM_HOP, "peaks": waveform},
        "suggestedClips": suggest_clips(duration, downbeats, energy, sections),
        "engines": {"beats": beat_engine, "downbeats": beat_engine, "sections": "bar-novelty"},
        "warnings": warnings,
        "timings": timings,
    }
    if out_path:
        write_json(out_path, result)
    progress(0.35, "PARTIAL")
    if not full:
        return result

    progress(0.4, "Separating drums, bass and melody")
    t = time.time()
    stems = separate(path, warnings)
    timings["stems"] = time.time() - t
    result["engines"]["stems"] = "htdemucs" if stems else "none"

    progress(0.75, "Detecting drum hits")
    t = time.time()
    if stems:
        result["drums"] = detect_drums(stems["drums"], STEM_SR, from_stem=True)
        result["engines"]["drums"] = "band-onsets+drums-stem"
    else:
        result["drums"] = detect_drums(y, SR, from_stem=False)
        result["engines"]["drums"] = "band-onsets+hpss"
    timings["drums"] = time.time() - t

    progress(0.82, "Transcribing notes")
    t = time.time()
    result["notes"], result["engines"]["notes"] = transcribe(stems, STEM_SR, y, SR, warnings)
    timings["notes"] = time.time() - t

    timings["total"] = time.time() - t0
    result["timings"] = {k: round(v, 2) for k, v in timings.items()}
    result["status"] = "complete"
    if out_path:
        write_json(out_path, result)
    progress(1.0, "Done")
    return result


def summarize(a: dict) -> str:
    beats = np.array(a["beats"])
    return (
        f"duration {a['duration']}s | tempo {a['tempo']} bpm | meter {a['meter']} | "
        f"{len(beats)} beats, {len(a['downbeats'])} bars | sections: "
        + " ".join(f"{s['label']}@{s['start']:.1f}" for s in a["sections"])
        + f" | {len(a['drums'])} drum hits | {len(a['notes'])} notes | engines {a['engines']}"
    )
