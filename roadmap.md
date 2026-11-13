# Stages: Build Roadmap

> The steps for building Stages as described in [vision.md](vision.md).

Phases are ordered by dependency, not by date. Each phase builds on the one before it and ends with a **Done when** check. Don't start a phase until the previous one passes its check, with one exception: the private beta (Phase 4) keeps running alongside everything after it.

---

## Overview

| # | Phase | Outcome |
|---|---|---|
| 0 | Foundations | Repo, stack, data model, test songs and photos |
| 1 | Music engine | Any song → reliable beats, bars, sections, notes and drum hits |
| 2 | Render engine + first Stages | Project file → beat-synced MP4 (Beat Flash, Piano) |
| 3 | Core app | A new user goes from song to downloaded video in the browser |
| 4 | Private beta | Real creators use it; the worst drop-off points are fixed |
| 5 | Remix | Stage per section, knobs, energy pad, photo pinning |
| 6 | Custom Stages | Users build Stages from photos of their own objects |
| 7 | Studio | The full track editor |
| 8 | Monetization + public launch | Pro plan, watermark loop, launch |
| 9 | Mobile + direct posting | Native app; posting straight to TikTok and Instagram |
| 10 | Stage platform | Shared Stages, the SDK, the marketplace |

---

## Architecture we're building toward

### Key decisions

1. **One project file drives everything.** The browser preview and the server render read the same JSON project, so what the user sees is what they get.
2. **Stages are pure functions of time.** What appears on frame N depends only on the project, the analysis and N. That makes scrubbing instant, lets renders be split into chunks that run in parallel, and makes output reproducible.
3. **Look and behavior are separate modules.** Built-in, Custom and SDK Stages all use the same interface. A behavior turns hits into a schedule of window events; a look draws the windows.
4. **Each song is analyzed only once.** Results are cached by a hash of the audio file, so if many users upload the same song it's analyzed a single time.
5. **Heavy work runs as background jobs** (analysis, stem separation, segmentation, rendering), with progress pushed to the browser. Fast results arrive first: beats within seconds, stems and notes after that.

### System

```
 Browser (Next.js)                          Workers
 ┌───────────────────────┐   jobs   ┌────────────────────────────┐
 │ Flow + Editor UI      │ ───────▶ │ Analysis (Python, GPU)     │
 │ Remotion Player       │          │  beats · bars · sections   │
 │  (live preview)       │          │  stems → drum hits · notes │
 └──────────┬────────────┘          ├────────────────────────────┤
            │ project JSON          │ Render (Remotion)          │
            ▼                       │  project → 2 × MP4         │
 ┌───────────────────────┐ ◀─────── ├────────────────────────────┤
 │ Supabase              │ results  │ Segmentation (SAM 2)       │
 │ Auth · Postgres ·     │          │  tap → window shape        │
 │ Storage · Realtime    │          └────────────────────────────┘
 └───────────────────────┘
```

### Stack

| Layer | Choice | Notes |
|---|---|---|
| Web frontend | Next.js + TypeScript on Vercel | Mobile-first |
| Live preview | Remotion Player | Same Stage components as the final render |
| Final render | Remotion server render (Remotion Lambda or workers on Modal) | Chunked, parallel |
| Auth, database, storage, realtime | Supabase | Realtime pushes job progress to the browser |
| Song analysis | Python: librosa (tempo, beats, onsets); a dedicated downbeat/structure model (madmom, Beat This! or all-in-one, chosen in Phase 1); Demucs (stems); basic-pitch (notes) | librosa doesn't detect downbeats or sections itself |
| GPU jobs | Modal for our own jobs; Replicate or fal.ai for hosted Demucs and SAM 2 | Pay per use |
| Window segmentation | SAM 2 | Tap a point and get a shape back |
| Analytics | PostHog | Funnels and session replay |
| Payments | Stripe (later Stripe Connect for marketplace payouts) | |
| Mobile | React Native / Expo | See the Phase 9 note on preview |

### Data model (first version)

