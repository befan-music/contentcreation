"""Generate synthetic test songs with exact ground truth.

Each song has intro / verse / chorus / verse / chorus / outro, drums, bass,
chord pad and a chorus melody, at a known tempo. Ground truth (beats, bar
starts, sections, notes) is written next to each WAV as <name>.truth.json.

    python tests/make_test_songs.py OUT_DIR
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
import soundfile as sf

SR = 44100
RNG = np.random.default_rng(7)

# (name, bpm, leading silence seconds)
SONGS = [
    ("synth_082bpm", 82, 0.0),
    ("synth_096bpm", 96, 0.37),
    ("synth_110bpm", 110, 0.0),
    ("synth_120bpm", 120, 0.15),
    ("synth_128bpm", 128, 0.0),
    ("synth_140bpm", 140, 0.52),
    ("synth_160bpm", 160, 0.0),
]

STRUCTURE = [("intro", 4), ("verse", 8), ("chorus", 8), ("verse", 8), ("chorus", 8), ("outro", 4)]
PROGRESSION = [0, 7, 9, 5]  # I V vi IV, semitones above the key root
KEY_ROOT = 57  # A3
MELODY = [0, 4, 7, 9, 7, 4, 2, 4]  # scale steps over 2 bars


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def add(buf: np.ndarray, start: float, sig: np.ndarray, gain: float = 1.0) -> None:
    i = int(round(start * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += gain * sig[: j - i]


def kick() -> np.ndarray:
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t / 0.04)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * env(n, 0.001, 0.12)


def snare() -> np.ndarray:
    n = int(0.2 * SR)
    noise = RNG.standard_normal(n)
    noise = np.diff(noise, prepend=0)  # brighten
    t = np.arange(n) / SR
    return 0.5 * noise * env(n, 0.001, 0.06) + 0.4 * np.sin(2 * np.pi * 190 * t) * env(n, 0.001, 0.05)


def hat() -> np.ndarray:
    n = int(0.06 * SR)
    noise = np.diff(np.diff(RNG.standard_normal(n + 2)))
    return 0.25 * noise * env(n, 0.0005, 0.015)


def tone(midi: float, dur: float, harmonics: list[float], attack: float, decay: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * hz(midi) * (k + 1) * t) for k, a in enumerate(harmonics))
    release = np.minimum(1, (n - np.arange(n)) / (0.03 * SR))
    return s * env(n, attack, decay) * release


def make_song(bpm: float, offset: float) -> tuple[np.ndarray, dict]:
    beat = 60 / bpm
    bar = 4 * beat
    total_bars = sum(b for _, b in STRUCTURE)
    length = offset + total_bars * bar + 2.0
    buf = np.zeros(int(length * SR))
    truth = {"bpm": bpm, "beats": [], "downbeats": [], "sections": [], "notes": []}

    bar_index = 0
    for label, n_bars in STRUCTURE:
        sec_start = offset + bar_index * bar
        truth["sections"].append({"start": round(sec_start, 4), "end": round(sec_start + n_bars * bar, 4), "label": label})
        loud = {"intro": 0.5, "verse": 0.75, "chorus": 1.0, "outro": 0.45}[label]
        for b in range(n_bars):
            t_bar = offset + (bar_index + b) * bar
            chord_root = KEY_ROOT + PROGRESSION[(bar_index + b) % 4]
            truth["downbeats"].append(round(t_bar, 4))
            # pad (all sections)
            for iv in (0, 4, 7):
                add(buf, t_bar, tone(chord_root + iv + 12, bar, [1, 0.3, 0.1], 0.05, 3.0), 0.05 * loud)
            for k in range(4):
                t = t_bar + k * beat
                truth["beats"].append(round(t, 4))
                if label in ("verse", "chorus"):
                    if label == "chorus" or k in (0, 2):
                        add(buf, t, kick(), 0.9 * loud)
                    if k in (1, 3):
                        add(buf, t, snare(), 0.6 * loud)
                    add(buf, t, hat(), 0.5)
                    add(buf, t + beat / 2, hat(), 0.35)
                if label in ("intro", "outro") and k == 0:
                    add(buf, t, kick(), 0.4)  # soft pulse so the beat is findable
            if label != "intro":
                bass_pitch = chord_root - 24
                add(buf, t_bar, tone(bass_pitch, bar * 0.9, [1, 0.5, 0.25], 0.005, 1.2), 0.35 * loud)
                truth["notes"].append({"start": round(t_bar, 4), "end": round(t_bar + bar * 0.9, 4), "pitch": bass_pitch, "stem": "bass"})
            if label == "chorus":
                for k in range(4):
                    step = MELODY[((bar_index + b) % 2) * 4 + k]
                    pitch = KEY_ROOT + 12 + [0, 2, 4, 5, 7, 9, 11, 12, 14, 16][step % 10]
                    t = t_bar + k * beat
                    add(buf, t, tone(pitch, beat * 0.8, [1, 0.4, 0.2, 0.1], 0.005, 0.6), 0.25)
                    truth["notes"].append({"start": round(t, 4), "end": round(t + beat * 0.8, 4), "pitch": pitch, "stem": "melody"})
        bar_index += n_bars

    buf += 0.002 * RNG.standard_normal(len(buf))  # noise floor
    buf /= np.abs(buf).max() + 1e-9
    return (0.9 * buf).astype(np.float32), truth


def main() -> None:
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "songs")
    os.makedirs(out_dir, exist_ok=True)
    for name, bpm, offset in SONGS:
        audio, truth = make_song(bpm, offset)
        sf.write(os.path.join(out_dir, f"{name}.wav"), audio, SR)
        with open(os.path.join(out_dir, f"{name}.truth.json"), "w") as f:
            json.dump(truth, f)
        print(f"{name}: {len(audio) / SR:.1f}s, {len(truth['beats'])} beats")


if __name__ == "__main__":
    main()
