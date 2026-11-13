# Stages: Build Status

> Progress against [roadmap.md](roadmap.md). How to set up and run: [README.md](README.md).
> Last update: 2026-11-13

## Summary

| # | Phase | Status |
|---|---|---|
| 0 | Foundations | 🟢 Done locally · ⛔ CI, hosted environments and error tracking need accounts |
| 1 | Music engine | 🟢 Done · ⚠️ section labels and notes are weak; slower than target on CPU |
| 2 | Render engine + first Stages | 🟢 Done · ⚠️ render time 2–4× the target on this laptop |
| 3 | Core app | 🟢 Flow done in **local mode** · ⛔ sign-in and hosting need Supabase/Vercel |
| 4 | Private beta | ⛔ Needs real users; instrumentation is ready |
| 5 | Remix | 🟢 Done except dragging a photo inside its window |
| 6 | Custom Stages | 🟢 Done except SAM 2 tap-to-cut-out (needs a Replicate/fal.ai key) |
| 7 | Studio | 🟢 Done except a phone-tuned timeline |
| 8 | Monetization + launch | ⛔ Needs Stripe, a domain, a legal decision on YouTube import |
| 9 | Mobile + direct posting | ⛔ Needs Apple/Google developer accounts and TikTok/Meta app review |
| 10 | Stage platform | ⚪ Not started (the Custom Stage format is already the SDK seed) |

**Added during the build, on request:** songs from **YouTube links** (Tame Impala – Dracula works end to end).

### Proof it works

Videos rendered during the build (local, in `data/`):

| Video | Stage | How it was made |
|---|---|---|
| `data/renders/cli/tame-impala-dracula-beat-flash-15s.mp4` (+ `-silent`) | Beat Flash | CLI, YouTube link + 16 photos |
| `data/renders/cli/tame-impala-dracula-piano-15s.mp4` (+ `-silent`) | Piano | CLI |
| `data/renders/9da8243aabc7/8040bf4c3998.mp4` (+ `-silent`) | Custom "Shelf windows" | Web app: Stage made in the browser, rendered through the job runner |

Checked frame by frame against the analysis: bar starts give full-screen photos, beats stack flash cards, Piano keys press with photos rising, Custom windows open 1 → 2 → 3 → 4 on the beat.

---

## Phase 0: Foundations

- [x] Monorepo (npm workspaces): `apps/web`, `packages/project`, `packages/stages`, `services/analysis`, `services/render`, `scripts`
- [x] Schemas v1 with a `version` field and `migrateProject()` ([types.ts](packages/project/src/types.ts))
- [x] Test song set: **7 synthetic songs** (82–160 bpm, offset starts) with exact ground truth ([make_test_songs.py](services/analysis/tests/make_test_songs.py))
- [ ] **Real test songs (30–50, hand-checked)**: needs songs from the team; the evaluator accepts `<name>.wav` + `<name>.truth.json`
- [x] Test photos: `GOMI/videogeneration/pictures` (16 photos)
- [x] `.gitignore`, README, `npm test` / `npm run typecheck`
- [ ] CI, dev/staging/prod, secrets, error tracking: need GitHub/Vercel/Sentry accounts

## Phase 1: Music engine

| Part | Engine | Fallback |
|---|---|---|
| Beats + bar starts | **Beat This!** (`final0`, CPU) | librosa + bar-phase heuristic |
| Sections | Bar-level novelty (harmony + timbre + energy), labels from energy/repetition | — |
| Stems | **Demucs htdemucs**, on by default only with a GPU (`STAGES_STEMS=1` forces) | full mix |
| Drum hits | Band onsets on a mel-spectrogram percussive split | — |
| Notes | **basic-pitch** (ONNX) on melody/bass stems or the full mix | CQT peak tracker |
| Decoding | libsndfile + soxr; **PyAV** for m4a/aac | ffmpeg |
| YouTube | **yt-dlp** (Node as its JS runtime), youtube.com/youtu.be/music links only, ≤ 15 min | — |