```ts
type Analysis = {
  audioHash: string;
  duration: number;
  tempo: number;
  beats: number[];            // seconds
  downbeats: number[];        // bar starts
  sections: { start: number; end: number; label: "intro" | "verse" | "chorus" | "drop" | "bridge" | "outro" }[];
  notes: { start: number; end: number; pitch: number; velocity: number; stem: "melody" | "bass" }[];
  drums: { time: number; type: "kick" | "snare" | "hat" }[];
  energy: number[];           // loudness curve; used by auto-pick and the energy pad
};

type Window = { id: string; polygon: [number, number][]; order: number };

type Stage = {
  id: string;
  name: string;
  source: "builtin" | "custom" | "sdk";
  look:
    | { kind: "component"; component: string }
    | { kind: "photo"; imageUrl: string; windows: Window[] };
  behavior: string;           // "beat-flash" | "piano" | "beat-order" | "random" | "bar-hit" | ...
  params: ParamSchema;        // knobs, with defaults; also generates the knob UI
};

type Project = {
  version: number;
  songId: string;
  clip: { start: number; end: number };
  photos: { id: string; url: string; focal: { x: number; y: number }; pinnedTo?: number }[];
  sections?: Analysis["sections"];          // only if the user changed them
  blocks: { start: number; end: number; stageId: string; params: Record<string, unknown> }[];
  hits: { muted: number[]; added: { time: number; type: string }[] };
  export: { watermark: boolean };
};
```

---

## Phase 0: Foundations

**Goal:** make the decisions everything else builds on, once.

- [ ] Monorepo layout:
  - `apps/web`: the Next.js app
  - `packages/project`: the project schema, types and migrations between versions
  - `packages/stages`: Remotion Stage components, looks and behaviors
  - `services/analysis`: Python song analysis
  - `services/render`: the render worker
- [ ] Project and Analysis schemas, first version (above), with a `version` field so saved projects can be migrated later
- [ ] **Test song set:** 30–50 songs across genres and tempos (pop, hip-hop, EDM, rock, acoustic, slow ballads, songs that change tempo), with beats, bar starts and sections checked by hand. Every change to the music engine gets scored against this set.
- [ ] **Test photo set:** portrait, landscape, faces, group shots, iPhone HEIC files, and very small and very large images
- [ ] CI, dev / staging / production environments, secrets management, error tracking

**Done when:** a developer can clone the repo, run it, and render a placeholder 1080×1920 composition locally.

---

## Phase 1: Music engine

**Goal:** turn any song into reliable musical events.

- [ ] Upload and decode audio (mp3, m4a, aac, wav), converted to one standard sample rate
- [ ] Tempo, beats and onsets (librosa)
- [ ] Bar starts (downbeats): compare madmom, Beat This! and all-in-one on the test set and pick one
- [ ] Sections with labels (intro / verse / chorus / drop): all-in-one or a structural segmentation step
- [ ] Stem separation (Demucs): drums, bass, vocals, other
- [ ] Drum hits (kick and snare) detected from the drums stem
- [ ] Notes (basic-pitch), run separately on the melody and bass stems for cleaner results
- [ ] Energy curve
- [ ] Clip suggestion: the strongest 15s / 60s stretch (chorus or drop), starting on a bar
- [ ] Results arrive in stages: beats and bars first, then stems, drum hits and notes
- [ ] Cache results by audio hash
- [ ] **Click-track check tool:** plays the song with clicks on the detected beats and accents on bar starts, so a person can hear whether detection is right

**Done when:**
- With the click track on, beats and bar starts sound right on at least 90% of the test songs, and every failure is written down with its cause (tempo change, free rhythm, etc.).
- Beats come back within ~10 seconds of upload for a 3-minute song, and the full analysis within ~60 seconds. These are targets to adjust once we have a baseline.

---

## Phase 2: Render engine + first Stages

**Goal:** project file in, beat-synced video out.

- [ ] Remotion composition: 1080×1920, 30fps
- [ ] **Timing core:** converts hit times to frames, one rounding rule everywhere, shared by preview and render
- [ ] **Stage interface:** `behavior(hits, params) → window events`, plus a look that draws windows for each frame
- [ ] **Photo pipeline:** convert HEIC to JPEG, fix rotation from EXIF data, resize to render size, find a focal point (face detection) so photos crop well into any window shape
- [ ] **Beat Flash** Stage
- [ ] **Piano** Stage: keyboard look; each note's pitch maps to a visible key, and notes outside the shown range wrap into it
- [ ] Server render: H.264 MP4 with AAC audio, plus a silent version; watermark layer that can be switched on and off
- [ ] Chunked, parallel rendering
- [ ] Deploy render workers (Remotion Lambda or Modal) with job status and retries
- [ ] Dev command line tool: `stages render song.mp3 photos/ --stage beat-flash` → two MP4s

