"""Download a song's audio from a YouTube link.

    python fetch_song.py URL OUT_DIR

Prints one line:  RESULT {"path": ..., "name": ..., ...}   or   ERROR <message>
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    if len(sys.argv) != 3:
        print("ERROR usage: fetch_song.py URL OUT_DIR", flush=True)
        return 2
    from stages_analysis.youtube import fetch

    try:
        result = fetch(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(f"ERROR {e}", flush=True)
        return 1
    print("RESULT " + json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
