# Stages

Turn a song and a camera roll into a music-driven 9:16 video. See [vision.md](vision.md) for the product, [roadmap.md](roadmap.md) for the build plan and [status.md](status.md) for where things stand.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js app: the Song → Photos → Stage → Remix → Export flow, Studio, Custom Stage maker, API routes, job runner |
| `packages/project` | Shared data model (Analysis, Stage, Project), timing rules, migrations |
| `packages/stages` | The Stage engine: behaviors (pure), looks (Remotion components), registry, auto-pick, timeline. `@stages/stages/core` is the React-free part |
| `services/analysis` | Python music engine: beats/bars (Beat This!), sections, drums, notes (basic-pitch), stems (Demucs), YouTube import (yt-dlp) |
| `services/render` | Render worker + CLI: Remotion bundle cache, asset server, MP4 with audio + silent; photo pipeline; song storage |
| `scripts` | UI screenshot and end-to-end checks |
| `data/` | Local storage (created on first run, git-ignored) |

## Setup

Requirements: Node 20+, Python 3.12+ (tested on 3.14), Google Chrome or Edge installed (used for rendering; otherwise Remotion downloads its headless shell).

```bash
npm install

cd services/analysis
python -m venv .venv
.venv/Scripts/python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu   # bin/python on macOS/Linux
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pip install --no-deps basic-pitch
cd ../..
```

Model weights (Beat This!, Demucs) download on first use.

## Run

```bash
cd apps/web && npx next dev        # http://localhost:3000
```

Make a video without the UI:

```bash
node services/render/src/cli.mjs --song "https://www.youtube.com/watch?v=xnP7qKxwzjg" --photos ./my-photos --stage beat-flash --clip 15
#   --stage beat-flash | piano | auto      --clip 15 | 30 | 60      --no-watermark      --fast (skip notes/drums)
```

## Test

```bash
npm test                     # Stage engine unit tests (frame accuracy, behaviors, pins, density…)
npm run typecheck
services/analysis/.venv/Scripts/python services/analysis/tests/make_test_songs.py services/analysis/tests/songs
npm run test:analysis        # beat/bar/section/note accuracy on songs with ground truth
node scripts/screenshot.mjs http://localhost:3000/ out.png [--mobile]
node scripts/e2e-stage-maker.mjs http://localhost:3000 <projectId> <objectPhoto.jpg> out.png
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `STAGES_DATA_DIR` | `./data` | Where songs, photos, projects and renders are stored |
| `STAGES_PYTHON` | analysis venv | Python used for analysis and YouTube import |
| `STAGES_STEMS` | `auto` (GPU only) | `1` forces Demucs stems on CPU (slow), `0` disables |
| `STAGES_BEAT_ENGINE` | `auto` | `librosa` skips Beat This! |
| `STAGES_BROWSER` | local Chrome/Edge | Browser executable for rendering |
| `STAGES_BROWSER_MODE` | — | `headless-shell` to use Remotion's downloaded shell instead of local Chrome |
| `STAGES_RENDER_CONCURRENCY` | CPU count | Parallel frames while rendering |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | — | Send funnel events to PostHog instead of `data/events.jsonl` |