**Done when:**
- Every visual hit lands on the frame nearest its musical event, checked on the test set.
- A 15-second video renders in under ~30 seconds (target).

---

## Phase 3: Core app

**Goal:** someone who has never seen Stages can make a video and download it in the browser without help.

- [ ] Next.js app with Supabase Auth (email, Google, Apple) and a project list
- [ ] **Song screen:** upload, waveform with beat and bar markers, clip selector set to the suggested clip and snapping to bars
- [ ] **Photos screen:** select several photos at once, resize them in the browser before upload, reorder, minimum of five
- [ ] **Stage picker:** Beat Flash and Piano previewed with the user's own song and photos; switching is instant; a *Recommended* badge from simple auto-pick rules (tempo, energy, how many notes the song has)
- [ ] **Preview:** Remotion Player in a 9:16 phone frame, with audio in sync
- [ ] **Export screen:** live render progress, two downloads, "start the sound at m:ss"
- [ ] Analysis runs while the user picks the clip and photos; the UI only waits when it truly has to
- [ ] Autosave; reopen any project and export it again
- [ ] Works in mobile browsers (iOS Safari and Android Chrome): photo picker, audio autoplay rules, memory limits
- [ ] PostHog funnel: `song_uploaded → clip_selected → photos_added → stage_selected → preview_viewed → render_started → export_downloaded`
- [ ] Privacy policy and terms; users can delete their photos, songs and account
- [ ] Clear error messages, e.g. "This song has no steady beat. Try Piano or another song."

**Done when:**
- Five people who have never seen Stages each make and download a video without help.
- Time from song upload to first preview is under 60 seconds.

---

## Phase 4: Private beta

**Goal:** see what real creators do, and fix the flow before adding features.

**Rule: fix the flow, not the features.** No new feature work ships until the funnel is healthy.

- [ ] Invite 20–50 creators who post photo dumps on TikTok and Reels
- [ ] Session replays on the steps where people drop off most
- [ ] Log the song, Stage choice and Stages tried for every render
- [ ] Feedback prompt after the first export; 5 creator calls per week
- [ ] Track the cost of each video (analysis GPU time, render time, storage)
- [ ] Ship a fix for each of the 3 worst drop-off points

**Done when** (targets to validate):
- At least 60% of people who upload a song download a video
- At least 40% of exports get posted (self-reported or a link shared)
- At least 30% of users come back in week 2
- The cost per video is known

The beta group stays active for every phase after this one, and each new feature is tested with them first.

---

## Phase 5: Remix

**Goal:** users shape the result without learning anything.

- [ ] Section-aware auto-pick: the recommended result can use a different Stage per section
- [ ] **Section strip:** change the Stage for each section
- [ ] **Knobs** per Stage, with the UI generated from each Stage's parameter list: density, triggers, look
- [ ] **Triggers from stems:** follow the beat, kick, snare, melody or bass
- [ ] **Energy pad:** a 2D control that moves several knobs at once
- [ ] **Photo pinning:** pin a photo to a hit (e.g. the drop); shuffle the rest while pins stay in place
- [ ] **Framing:** drag a photo inside its window to reposition it
- [ ] Undo / redo
- [ ] 1–2 new built-in Stages, chosen from beta usage data

**Done when:**
- Any knob change shows up in the preview immediately on a mid-range phone.
- We know what share of beta users change at least one thing before exporting, and it keeps going up.

---

## Phase 6: Custom Stages

**Goal:** any user can turn a photo of an object into a Stage.

- [ ] Behaviors become standalone modules shared by built-in and Custom Stages: `piano`, `beat-order`, `random`, `bar-hit`
- [ ] *Like Piano* mapping: the pitch range of the notes in the clip is spread across however many windows the user made
- [ ] **Custom Stage maker:**
  - upload an object photo and crop it to 9:16
  - tap or draw windows (polygons)
  - set the window order (left to right by default; drag to change)
  - pick a behavior
  - test it with the current song
- [ ] Window rendering: the user's photo masked into each window shape over the object photo, with open and close animations (light up, rise, flash)
- [ ] **Library:** save, rename and reuse Custom Stages across projects
- [ ] **SAM 2 tap-to-cut-out:** tap once, get a suggested shape, then accept or adjust it
- [ ] Stretch: detect repeated parts automatically (e.g. every key on a keyboard at once)

**Done when:** a user makes a Custom Stage from a keyboard photo in under 2 minutes and uses it in an exported video.

