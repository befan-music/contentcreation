# Stages: Product Vision

> Turn a song and a camera roll into a music-driven 9:16 video. The music makes the edit; you make it yours.

How we build it: see [roadmap.md](roadmap.md).

---

## 1. In one paragraph

Stages is a music-first video maker for TikTok and Instagram Reels. You bring a song and some photos. Stages analyzes the song for its beats, bars, sections, notes and drum hits, and uses those to drive a **Stage**: a visual instrument whose windows open in time with the music, with your photos showing through them. You pick the Stage, and you get a finished video right away. From there you can keep playing with it: switch Stages, turn knobs, pin your best photo to the drop, or open the full track editor, the way you would in GarageBand. Every edit stays on the beat, because the song is the grid.

---

## 2. The problem

- People have photos and know the songs they love, but turning the two into a post that looks good is hard.
- General video editors like CapCut and Premiere can do it, but cutting to music is manual work and the tools take time to learn.
- Templates are fast but generic: everyone's video looks the same, and you can't change much.

Nothing sits in between: as fast as a template, with real creative control, and always in sync with the music.

---

## 3. The idea

- **The song is the conductor.** Stages breaks the song down into musical events: beats, bar starts, sections, notes and drum hits.
- **The Stage is the instrument.** It's a set of shapes that work as windows, plus a rule for which window opens on which musical event.
- **Your photos are the content.** They show through the windows.

The same song and photos in a different Stage give a completely different video. That's the core of the product: users play with Stages to shape the result.

**Positioning:** *CapCut lets you edit video. Stages lets you play your photos like an instrument.*

---

## 4. Who it's for

| Who | What they want | Where they spend their time in Stages |
|---|---|---|
| **The poster** | A good-looking photo dump in a minute, with nothing to learn | Picking a Stage, a little Remix |
| **The creator** | A recognizable style and control over the moments that matter | Remix and Studio |
| **The Stage maker** | To design their own visual instruments, then share or sell them | Custom Stages, later the Stage SDK |

---

## 5. Core concepts

| Term | Meaning |
|---|---|
| **Song analysis** | Everything Stages extracts from a song: tempo, beats, bar starts (downbeats), sections (intro, verse, chorus, drop), notes (pitch and timing), drum hits (kick, snare) and an energy curve |
| **Clip** | The part of the song the video uses (e.g. 15s or 60s) |
| **Hit** | One musical event that can trigger a visual: a beat, a bar start, a note, a kick |
| **Stage** | A *look* (the windows) + a *behavior* (which window opens on which hit) + *knobs* |
| **Window** | A shape on the Stage that a photo shows through |
| **Behavior** | The rule that maps hits to windows, e.g. "each note opens the key for its pitch" |
| **Knobs** | A Stage's adjustable settings: density, triggers, look, energy |
| **Stage block** | A stretch of the timeline played by one Stage. A video can have several, e.g. one per song section |
| **Project** | Everything about one video: song, clip, photos, Stage blocks, knob values and edits. Saved, so it can be edited again later |

---

## 6. Stages

Every Stage has two parts: a **look** (the windows) and a **behavior** (the rule for when each window opens). Keeping the two separate is what allows three kinds of Stage.

### 6.1 Built-in Stages (made by us)

| Stage | Look | Behavior |
|---|---|---|
| **Beat Flash** (hero) | White screen; photos appear as flashes | A photo flashes in on every beat. On the first beat of each bar, a photo goes full screen |
| **Piano** | A piano keyboard | The song's notes press their keys, and a photo rises out of each pressed key |
| *More* | Chosen from usage data | |

### 6.2 Custom Stages (made by users, no code)

Anyone can make a Stage from a photo of a real object, such as their keyboard, a building's windows, a guitar neck or a shelf.

1. **Upload a photo** of the object.
2. **Tap the parts** that should become windows. This starts by hand; later, one tap and AI cuts out the shape.
3. **Pick a behavior:**
   - *Like Piano:* windows are ordered like pitches, and each note opens its window.
   - *On the beat:* windows open in order, one per beat.
   - *Random:* a random window opens on each beat.
   - *Bar hit:* a full-screen photo appears on each bar start.
4. **Done.** The Stage is saved to the user's library and works with any song.

### 6.3 Platform Stages (made by creators, with code)

