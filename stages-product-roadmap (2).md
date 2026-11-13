# Stages: Product Roadmap

> Turn a camera roll and a favorite song into a beat-synced 9:16 video in under a minute.

---

## 1. Product summary

**Problem.** People have photos and know the music they like, but they don't know how to turn the two into a post that looks good. Video editors take too long to learn, and templates look generic.

**Solution.** Stages turns a song into a visual object called a *Stage*: a set of shapes that work as windows, with the user's photos showing through them. The music decides which window opens and when.

| Stage | How the music drives it |
|---|---|
| **Beat Flash** (hero) | Photos flash in on a white screen on every beat. On the first beat of each bar, a photo goes full screen. |
| **Piano** | The song is turned into notes. Each note presses its key, and a photo rises out of that key. |
| **Custom** | The user uploads a photo of an object (e.g. their keyboard), taps the parts that should become windows, and photos play through them. |

**Core flow:** upload song → pick or auto-pick a Stage → drop in photos → preview → render → export (with and without audio).

**Positioning:** a recognizable graphic style instead of generic slideshows. It works with as few as 5 photos.

---

## 2. Roadmap at a glance

| Phase | Timing | Goal | Exit criteria |
|---|---|---|---|
| **1. Hackathon** | Now | A demo that never breaks | 3 polished demo videos; live Custom Stage render works |
| **2. Beta** | Weeks 1–4 | Find and fix where users drop off | 20–50 active creators; most people who start a video finish rendering it |
| **3. Launch** | Month 2 | First revenue and a growth loop | Stripe Pro live; watermark loop measurable; Product Hunt launch |
| **4. Scale** | Month 3+ | Mobile-first, network effects | Mobile app live; direct posting; Stage marketplace beta |

---

## 3. Phase 1: Hackathon (now)

**Goal:** a live demo that cannot fail, and that people remember.

### Deliverables

- [ ] **Beat Flash Stage**: beat detection (librosa), a flash on every beat, a full-screen photo on the first beat of each bar
- [ ] **Piano Stage**: notes from the song (basic-pitch), each note mapped to a key, photos rising out of the keys
- [ ] **Beat sync engine**: every cut and animation lines up with beat and note times
- [ ] **9:16 export**: 1080x1920 MP4 (H.264, 30fps), with audio and silent
- [ ] **Custom Stage (live demo)**: upload a keyboard photo → tap the keys → render
- [ ] **3 killer demo videos**, rendered ahead of time and stored offline so the demo never depends on Wi-Fi

### Tech stack

| Layer | Choice |
|---|---|
| Song analysis | librosa (beats, downbeats), basic-pitch (notes), Demucs (vocal separation, if needed) |
| Object windows | Tapping the keys by hand (dependable); SAM 2 auto-cutout as an upgrade |
| Rendering | Remotion (one component per Stage) |
| Frontend | Next.js on Vercel |
| Backend / storage | Supabase |
| GPU jobs | Replicate or fal.ai (Demucs, SAM 2); Modal for custom jobs |

### Demo script (about 2 minutes)

1. Problem: "You have 30 photos from last weekend and no idea how to post them."
2. Play pre-rendered demo #1 (Beat Flash).
3. Live: upload a keyboard photo, tap the keys, render a Custom Stage.
4. Show the silent export and explain the music-licensing workaround.
5. Close with the roadmap and the growth loop (watermark).

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| Live render is slow or fails | Pre-rendered videos as backup; short clip (15s) for the live render |
| SAM 2 cuts out the wrong shapes | Tapping keys by hand is the default; auto-cutout is optional |
| Venue Wi-Fi | Demo videos stored on your laptop; analysis cached locally |

---

## 4. Phase 2: Beta (weeks 1–4)

**Goal:** learn what real creators do, and fix the flow before adding features.

### Who

- 20–50 TikTok and Reels creators
- Berkeley friends who post photo dumps

### Deliverables

