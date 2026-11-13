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
