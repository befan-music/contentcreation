"""Energy curve, waveform peaks and suggested clips."""

from __future__ import annotations

import numpy as np

ENERGY_HOP = 0.1
WAVEFORM_HOP = 0.02
CLIP_LENGTHS = (15, 30, 60)


def energy_curve(y: np.ndarray, sr: int) -> list[float]:
    hop = int(sr * ENERGY_HOP)
    n = len(y) // hop
    if n == 0:
        return []
    frames = y[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames**2).mean(axis=1))
    ref = np.quantile(rms, 0.97) + 1e-9
    return [round(float(v), 3) for v in np.clip(rms / ref, 0, 1)]


def waveform_peaks(y: np.ndarray, sr: int) -> list[float]:
    hop = int(sr * WAVEFORM_HOP)
    n = len(y) // hop
    if n == 0:
        return []
    peaks = np.abs(y[: n * hop].reshape(n, hop)).max(axis=1)
    peaks = peaks / (peaks.max() + 1e-9)
    return [round(float(v), 3) for v in peaks]


def suggest_clips(duration: float, downbeats: np.ndarray, energy: list[float], sections: list[dict]) -> dict[str, dict]:
    """Pick the strongest window per length, starting on a bar, preferring a chorus/drop start."""
    e = np.array(energy) if energy else np.zeros(1)
    chorus_starts = [s["start"] for s in sections if s["label"] in ("chorus", "drop")]
    first_chorus = chorus_starts[0] if chorus_starts else None
    out: dict[str, dict] = {}
    for length in CLIP_LENGTHS:
        if duration <= length + 0.5:
            out[str(length)] = {"start": 0.0, "end": round(duration, 3)}
            continue
        candidates = [float(t) for t in downbeats if t + length <= duration] or [0.0]
        best, best_score = candidates[0], -1e9
        for start in candidates:
            a = int(start / ENERGY_HOP)
            b = max(a + 1, int((start + length) / ENERGY_HOP))
            score = float(e[a:b].mean()) if a < len(e) else 0.0
            if any(abs(start - c) < 0.3 for c in chorus_starts):
                score += 0.12
            if first_chorus is not None and abs(start - first_chorus) < 0.3:
                score += 0.05
            if start < 2.0:
                score -= 0.05  # the very top of a song is rarely the best part
            if score > best_score:
                best, best_score = start, score
        end = best + length
        # End on a bar if one falls within the last second, so the video loops cleanly.
        near = [float(t) for t in downbeats if end - 1.0 <= t <= end]
        if near:
            end = near[-1]
        out[str(length)] = {"start": round(best, 3), "end": round(end, 3)}
    return out