- [ ] Hosted web app with sign-in (Supabase Auth)
- [ ] PostHog funnel: `song_uploaded → stage_selected → photos_added → preview_viewed → render_started → export_downloaded`
- [ ] Session replays on the steps where people drop off most
- [ ] Log every song and Stage choice for each render
- [ ] In-app feedback prompt after the first export
- [ ] Weekly creator check-ins (5 calls per week)

### Operating principle

**Fix the flow, not the features.** Ship no new Stage until the core funnel is healthy.

### Success metrics (targets to validate)

| Metric | Target |
|---|---|
| Upload → export completion | ≥ 60% |
| Time from upload to export | < 90 seconds |
| Exports that get posted | ≥ 40% (self-reported or link shared) |
| Week-2 return rate | ≥ 30% |

### Outputs that feed Phase 3

- Ranked list of the most-used songs and Stages → the next built-in Stages
- Top 3 points where users drop off, each with a fix shipped
- 5–10 creator testimonials and example videos for launch

---

## 5. Phase 3: Launch (month 2)

**Goal:** first revenue, and a growth loop where every export markets the product.

### Deliverables

- [ ] **Stripe Pro plan**: no watermark, longer videos, all Stages, faster rendering *(price to validate in beta)*
- [ ] **Watermark on free exports**: small "made with Stages" mark; it's the growth engine
- [ ] **Own social channels**: daily TikTok and Instagram posts using trending songs
- [ ] **Product Hunt launch**: demo video, creator testimonials, launch-day offer
- [ ] 2–3 new built-in Stages based on what beta users used most

### Free vs Pro (draft)

| | Free | Pro |
|---|---|---|
| Stages | Beat Flash + Piano | All, including Custom |
| Watermark | Yes | No |
| Max length | 15s | 60s |
| Render queue | Standard | Priority |

### Success metrics (targets to validate)

| Metric | Target |
|---|---|
| Free → Pro conversion | 3–5% |
| Share of new sign-ups who came from the watermark | Track from day 1 |
| Product Hunt | Top 5 of the day |

---

## 6. Phase 4: Scale (month 3+)

**Goal:** be wherever people post, and let creators build Stages.

### Deliverables

- [ ] **Mobile app** (React Native / Expo): posting happens on phones, and so does the camera roll
- [ ] **Direct posting** via TikTok's Content Posting API and Instagram's Graph API *(both require platform app review; plan for the wait)*
- [ ] **Stage marketplace**: creators design and sell Stages, and you take a cut
- [ ] **Stage SDK**: documented Remotion component format for third-party Stages
- [ ] **Music licensing partnerships** (later): in-app audio on exports

---

## 7. Costs to expect early

| Service | Use | Pricing model |
|---|---|---|
| Replicate / fal.ai | Demucs, SAM 2 | Pay per run |
| Remotion | Rendering | Free for small teams; company license once you grow |
| Supabase | Auth, database, storage | Free tier covers hackathon + beta |
| Vercel | Web hosting | Free tier covers hackathon + beta |
| Modal | Custom GPU / render jobs | Free credits, then pay per use |
| PostHog | Analytics, session replay | Free tier covers beta |
| Stripe | Payments | Per-transaction fee |

---

## 8. Music and copyright

- Copyrighted tracks can get muted when uploaded. **Always export a silent version** so creators can add the song from TikTok's or Instagram's own music library.
- Show the creator the start time of the part of the song the video was built on (e.g. "start the sound at 0:47") so the platform's audio lines up with the cuts.
- Lyric text is copyrighted too; any lyric overlays stay optional.
- In-app licensed audio waits for Phase 4 partnerships.

---

## 9. Open questions

- Pro pricing: monthly subscription, per-export credits, or both?
- Which 2–3 Stages come after Beat Flash and Piano? (Decide from beta data.)
- Web-first vs mobile-first after beta: does the data show people creating on phones?
- Marketplace revenue split and how Stages get reviewed before they're listed.