- [x] Two passes: beats/bars/sections/clip first (`PARTIAL`), then drums + notes; the UI continues after the first
- [x] Clip suggestion (15/30/60 s): starts on a bar, prefers a chorus/drop, ends on a bar
- [x] Analysis cached by audio hash (a second import of the same song is instant)
- [x] Evaluation script ([evaluate.py](services/analysis/tests/evaluate.py))
- [ ] Click-track listening tool

**Accuracy (synthetic set):** beats and bars correct on **7/7** songs (F ≥ 0.98) ✅. Section boundaries: perfect on 3, weak on 4. Notes (full mix): F ≈ 0.3.

**Speed, Dracula (3:53), 8-core laptop, no GPU:** decode 1.6 s · beats ~20–50 s · sections ~9 s · drums ~17 s · notes ~29 s. First pass ≈ 30–60 s, full ≈ 1.5–2.5 min. Target was ~10 s / ~60 s → **needs the GPU worker** (Modal) in production.

## Phase 2: Render engine + first Stages

- [x] Timing core: one rounding rule; **unit test proves every hit lands on its nearest frame**
- [x] Behaviors (pure, no React/Remotion, `@stages/stages/core`): `beat-flash`, `piano`, `like-piano`, `beat-order`, `random`, `bar-hit`
- [x] Looks: **Beat Flash**, **Piano** (keyboard fitted to the song's range, light beams, ≤ 1 rising photo per eighth note), **Photo Stage** (Custom, polygon windows)
- [x] Photo pipeline: HEIC → JPEG, EXIF rotation, resize, **720 px card versions**, focal point (sharp attention)
- [x] Render worker: cached bundle (6 s rebuild), Range-capable asset server, H.264 + AAC, silent copy by stream copy, all CPU cores
- [x] CLI: `cli.mjs --song <file|youtube> --photos <dir> --stage beat-flash|piano|auto --clip 15|30|60`

**Render time (15 s clip, 439 frames):** Piano **61 s** (was ~220 s before optimizing images and shadows) · Custom Stage 119 s · target ~30 s. Next steps: Remotion Lambda / Modal render workers, and a cheaper glow on Custom windows.

## Phase 3: Core app (local mode)

- [x] Projects home; new video; autosave (debounced) with "Saving…/Saved"
- [x] **Song:** drag-drop/upload *or* **YouTube link**; upload progress; analysis progress; waveform with sections, bar ticks and a draggable, bar-snapping clip window; 15/30/60 s; "Play clip"; "Use suggestion"
- [x] **Photos:** multi-upload in batches, resized in the browser first; drag to reorder; ‹ › ✕ buttons on touch; "5 minimum ✓"
- [x] **Stage picker:** live 9:16 preview with the user's song and photos (Remotion Player), *Recommended* badge, Auto per section, Custom Stages, "Make your own"
- [x] **Export:** render job with progress, resumes after reload, playable result, downloads with and without audio, "start the sound at m:ss", watermark toggle
- [x] Jobs: analysis, YouTube import, render (one at a time), persisted in `data/jobs`
- [x] Funnel events (`project_created → song_uploaded → photos_added → stage_selected → render_started → export_downloaded`, plus `knob_changed`, `photo_pinned`, `studio_opened`, `hit_edited`, `section_edited`, `custom_stage_created`): PostHog if `NEXT_PUBLIC_POSTHOG_KEY` is set, else `data/events.jsonl`
- [x] Checked in Chrome at desktop and phone width (390 px): no horizontal scroll, no page errors
- [ ] Sign-in (Supabase Auth) and cloud storage: no Supabase project yet; storage is behind one module ([store.ts](apps/web/lib/server/store.ts)) for the swap
- [ ] Privacy policy, terms, deleting files from disk when a photo/song/account is removed
- [ ] "5 people make a video unaided" test

## Phase 5: Remix

- [x] Section-aware Auto ("Auto: per section" card)
- [x] Section strip: a different Stage per section (disabled with a hint when the clip is a single section)
- [x] Knobs generated from each Stage's parameter list (density, triggers, intensity, colors, toggles)
- [x] Triggers: beat / kick / snare / melody / bass, falling back to beats when there's no data
- [x] Energy pad (2D; moves density + intensity, rise time on Piano)
- [x] Pin a photo to the beat under the playhead; shuffle; "New look" (seed)
- [x] Undo/redo (Ctrl+Z / Ctrl+Shift+Z), space = play/pause
- [ ] Drag a photo inside its window (focal point editing)
- [ ] 1–2 new built-in Stages (wait for beta data)

## Phase 6: Custom Stages

- [x] Maker page: object photo → cropped to 9:16 around its subject → drag boxes or tap polygon corners → order (left-right / top-bottom / as drawn) → behavior (Like Piano, On the beat, Random, Bar hit) → live test with the project's song and photos → save to the library → back to the project with it selected
- [x] Server render of Custom Stages
- [x] End-to-end test: [e2e-stage-maker.mjs](scripts/e2e-stage-maker.mjs) ✅
- [ ] SAM 2 tap-to-cut-out (needs a Replicate or fal.ai API key)
- [ ] Detect repeated parts automatically

## Phase 7: Studio

- [x] Track timeline: Sections, Stages, Pins, Hits, Song (waveform + bar numbers), playhead following the preview
- [x] Drag Stage block edges (snap to bars), split at playhead, merge with next
- [x] Move section boundaries (snap to bars) and relabel sections
- [x] Hit lane: click to mute/unmute, double-click to add a hit on the 8th-note grid
- [x] Drag pinned photos to another beat; zoom 1–4×; reset hits/sections
- [ ] Duplicate a project to try a variant
- [ ] Phone-tuned timeline (works with touch, not designed for it yet)

---

## Decisions made during the build

- **Beat This!** for beats *and* bars: librosa doesn't detect bar starts.
- **Demucs off on CPU**: ~2.5 min for 80 s of audio is too slow; drums/notes come from the full mix unless a GPU is present.
- **PyAV for m4a**: launching ffmpeg from Python costs ~6 s per call on this machine.
- **Local Chrome renders frames**: the Remotion headless-shell download is blocked on this network (HTML "404 Not OK" from `remotion.media`). On servers, set `STAGES_BROWSER_MODE=headless-shell`.
- **Own seeded `random()`** in the engine so the pure parts (`@stages/stages/core`) run in server routes; Remotion can't load there.
- **All times are song times** (never clip-relative): moving the clip never breaks sections, blocks, pins or hit edits.
- **Photos first, then Stage** in the flow, so each Stage previews with the user's own photos.
- **TypeScript 5.9**, not 7 (TS 7 changed its API; Next.js may not support it yet). Remotion `Html5Audio` + `trimBefore` (the older props are deprecated).
- **YouTube import was built from scratch**: `GOMI/videogeneration` had no YouTube code.

## Risks / open items

- ⚠️ **YouTube import goes against YouTube's Terms of Service**, and the songs are copyrighted. Fine for a private prototype; needs a legal decision before any public launch (user uploads only, a licensed catalog, or link + platform audio only).
- ⚠️ **Remotion license**: the preview acknowledges Remotion's license (free for individuals and small teams); a company license is needed as the team grows.
- ⚠️ Section labels on songs with flat loudness (Dracula got many "chorus"/"bridge" labels). Users can relabel in Studio; a real-song test set is needed to improve them.
- Single-user local mode: no auth, everything in `data/`.

## Next steps (in order)

1. **Accounts**: Supabase (auth + storage), PostHog, Modal (GPU analysis + render workers), Vercel, Sentry. Then swap `store.ts` and the job runner for the hosted versions.
2. **Real-song test set** (30–50 songs, hand-checked beats/bars/sections) → tune section labels and note thresholds.
3. **Speed**: GPU analysis (stems on), distributed rendering → hit the 10 s / 60 s / 30 s targets.
4. Close the Phase 3 gaps (privacy, deletion) and run the **5-person unaided test**, then start the **private beta** (Phase 4).