Later, a documented **Stage SDK** lets designers and developers build new looks *and* new behaviors. Those Stages are listed in a **marketplace**, and their creators earn a share of each sale. Shared Custom Stages from 6.2 can start the marketplace before the SDK exists.

---

## 7. Three levels of control

Control is optional depth. No user ever has to use it.

| Level | What the user does | Who it's for |
|---|---|---|
| **Pick** | Song + photos → choose a Stage (one is marked *Recommended*) → finished video | Everyone; the default path |
| **Remix** | Change the Stage for each section, turn knobs, shuffle and pin photos | Most users stop here |
| **Studio** | A full track editor: Stage blocks on a timeline, editing individual hits, moving section boundaries | Creators who want full control |

The result at the **Pick** level must be good enough to post as it is.

---

## 8. Every way the user shapes the output

**Inputs**
- The song, and which part of it (the clip)
- Which photos, in what order, and pinning a photo to a moment such as the drop
- Photo framing: where each photo's focus point sits inside its window

**Stages**
- Which Stage to use
- A different Stage for each section of the song
- Their own Custom Stage

**Knobs** (on each Stage block)
- **Density:** every beat, every other beat, or every bar
- **Triggers:** follow the beat, kick, snare, melody or bass
- **Look:** background color, photo framing, transition style
- **Energy pad:** one 2D control, with calm ↔ intense on one axis and sparse ↔ busy on the other

**Timeline** (Studio)
- Mute or add individual hits
- Move section boundaries
- Drag where one Stage switches to the next (it snaps to bars)

**Export**
- With audio, silent, or both
- Length (15s / 60s)
- Watermark (removed on Pro)
- Optional text overlays, including lyrics the user types in

---

## 9. Product principles

1. **The music makes the edit.** Every visual change lands on a musical event. Nothing is ever off the beat.
2. **Edit the music's choices, not the frames.** Every control works in beats, bars, sections and notes. There's no frame-level cutting and there are no keyframes.
3. **Good by default, deep on demand.** The first result is postable. Control is there when the user wants it.
4. **Instant feedback.** Every change shows up in the preview right away, with the music playing.
5. **Works with five photos.** A small camera roll still makes a full video.
6. **Distinctive, not generic.** Each Stage has a graphic style people recognize in their feed.

---

## 10. The user flow

1. **Sign in** (Free or Pro).
2. **Add a song.** Upload an audio file. Analysis starts right away in the background.
3. **Pick the clip.** Slide a window over the waveform to choose the part of the song. Stages suggests the chorus or the drop, and the window snaps to bars.
4. **Add photos** from the camera roll or files. Five is enough.
5. **Pick a Stage.** Each Stage previews with *your own* song and photos, so you compare real results. One is marked *Recommended*. You can also make your own (Custom Stage).
6. **Play with it** (optional): Remix, or open Studio.
7. **Render and export.** Download the version with audio and the silent version, and see "start the sound at 0:47" for when you post.
8. **Post.** At first users download and post themselves. Later they can post straight to TikTok and Instagram from the app.

---

## 11. The experience (frontend)

### Screens

| Screen | What's on it |
|---|---|
| **Projects** | Your saved videos, a "New video" button and example videos |
| **Song** | Upload, a waveform with beat and bar markers, and the clip selector |
| **Photos** | Photo grid with reordering and a count indicator ("5 of 5 minimum ✓") |
| **Stage picker** | One card per Stage, previewing your song and photos; a *Recommended* badge; a "Make your own" card |
| **Editor** | A 9:16 preview + knobs (Remix). Expands into the track timeline (Studio) |
| **Custom Stage maker** | The object photo, tap to create windows, put them in order, pick a behavior, test with your song |
| **Export** | Render progress, two downloads, "start the sound at m:ss", and share / upgrade |

### The editor

```
┌────────────────────────────────────────────────────────────┐
│              ┌─────────┐   STAGE: Beat Flash               │
│              │         │   Density   ○━━━━━●  every beat   │
│              │  9:16   │   Triggers  [kick] [snare] [notes]│
│              │ preview │   Look      [white bg ▾]          │
│              │         │   ┌───────────┐ intense           │
│              └─────────┘   │      ●    │                   │
│   ▶  0:06 / 0:15           └───────────┘ calm  sparse→busy │
├──────────────────────────── Studio ────────────────────────┤
│ SECTIONS │ intro       │ verse            │ chorus / drop    │
│ STAGES   │ Piano       │ Beat Flash       │ Custom: keyboard │
│ PHOTOS   │ ▣  ▣        │ ▣ ▣ ▣ ▣ ▣ ▣      │ ▣ 📌 ▣ ▣         │
│ HITS     │ ♪  ♪ ♪  ♪   │ | | | | | | | |  │ ||||||||||||||   │
│ SONG     │ ▁▃▅▃▁▂▃▅▇▅▃▂▁▃▅▇█▇▅▃▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅      │
│          │ 1     2     3     4     5     6     7     8 bars │
└────────────────────────────────────────────────────────────┘
```

