"""Tempo, beats and bar starts.

Primary engine: Beat This! (CPJKU, 2024), which detects beats and downbeats together.
Fallback: librosa beat tracking + a downbeat-phase heuristic (assumes a constant meter).
"""

from __future__ import annotations

import os

import numpy as np

_BEAT_THIS = None


def _beat_this_model():
    global _BEAT_THIS
    if _BEAT_THIS is None:
        import torch
        from beat_this.inference import Audio2Beats

        torch.set_num_threads(max(1, os.cpu_count() or 1))
        _BEAT_THIS = Audio2Beats(checkpoint_path=os.environ.get("STAGES_BEAT_CHECKPOINT", "final0"), device="cpu", dbn=False)
    return _BEAT_THIS


def detect_beats(y: np.ndarray, sr: int, warnings: list[str]) -> tuple[np.ndarray, np.ndarray, str]:
    """Returns (beats, downbeats, engine)."""
    if os.environ.get("STAGES_BEAT_ENGINE", "auto") != "librosa":
        try:
            model = _beat_this_model()
            beats, downbeats = model(y, sr)
            beats = np.asarray(beats, dtype=float)
            downbeats = np.asarray(downbeats, dtype=float)
            if len(beats) >= 8 and len(downbeats) >= 2:
                return beats, downbeats, "beat_this"
            warnings.append("Beat This! found too few beats; fell back to librosa.")
        except Exception as e:  # model missing, download blocked, etc.
            warnings.append(f"Beat This! unavailable ({type(e).__name__}: {str(e)[:120]}); used librosa.")
    beats, downbeats = _librosa_beats(y, sr)
    return beats, downbeats, "librosa+phase-heuristic"


def _librosa_beats(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    import librosa

    hop = 512
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop, units="frames")
    beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    if len(beats) < 4:
        return beats, beats[:1]

    # Downbeat phase: bar starts tend to carry low-frequency energy (kick, bass) and harmonic change.
    mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop, n_mels=64, fmax=8000)
    low = librosa.onset.onset_strength(S=librosa.power_to_db(mel[:8]), sr=sr, hop_length=hop)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop)
    chroma_change = np.concatenate([[0], np.linalg.norm(np.diff(chroma, axis=1), axis=0)])
    frames = np.clip(beat_frames, 0, len(low) - 1)
    score_per_beat = _z(low[frames]) + 0.7 * _z(chroma_change[np.clip(frames, 0, len(chroma_change) - 1)])

    meter = 4
    phase_scores = [score_per_beat[p::meter].mean() for p in range(meter)]
    phase = int(np.argmax(phase_scores))
    return beats, beats[phase::meter]


def _z(x: np.ndarray) -> np.ndarray:
    s = x.std()
    return (x - x.mean()) / s if s > 1e-9 else x * 0


def tempo_from_beats(beats: np.ndarray) -> float:
    if len(beats) < 2:
        return 0.0
    return float(60.0 / np.median(np.diff(beats)))


def meter_from(beats: np.ndarray, downbeats: np.ndarray) -> int:
    if len(downbeats) < 2:
        return 4
    counts = []
    for a, b in zip(downbeats[:-1], downbeats[1:]):
        counts.append(int(((beats >= a - 0.03) & (beats < b - 0.03)).sum()))
    counts = [c for c in counts if c > 0]
    return int(np.median(counts)) if counts else 4
