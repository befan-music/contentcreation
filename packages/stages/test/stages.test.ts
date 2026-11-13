import { test } from "node:test";
import assert from "node:assert/strict";
import { FPS, songTimeToFrame } from "@stages/project";
import { buildTimeline, demoAnalysis, demoInput, hitClockAt, triggerHits, autoBlocks, energyToParams, PIANO, recommendStage } from "../src";

test("every hit lands on the frame nearest to it", () => {
  for (const start of [0, 0.37, 1.016, 2.5]) {
    const input = demoInput("beat-flash");
    input.project.clip = { start, end: start + 15 };
    const { blocks, clip } = buildTimeline(input);
    for (const e of blocks[0].events) {
      const expected = songTimeToFrame(e.t, clip);
      // first frame on which the composition considers the hit "happened"
      let f = 0;
      while (hitClockAt(f, clip.start, FPS) < e.t - 1e-9) f++;
      assert.equal(f, expected, `hit at ${e.t} (clip start ${start})`);
      assert.ok(Math.abs(f / FPS - (e.t - clip.start)) <= 0.5 / FPS + 1e-9);
    }
  }
});

test("timeline is deterministic", () => {
  const a = buildTimeline(demoInput("beat-flash"));
  const b = buildTimeline(demoInput("beat-flash"));
  assert.deepEqual(a, b);
});

test("beat flash: full screen on bar starts, flashes on other beats", () => {
  const { blocks } = buildTimeline(demoInput("beat-flash"));
  const ev = blocks[0].events;
  assert.equal(ev.length, 30); // 15 s at 120 bpm
  assert.equal(ev.filter((e) => e.kind === "full").length, 8); // ceil(30 / 4) bar starts
  assert.equal(ev[0].kind, "full");
  assert.equal(ev[1].kind, "flash");
});

test("density: half keeps bar starts, bar keeps one per bar", () => {
  const a = demoAnalysis();
  const edits = { muted: [], added: [] };
  const every = triggerHits(a, edits, 0, 15, "beat", "every").hits;
  const half = triggerHits(a, edits, 0, 15, "beat", "half").hits;
  const bar = triggerHits(a, edits, 0, 15, "beat", "bar").hits;
  assert.equal(every.length, 30);
  assert.equal(half.length, 15);
  assert.equal(bar.length, 8);
  assert.ok(bar.every((h) => h.bar));
  assert.ok(half.filter((h) => h.bar).length === 8);
});

test("muted and added hits change the beat list", () => {
  const a = demoAnalysis();
  const edits = { muted: [0.5], added: [{ time: 0.75, type: "beat" as const }] };
  const hits = triggerHits(a, edits, 0, 2, "beat", "every").hits.map((h) => h.t);
  assert.deepEqual(hits, [0, 0.75, 1, 1.5]);
});

test("photos cycle in order and a pinned photo lands on its hit", () => {
  const input = demoInput("beat-flash");
  input.project.photos = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, src: `p${i}.jpg`, width: 10, height: 10, focal: { x: 0.5, y: 0.5 } }));
  input.project.photos[3].pinnedTo = 8.0;
  const ev = buildTimeline(input).blocks[0].events;
  assert.deepEqual(ev.slice(0, 6).map((e) => e.photo), [0, 1, 2, 3, 4, 0]);
  assert.equal(ev.find((e) => Math.abs(e.t - 8) < 0.01)!.photo, 3);
});

test("piano: one rising photo per chord, all notes press keys", () => {
  const { blocks } = buildTimeline(demoInput("piano"));
  const ev = blocks[0].events;
  const groups = new Map<number, number>();
  for (const e of ev) if (e.showPhoto) groups.set(Math.round(e.t * 100), (groups.get(Math.round(e.t * 100)) ?? 0) + 1);
  assert.ok([...groups.values()].every((n) => n === 1));
  assert.ok(ev.length > groups.size);
});

test("piano falls back to beats when there are no notes yet", () => {
  const input = demoInput("piano");
  input.analysis = { ...input.analysis, notes: [], status: "partial" };
  const { blocks } = buildTimeline(input);
  assert.equal(blocks[0].fellBack, true);
  assert.equal(blocks[0].events.length, 30);
});

test("section-aware auto blocks cover the clip", () => {
  const a = demoAnalysis();
  const blocks = autoBlocks(a, { start: 2, end: 30 }, a.sections);
  assert.equal(blocks[0].start, 2);
  assert.equal(blocks[blocks.length - 1].end, 30);
  for (let i = 1; i < blocks.length; i++) assert.equal(blocks[i].start, blocks[i - 1].end);
});

test("energy pad maps to density and intensity", () => {
  assert.equal(energyToParams(0.1, 0.2, PIANO).intensity, 0.2);
  assert.equal(energyToParams(0.9, 1, PIANO).rise, 1.6);
});

