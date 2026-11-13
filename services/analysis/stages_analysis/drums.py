"""Kick / snare / hat hits.

With a drums stem (Demucs) the onsets are clean; without one, the percussive
part of a harmonic/percussive split is used. The split runs on a 128-band mel
spectrogram instead of the full STFT: ~15x faster, and band onsets don't need
more frequency resolution than that.
"""

from __future__ import annotations

import numpy as np

BANDS = {
    # name: (fmin, fmax) in Hz
    "kick": (30, 150),
    "snare": (1200, 5000),
    "hat": (7000, 11000),
}
DELTA = {"kick": 0.12, "snare": 0.14, "hat": 0.2}


def detect_drums(y: np.ndarray, sr: int, from_stem: bool) -> list[dict]:
    import librosa

    hop = 256
    n_mels = 128
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=2048, hop_length=hop, n_mels=n_mels, fmin=20, fmax=min(12000, sr / 2))
    if not from_stem:
        _, mel = librosa.decompose.hpss(mel, kernel_size=(17, 17), margin=2.0)
    freqs = librosa.mel_frequencies(n_mels=n_mels, fmin=20, fmax=min(12000, sr / 2))

    hits: list[dict] = []
    for name, (lo, hi) in BANDS.items():
        band = mel[(freqs >= lo) & (freqs < hi)]
        if band.size == 0:
            continue
        env = librosa.onset.onset_strength(S=librosa.power_to_db(band, ref=np.max), sr=sr, hop_length=hop)
        if env.max() <= 0:
            continue
        env = env / env.max()
        wait = int(0.09 * sr / hop)
        peaks = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=DELTA[name], wait=wait)
        times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        for t, p in zip(times, peaks):
            hits.append({"time": round(float(t), 3), "type": name, "strength": round(float(env[p]), 3)})
    hits.sort(key=lambda h: h["time"])
    return hits
