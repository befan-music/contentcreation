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
node scripts/e2e-magic.mjs http://localhost:3000 <song.m4a> <photoDir> minecraft   # app started with STAGES_MAGIC_PROVIDER=mock
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
| `HIGGSFIELD_KEY` | — | `<key id>:<secret>` from the Higgsfield Console; turns on the **Magic** Stage. Put it in `apps/web/.env.local` (see `apps/web/.env.example`) |
| `HIGGSFIELD_IMAGE_MODEL` | `xai/grok-imagine-image-2.0` | Image model for Magic (`ideogram/v4.0` keeps more of the original) |
| `STAGES_MAGIC_MAX` | `40` | Max photos styled per Generate press (cost guard) |
| `STAGES_MAGIC_PROVIDER` | — | `mock` = local test filter instead of AI (no credits; clearly labelled) |
| `STAGES_YTDLP_IPV6` | — | `1` lets YouTube downloads use IPv6 (off by default: broken IPv6 makes them hang) |

## Magic Stage (AI)

1. Create an API key in the [Higgsfield Console](https://console.higgsfield.ai).
2. `cp apps/web/.env.example apps/web/.env.local` and set `HIGGSFIELD_KEY=<key id>:<secret>`.
3. Restart the app, then check the key: `node scripts/higgsfield-check.mjs`
   (add `--style minecraft --photo some.jpg --out styled.jpg` to restyle one photo for real; costs one image).
4. In the app: Stage → **Magic** → type a style or pick a preset → **Generate**. Each photo becomes one AI image; results are saved per style so the export matches the preview. **New variation** asks the model for a fresh take.

If the dev server starts reloading pages in a loop after a crash or a forced stop, stop it and delete `apps/web/.next`.