test("recommendation is Beat Flash without notes", () => {
  const a = { ...demoAnalysis(), notes: [] };
  assert.equal(recommendStage(a, { start: 0, end: 15 }).stageId, "beat-flash");
});

// Magic -------------------------------------------------------------------------
import { styleKey, normalizePrompt, missingMagic, magicRequests, buildMagicPrompt } from "../src";

test("magic: style key is stable, normalized, and changes with the variation", () => {
  assert.equal(styleKey("Minecraft", 0), styleKey("  minecraft ", 0));
  assert.notEqual(styleKey("minecraft", 0), styleKey("minecraft", 1));
  assert.notEqual(styleKey("minecraft", 0), styleKey("anime", 0));
  assert.match(styleKey("minecraft"), /^[0-9a-f]{12}$/);
  assert.equal(normalizePrompt("  Lego   Bricks "), "lego bricks");
  assert.match(buildMagicPrompt("minecraft"), /minecraft style/);
});

test("magic: one new photo per bar, the other beats pulse", () => {
  const input = demoInput("magic");
  input.project.stageParams = { prompt: "minecraft" };
  input.project.photos = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, src: `p${i}.jpg`, width: 10, height: 10, focal: { x: 0.5, y: 0.5 } }));
  const ev = buildTimeline(input).blocks[0].events;
  const photoEvents = ev.filter((e) => e.showPhoto);
  assert.equal(ev.length, 30); // every beat is an event
  assert.equal(photoEvents.length, 8); // one per bar in 15 s at 120 bpm
  assert.ok(photoEvents.every((e) => e.kind === "full"));
  assert.deepEqual(photoEvents.slice(0, 6).map((e) => e.photo), [0, 1, 2, 3, 4, 0]);
  assert.ok(Math.abs(photoEvents[0].dur - 2) < 1e-6); // holds for one bar
});

test("magic: pace every 2 bars / every 2 beats", () => {
  const input = demoInput("magic");
  input.project.stageParams = { prompt: "x", pace: "bar2" };
  assert.equal(buildTimeline(input).blocks[0].events.filter((e) => e.showPhoto).length, 4);
  input.project.stageParams = { prompt: "x", pace: "half" };
  assert.equal(buildTimeline(input).blocks[0].events.filter((e) => e.showPhoto).length, 15);
});

test("magic: missing styles block the render until every photo has one", () => {
  const input = demoInput("magic");
  input.project.stageParams = { prompt: "minecraft", variation: 2 };
  input.project.photos = [
    { id: "a", src: "a.jpg", width: 1, height: 1, focal: { x: 0.5, y: 0.5 } },
    { id: "b", src: "b.jpg", width: 1, height: 1, focal: { x: 0.5, y: 0.5 } },
  ];
  const [req] = magicRequests(input.project, input.analysis);
  assert.equal(req.key, styleKey("minecraft", 2));
  assert.deepEqual(missingMagic(input.project, input.analysis)[0].photoIds, ["a", "b"]);
  const style = { src: "s.jpg", prompt: "minecraft", model: "test", createdAt: "" };
  input.project.photos = input.project.photos.map((p) => ({ ...p, styles: { [req.key]: style } }));
  assert.equal(missingMagic(input.project, input.analysis).length, 0);
});

// Cut & Flow --------------------------------------------------------------------
import { CUT_FLOW_TRANSITIONS, photoHitIndices } from "../src";

test("cut & flow: first photo just appears, then transitions cycle through all four", () => {
  const input = demoInput("cut-flow");
  const photoEvents = buildTimeline(input).blocks[0].events.filter((e) => e.showPhoto);
  assert.equal(photoEvents.length, 8);
  assert.equal(photoEvents[0].variant, "none");
  const used = photoEvents.slice(1, 5).map((e) => e.variant);
  assert.deepEqual([...used].sort(), [...CUT_FLOW_TRANSITIONS].sort());
  assert.equal(photoEvents[5].variant, photoEvents[1].variant); // cycles
});

test("cut & flow: a fixed transition is used for every photo", () => {
  const input = demoInput("cut-flow");
  input.project.stageParams = { transition: "water" };
  const v = buildTimeline(input).blocks[0].events.filter((e) => e.showPhoto).map((e) => e.variant);
  assert.ok(v.slice(1).every((x) => x === "water"));
});

test("photo hits: every bar / 2 bars / 2 beats / beat", () => {
  const a = demoAnalysis();
  const beats = triggerHits(a, { muted: [], added: [] }, 0, 15, "beat", "every").hits;
  assert.equal(photoHitIndices(beats, "bar").size, 8);
  assert.equal(photoHitIndices(beats, "bar2").size, 4);
  assert.equal(photoHitIndices(beats, "half").size, 15);
  assert.equal(photoHitIndices(beats, "beat").size, 30);
});
