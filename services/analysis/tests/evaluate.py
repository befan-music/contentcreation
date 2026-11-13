"""Score the music engine against songs with ground truth.

    python tests/evaluate.py SONG_DIR [--fast]

For every <name>.wav with a <name>.truth.json next to it, runs the analysis and
reports beat / bar F-measure (±70 ms, the standard tolerance), section
boundary recall (±1 beat), and note-onset F-measure (±50 ms, exact pitch class).

Phase 1 "done when": beats and bars correct (F ≥ 0.9) on at least 90% of songs.
Real songs can be added to the folder with a hand-made truth file
({"beats": [...], "downbeats": [...]} is enough).
"""

from __future__ import annotations

import json
import os
import sys
import time
import warnings

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402

from stages_analysis.pipeline import analyze  # noqa: E402


def f_measure(est: list[float], ref: list[float], tol: float) -> float:
    if not ref and not est:
        return 1.0
    if not ref or not est:
        return 0.0
    est_a = np.array(sorted(est))
    used = np.zeros(len(est_a), dtype=bool)
    hits = 0
    for r in ref:
        idx = np.where((np.abs(est_a - r) <= tol) & ~used)[0]
        if len(idx):
            used[idx[np.argmin(np.abs(est_a[idx] - r))]] = True
            hits += 1
    p = hits / len(est_a)
    rec = hits / len(ref)
    return 0.0 if p + rec == 0 else 2 * p * rec / (p + rec)


def note_f(est: list[dict], ref: list[dict], tol: float) -> float:
    if not ref:
        return float("nan")
    hits = 0
    used = set()
    for r in ref:
        for i, e in enumerate(est):
            if i in used:
                continue
            if abs(e["start"] - r["start"]) <= tol and e["pitch"] % 12 == r["pitch"] % 12:
                used.add(i)
                hits += 1
                break
    p = hits / max(1, len(est))
    rec = hits / len(ref)
    return 0.0 if p + rec == 0 else 2 * p * rec / (p + rec)


def main() -> int:
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "songs")
    fast = "--fast" in sys.argv
    rows = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".truth.json"):
            continue
        base = name[: -len(".truth.json")]
        audio = next((os.path.join(folder, base + ext) for ext in (".wav", ".mp3", ".m4a", ".flac") if os.path.exists(os.path.join(folder, base + ext))), None)
        if not audio:
            continue
        truth = json.load(open(os.path.join(folder, name)))
        t = time.time()
        a = analyze(audio, None, audio_hash=base, full=not fast)
        secs = time.time() - t
        beat_f = f_measure(a["beats"], truth["beats"], 0.07)
        bar_f = f_measure(a["downbeats"], truth.get("downbeats", []), 0.07)
        beat_len = 60 / truth.get("bpm", 120)
        ref_bounds = [s["start"] for s in truth.get("sections", [])[1:]]
        est_bounds = [s["start"] for s in a["sections"][1:]]
        sec_recall = (sum(any(abs(e - r) <= beat_len for e in est_bounds) for r in ref_bounds) / len(ref_bounds)) if ref_bounds else float("nan")
        mel = note_f([n for n in a["notes"] if n["stem"] == "melody"], [n for n in truth.get("notes", []) if n["stem"] == "melody"], 0.05)
        bass = note_f([n for n in a["notes"] if n["stem"] == "bass"], [n for n in truth.get("notes", []) if n["stem"] == "bass"], 0.07)
        ok = beat_f >= 0.9 and bar_f >= 0.9
        rows.append((base, truth.get("bpm"), a["tempo"], beat_f, bar_f, sec_recall, mel, bass, secs, ok, a["engines"].get("beats"), a["warnings"]))

    print(f"{'song':<16}{'bpm':>5}{'est':>8}{'beatF':>7}{'barF':>7}{'secR':>7}{'melF':>7}{'bassF':>7}{'sec':>7}  ok")
    for r in rows:
        print(f"{r[0]:<16}{r[1]:>5}{r[2]:>8.1f}{r[3]:>7.2f}{r[4]:>7.2f}{r[5]:>7.2f}{r[6]:>7.2f}{r[7]:>7.2f}{r[8]:>7.1f}  {'OK' if r[9] else 'FAIL'}")
    passed = sum(r[9] for r in rows)
    print(f"\n{passed}/{len(rows)} songs have beats and bars right (target: >= 90%). Beat engine: {rows[0][10] if rows else '-'}")
    for r in rows:
        for w in r[11]:
            print(f"  warning [{r[0]}]: {w}")
    return 0 if rows and passed / len(rows) >= 0.9 else 1


if __name__ == "__main__":
    sys.exit(main())