- **Top half (Remix):** the preview and the selected Stage block's knobs.
- **Bottom half (Studio):** stacked tracks. Tap a Stage block to select it; drag its edges to move where it switches; drag a photo onto a hit to pin it; tap hits to mute or add them.

### Design rules

- **Mobile-first, including the web app.** Users' photos are on their phones, and that's where they post from.
- **Never make the user wait on analysis.** It runs while they pick the clip and photos.
- **What you see is what you get.** The browser preview and the final render are produced from the same project file.
- **One step per screen** in the creation flow, so drop-off at each step can be measured and fixed.
- **Keyboard shortcuts on desktop** (space to play, arrow keys to step through bars).

---

## 12. Output

- 1080×1920, 30fps, H.264 MP4
- Two files per export: with audio and silent
- The clip's start time in the original song, so the platform's own audio can be lined up with the cuts
- Free plan: a small "made with Stages" watermark

---

## 13. Music and copyright

- Copyrighted songs can be muted when uploaded to social platforms. **We always export a silent version** so creators can add the song from TikTok's or Instagram's own music library.
- We show the clip's start time in the song (e.g. "start the sound at 0:47") so the platform's audio lines up with the cuts.
- Lyrics are copyrighted too. Text overlays are optional and typed by the user.
- Songs that users upload stay private to their account and are never redistributed.
- In-app licensed music needs partnerships and comes later.

---

## 14. Business model

### Free vs Pro (draft, to validate with users)

| | Free | Pro |
|---|---|---|
| Control | Pick + Remix | Pick + Remix + Studio |
| Stages | All built-in Stages | All built-in Stages + marketplace purchases |
| Custom Stages | 1 | Unlimited |
| Max length | 15s | 60s |
| Watermark | Yes | No |
| Render queue | Standard | Priority |

### Growth

- **Watermark loop:** every free export that gets posted advertises Stages.
- **Own channels:** daily TikTok and Instagram posts made with Stages on trending songs.
- **Shared Stages:** a Custom Stage shared by link brings new users in to use it.
- **Marketplace:** later, a revenue share on Stages that creators sell.

---

## 15. Platforms

1. **Web app** first, designed for mobile browsers.
2. **Native mobile app** (iOS and Android), because the camera roll and posting are on phones.
3. **Direct posting** to TikTok and Instagram (both platforms require an app review).

---

## 16. What Stages is not

- **Not a general video editor:** no frame-level cuts, keyframes, layer stacks or effect chains.
- **Not a music editor:** the song is never remixed or changed.
- **Not a template shop:** Stages are instruments that respond to *your* song, not fixed timelines with blanks to fill in.

---

## 17. How we measure success

**North star: exported videos that get posted.**

| Metric | What it tells us |
|---|---|
| Time from song upload to first preview | Is the product fast enough? |
| Song upload → export completion | Does the flow work? |
| Share of exports that get posted | Are the videos good enough? |
| Share of users who try more than one Stage | Is the core idea (one input, many outputs) working? |
| Remix and Studio usage | Do people want control, and how much? |
| Custom Stages created and reused | Is making Stages a real habit? |
| Week-2 return rate | Do people come back? |
| Free → Pro conversion | Will people pay? |
| Sign-ups that came from the watermark | Is the growth loop working? |

---

## 18. Open questions

- Pricing: monthly subscription, export credits, or both?
- Should Custom Stages be fully free to drive growth, or partly Pro?
- Should short video clips and Live Photos be allowed as inputs alongside photos?
- Which Stages come after Beat Flash and Piano?
- How much should we focus on web vs mobile once real usage data comes in?
- Marketplace: the revenue split, and how Stages get reviewed before they're listed.
- Licensed in-app music: with which partners, and on what terms?
