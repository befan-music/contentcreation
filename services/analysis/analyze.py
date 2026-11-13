"""Stages song analysis CLI.

    python analyze.py SONG OUT.json [--hash HASH] [--fast]

Prints machine-readable progress lines for the job runner:
    PROGRESS <0..1> <message>
    PARTIAL            (OUT.json now holds beats, bars, sections, clips)
    DONE
    ERROR <message>
"""

from __future__ import annotations

import argparse
import os
import sys
import warnings as pywarnings

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pywarnings.filterwarnings("ignore")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("song")
    parser.add_argument("out")
    parser.add_argument("--hash", default=None)
    parser.add_argument("--fast", action="store_true", help="first pass only (no stems, drums or notes)")
    args = parser.parse_args()

    from stages_analysis.pipeline import analyze, summarize

    def progress(p: float, msg: str) -> None:
        if msg in ("PARTIAL", "PREVIEW"):
            print(msg, flush=True)
        else:
            print(f"PROGRESS {p:.2f} {msg}", flush=True)

    try:
        result = analyze(args.song, args.out, audio_hash=args.hash, progress=progress, full=not args.fast)
    except Exception as e:  # report, don't crash silently
        print(f"ERROR {type(e).__name__}: {e}", flush=True)
        return 1
    print(f"SUMMARY {summarize(result)}", flush=True)
    print("DONE", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
