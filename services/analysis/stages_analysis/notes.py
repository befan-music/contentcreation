"""Note transcription.

Primary engine: basic-pitch (Spotify, ONNX runtime), run on the melody ("other"
+ "vocals") and bass stems separately when stems exist.
Fallback: a lightweight CQT-peak tracker on the harmonic part of the mix.
"""

from __future__ import annotations

import os
import tempfile

import numpy as np

BASS_SPLIT = 48  # MIDI C3: below this a note counts as bass when there are no stems


def transcribe(stems: dict[str, np.ndarray] | None, stem_sr: int, y: np.ndarray, sr: int, warnings: list[str]) -> tuple[list[dict], str]:
    try:
        notes = _basic_pitch(stems, stem_sr, y, sr)
        return _clean(notes), "basic_pitch" + ("+stems" if stems else "")
    except Exception as e:
        warnings.append(f"basic-pitch unavailable ({type(e).__name__}: {str(e)[:120]}); used CQT peak tracker.")
        return _clean(_cqt_notes(y, sr)), "cqt-peaks"


def _basic_pitch(stems, stem_sr, y, sr) -> list[dict]:
    import soundfile as sf
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import Model, predict

    model = Model(ICASSP_2022_MODEL_PATH)
    sources: list[tuple[str, np.ndarray, int]]
    if stems:
        melody = stems["other"] + 0.8 * stems.get("vocals", 0)
        sources = [("melody", melody, stem_sr), ("bass", stems["bass"], stem_sr)]
    else:
        sources = [("mix", y, sr)]

    notes: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, audio, rate in sources:
            path = os.path.join(tmp, f"{name}.wav")
            sf.write(path, audio.astype(np.float32), rate)
            kwargs = dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=80)
            if name == "bass":
                kwargs.update(minimum_frequency=30, maximum_frequency=400)
            elif name == "melody":
                kwargs.update(minimum_frequency=110, maximum_frequency=3000)
            _, _, events = predict(path, model, **kwargs)
            for start, end, pitch, amp, _bends in events:
                stem = name if name != "mix" else ("bass" if pitch < BASS_SPLIT else "melody")
                notes.append(
                    {
                        "start": round(float(start), 3),
                        "end": round(float(end), 3),
                        "pitch": int(pitch),
                        "velocity": round(float(min(1.0, amp)), 3),
                        "stem": stem,
                    }
                )
    return notes


def _cqt_notes(y: np.ndarray, sr: int) -> list[dict]:
    import librosa

    harm = librosa.effects.harmonic(y, margin=2.0)
    hop = 512
    fmin = librosa.note_to_hz("C1")
    C = np.abs(librosa.cqt(harm, sr=sr, hop_length=hop, fmin=fmin, n_bins=84, bins_per_octave=12))
    onset_env = librosa.onset.onset_strength(y=harm, sr=sr, hop_length=hop)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop, backtrack=False)
    if len(onsets) == 0:
        return []
    bounds = list(onsets) + [C.shape[1]]
    peak = C.max() + 1e-9
    notes = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        b = min(b, a + int(2.0 * sr / hop))
        if b <= a:
            continue
        frame = C[:, a:b].mean(axis=1)
        t0 = float(librosa.frames_to_time(a, sr=sr, hop_length=hop))
        t1 = float(librosa.frames_to_time(b, sr=sr, hop_length=hop))
        # strongest bass bin and strongest melody bin
        split = BASS_SPLIT - 24  # bin index of C3 when fmin = C1
        for stem, lo, hi in (("bass", 0, split), ("melody", split, 84)):
            seg = frame[lo:hi]
            if seg.size == 0:
                continue
            i = int(np.argmax(seg))
            v = float(seg[i] / peak)
            if v < 0.08:
                continue
            notes.append({"start": round(t0, 3), "end": round(t1, 3), "pitch": 24 + lo + i, "velocity": round(min(1.0, v * 2), 3), "stem": stem})
    return notes


def _clean(notes: list[dict]) -> list[dict]:
    notes = [n for n in notes if n["end"] - n["start"] >= 0.05 and 21 <= n["pitch"] <= 108]
    notes.sort(key=lambda n: (n["start"], n["pitch"]))
    return notes