---

## Phase 7: Studio

**Goal:** creators get full control, and every edit still stays on the beat.

- [ ] **Track timeline:** Sections, Stages, Photos, Hits and Song (waveform + bar numbers)
- [ ] Drag Stage block edges (they snap to bars); split and merge blocks
- [ ] Move section boundaries
- [ ] **Hit lane:** tap to mute or add hits, snapping to beat subdivisions
- [ ] Drag photos onto specific hits
- [ ] Zoom and scrub; keyboard shortcuts on desktop
- [ ] Duplicate a project to try a variant
- [ ] A touch-friendly timeline for phones

**Done when:** a creator can build an edit they have in mind, e.g. "Piano for the intro, Beat Flash on the drop, my best photo on the first hit of the drop", without help.

---

## Phase 8: Monetization + public launch

**Goal:** first revenue, and every free export markets the product.

- [ ] Stripe Pro plan: pricing model decided from beta data; billing portal
- [ ] Plan limits enforced on the server: length, watermark, Studio, number of Custom Stages, render priority
- [ ] **Watermark:** "made with Stages" plus a way to track sign-ups it brings in (a short link in the mark, and "where did you hear about us?" at sign-up)
- [ ] Priority render queue for Pro
- [ ] Landing page with example videos; our own TikTok and Instagram channels posting daily
- [ ] Public launch (e.g. Product Hunt) with beta creators' videos and testimonials
- [ ] **Apply for TikTok and Instagram API access now**, because app review takes a while and Phase 9 depends on it

**Done when:** we have paying users, and both free → Pro conversion and watermark-driven sign-ups are being measured.

---

## Phase 9: Mobile + direct posting

**Goal:** be where people create and post.

- [ ] Expo app (iOS and Android): camera roll picker, photo resizing on the device, the same project format and server render
- [ ] **Decide how preview works on mobile.** Remotion Player is a web component, so either run it inside a WebView or port the Stage drawing to a native renderer (e.g. React Native Skia). Build a prototype of each and compare.
- [ ] Push notification when a render finishes
- [ ] Post to TikTok via the Content Posting API
- [ ] Post to Instagram via the Graph API (this requires a professional, i.e. business or creator, Instagram account)
- [ ] Share sheet as a fallback for everything else

**Done when:** the app is in the App Store and Google Play, and a video can be posted to TikTok or Instagram without leaving it.

---

## Phase 10: Stage platform

**Goal:** creators build Stages for everyone.

- [ ] Share a Custom Stage by link so others can use it
- [ ] **Stage SDK:** the documented look + behavior interface, a local dev kit, a preview harness and the test songs
- [ ] **Sandboxing:** third-party Stage code runs isolated in render workers, with limits on time and memory
- [ ] Review process: quality, performance and content checks before a Stage is listed
- [ ] **Marketplace:** listings, prices, purchases, creator payouts (Stripe Connect), revenue split

**Done when:** the first Stage made by someone outside the team has been sold.

---

## Later: licensed music

- [ ] Partnerships so exports can include licensed audio inside the app

---

## Across all phases

- **Quality:** the test song set runs on every engine change. Reference frames of each Stage are rendered and compared automatically to catch visual regressions.
- **Performance budgets:** time to first preview, render time, and preview smoothness on a mid-range phone are measured every release.
- **Cost:** GPU time, render time and storage per video are tracked, and Pro is priced well above them.
- **Privacy:** user photos and songs are private by default and are deleted on request. Renders are kept only as long as we say they are.
- **Reliability:** jobs retry safely, and every failure shows the user a clear message.
- **Analytics:** every feature ships with its own tracking events.

---

## Key risks

| Risk | Mitigation |
|---|---|
| Analysis is wrong for some genres | Test song set and click-track checks; users can fix sections and hits in Studio; fall back to a plain beat grid |
| Preview is slow on phones | Resize photos before use, limit how many images are decoded at once, lower-resolution preview |
| Rendering costs too much | Chunked rendering, analysis cached by song, shorter max length on Free |
| Drifting into a CapCut clone | The principle "edit the music's choices, not the frames"; the first result must always be postable as-is |
| TikTok / Instagram app review delays | Apply during Phase 8 |
| Copyright | Silent export with every video; uploaded songs stay private and are never redistributed |
| Third-party Stage code is unsafe | Sandboxed rendering and review before listing |
| Remotion licensing | Free for small teams; budget for a company license as the team grows |
