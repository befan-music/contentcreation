"""Stem separation with Demucs (htdemucs). CPU is fine; it is the slowest step, so it runs in the second pass."""

from __future__ import annotations

import os

import numpy as np

STEM_SR = 44100
_MODEL = None


def stems_enabled() -> bool:
    """STAGES_STEMS=1 forces stems on, =0 off. Default: only with a GPU, because
    htdemucs on CPU takes ~2x the song length (too slow for the product's budget)."""
    setting = os.environ.get("STAGES_STEMS", "auto")
    if setting in ("0", "1"):
        return setting == "1"
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def separate(path: str, warnings: list[str]) -> dict[str, np.ndarray] | None:
    """Returns mono stems {drums, bass, other, vocals} at STEM_SR, or None if Demucs is unavailable."""
    if not stems_enabled():
        return None
    try:
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model

        from .audio import load_audio

        global _MODEL
        if _MODEL is None:
            _MODEL = get_model("htdemucs")
            _MODEL.eval()
        torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))

        wav = load_audio(path, sr=_MODEL.samplerate, channels=2)
        ref = wav.mean(0)
        mean, std = ref.mean(), ref.std() + 1e-8
        tensor = torch.from_numpy((wav - mean) / std).float()
        with torch.no_grad():
            out = apply_model(_MODEL, tensor[None], device="cpu", split=True, overlap=0.1, progress=False)[0]
        out = out * std + mean
        stems = {name: out[i].mean(0).numpy() for i, name in enumerate(_MODEL.sources)}
        if _MODEL.samplerate != STEM_SR:
            import librosa

            stems = {k: librosa.resample(v, orig_sr=_MODEL.samplerate, target_sr=STEM_SR) for k, v in stems.items()}
        return stems
    except Exception as e:
        warnings.append(f"Demucs unavailable ({type(e).__name__}: {str(e)[:120]}); drums and notes use the full mix.")
        return None
