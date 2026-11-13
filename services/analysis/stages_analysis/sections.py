"""Song sections (intro / verse / chorus / drop / bridge / outro).

Boundaries: novelty on a bar-level self-similarity matrix (chroma + timbre),
so every boundary lands on a bar start. Labels: repetition clusters + loudness.
This is a heuristic; users can move boundaries in Studio.
"""

from __future__ import annotations

import numpy as np


def detect_sections(y: np.ndarray, sr: int, downbeats: np.ndarray, duration: float) -> list[dict]:
    import librosa

    if len(downbeats) < 8:
        return [{"start": 0.0, "end": duration, "label": "verse"}]

    hop = 1024
    n_fft = 4096
    D = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop)) ** 2
    chroma = librosa.feature.chroma_stft(S=D, sr=sr, n_fft=n_fft, hop_length=hop)
    mel = librosa.feature.melspectrogram(S=D, sr=sr, n_fft=n_fft, hop_length=hop, n_mels=64)
    mel_db = librosa.power_to_db(mel)
    mfcc = librosa.feature.mfcc(S=mel_db, n_mfcc=13)[1:]
    rms = librosa.feature.rms(S=np.sqrt(D), frame_length=n_fft, hop_length=hop)[0]
    low = mel_db[:6].mean(axis=0)  # kick / bass weight
    flux = np.concatenate([[0], np.maximum(0, np.diff(mel_db, axis=1)).mean(axis=0)])  # rhythmic density

    n_frames = chroma.shape[1]
    bar_frames = np.clip(librosa.time_to_frames(downbeats, sr=sr, hop_length=hop), 0, n_frames - 1)
    bar_frames = np.unique(bar_frames)

    def per_bar(x: np.ndarray) -> np.ndarray:
        return librosa.util.sync(np.atleast_2d(x), bar_frames, aggregate=np.mean, pad=True)[:, 1:]  # column i = bar i

    bar_rms = per_bar(rms)[0]
    harmony = per_bar(chroma)
    timbre = _standardize_rows(per_bar(mfcc))
    dynamics = _standardize_rows(np.vstack([np.log(per_bar(rms) + 1e-6), per_bar(low), per_bar(flux)]))
    n_bars = harmony.shape[1]
    if n_bars < 8:
        return [{"start": 0.0, "end": duration, "label": "verse"}]

    def cos_sim(F: np.ndarray) -> np.ndarray:
        X = F / (np.linalg.norm(F, axis=0, keepdims=True) + 1e-9)
        return X.T @ X

    def dist_sim(F: np.ndarray) -> np.ndarray:
        d = np.linalg.norm(F[:, :, None] - F[:, None, :], axis=0)
        return np.exp(-d / (np.median(d) + 1e-9))

    # Harmony, timbre and energy each vote; section changes usually move at least two of them.
    S = cos_sim(harmony) + dist_sim(timbre) + 1.5 * dist_sim(dynamics)
    sync = np.vstack([harmony, timbre * 0.3, dynamics * 0.5])

    novelty = _checkerboard_novelty(S, k=4) + _checkerboard_novelty(S, k=8)
    min_gap = 4  # bars
    # Sections are usually 4-16 bars; allow up to one boundary per ~6 bars and let the threshold decide.
    target_sections = max(2, min(16, n_bars // 6 + 1))
    boundaries = _pick_peaks(novelty, min_gap=min_gap, max_peaks=target_sections - 1)
    boundaries = sorted(set([0] + boundaries))

    bar_times = list(downbeats[: n_bars]) + [duration]
    segments = []
    for i, b in enumerate(boundaries):
        e = boundaries[i + 1] if i + 1 < len(boundaries) else n_bars
        if e <= b:
            continue
        segments.append((b, e))

    # Snap the very first section to 0 so the whole song is covered.
    seg_feats = np.array([sync[:, b:e].mean(axis=1) for b, e in segments])
    seg_energy = np.array([bar_rms[b:e].mean() for b, e in segments])
    labels = _label_segments(seg_feats, seg_energy)

    out = []
    for i, ((b, e), label) in enumerate(zip(segments, labels)):
        start = 0.0 if i == 0 else float(bar_times[b])
        end = duration if i == len(segments) - 1 else float(bar_times[e])
        out.append({"start": round(start, 3), "end": round(end, 3), "label": label})
    return out


def _standardize_rows(x: np.ndarray) -> np.ndarray:
    return (x - x.mean(axis=1, keepdims=True)) / (x.std(axis=1, keepdims=True) + 1e-9)


def _checkerboard_novelty(S: np.ndarray, k: int) -> np.ndarray:
    n = S.shape[0]
    kernel = np.ones((2 * k, 2 * k))
    kernel[:k, k:] = -1
    kernel[k:, :k] = -1
    # taper so the centre matters most
    g = np.exp(-0.5 * ((np.arange(2 * k) - k + 0.5) / (k * 0.6)) ** 2)
    kernel *= np.outer(g, g)
    pad = np.pad(S, k, mode="edge")
    nov = np.zeros(n)
    for i in range(n):
        nov[i] = (pad[i : i + 2 * k, i : i + 2 * k] * kernel).sum()
    nov[: k // 2] = 0
    nov[n - k // 2 :] = 0
    return np.maximum(nov, 0)


def _pick_peaks(nov: np.ndarray, min_gap: int, max_peaks: int) -> list[int]:
    if nov.max() <= 0:
        return []
    threshold = nov.mean() + 0.1 * nov.std()
    candidates = [i for i in range(1, len(nov) - 1) if nov[i] >= nov[i - 1] and nov[i] >= nov[i + 1] and nov[i] > threshold]
    candidates.sort(key=lambda i: -nov[i])
    chosen: list[int] = []
    for c in candidates:
        if all(abs(c - p) >= min_gap for p in chosen) and c >= min_gap // 2:
            chosen.append(c)
        if len(chosen) >= max_peaks:
            break
    # Prefer boundaries on 4-bar phrase grid when a neighbour is close and nearly as strong.
    snapped = []
    for c in chosen:
        best = c
        for d in (-1, 1):
            j = c + d
            if 0 < j < len(nov) and j % 4 == 0 and nov[j] > 0.8 * nov[c]:
                best = j
        snapped.append(best)
    return sorted(set(snapped))


def _label_segments(feats: np.ndarray, energy: np.ndarray) -> list[str]:
    n = len(energy)
    if n == 1:
        return ["verse"]

    # Repetition groups: segments that sound alike.
    norm = feats / (np.linalg.norm(feats, axis=1, keepdims=True) + 1e-9)
    sim = norm @ norm.T
    group = list(range(n))
    for i in range(n):
        for j in range(i):
            if sim[i, j] > 0.97 and group[i] == i:
                group[i] = group[j]

    e = (energy - energy.min()) / (energy.max() - energy.min() + 1e-9)
    hi = np.quantile(e, 0.6)
    labels = []
    for i in range(n):
        if e[i] >= hi and e[i] > 0.5:
            # A drop is the loudest part, arriving right after a clearly quieter build (not the intro).
            jump = i > 1 and energy[i - 1] < 0.5 * energy[i]
            labels.append("drop" if jump and e[i] > 0.9 else "chorus")
        else:
            labels.append("verse")

    if e[0] < 0.5:
        labels[0] = "intro"
    if n > 2 and e[-1] < 0.6 and labels[-1] != "chorus":
        labels[-1] = "outro"

    seen_chorus = False
    for i in range(1, n - 1):
        if labels[i] in ("chorus", "drop"):
            seen_chorus = True
        elif seen_chorus and labels[i] == "verse" and group.count(group[i]) == 1:
            labels[i] = "bridge"
    return labels
