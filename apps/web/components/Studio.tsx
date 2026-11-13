"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HIT_MATCH_TOLERANCE,
  editedBeats,
  effectiveSections,
  formatTime,
  nearest,
  resolveClip,
  type Analysis,
  type Project,
  type Section,
  type StageBlock,
  type StageDef,
} from "@stages/project";
import { findStage } from "@stages/stages";
import { ASSET_BASE, track } from "@/lib/client";
import type { EditorApi } from "./Editor";
import st from "./studio.module.css";

const SECTION_COLORS: Record<string, string> = {
  intro: "#6b7cff",
  verse: "#3fa7ff",
  chorus: "#c6ff3d",
  drop: "#ff4fa3",
  bridge: "#ffb13d",
  outro: "#8b8b99",
};
const LABELS: Section["label"][] = ["intro", "verse", "chorus", "drop", "bridge", "outro"];

type Drag =
  | { kind: "block"; index: number; time: number }
  | { kind: "section"; index: number; time: number }
  | { kind: "pin"; photoId: string; time: number };

/**
 * Studio (roadmap Phase 7): the full track editor. Every edit is in musical
 * units: Stage and section boundaries snap to bars, pins and hits to beats.
 */
export function Studio({ api: editor, analysis, customStages, selectedBlock, onSelectBlock }: { api: EditorApi; analysis: Analysis; customStages: StageDef[]; selectedBlock: number; onSelectBlock: (i: number) => void }) {
  const { project, update, preview } = editor;
  const clip = resolveClip(project, analysis);
  const dur = clip.end - clip.start;
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [playhead, setPlayhead] = useState(clip.start);
  const lane = useRef<HTMLDivElement>(null);

  // Follow the preview's playhead.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = preview.current?.songTime();
      if (t !== undefined) setPlayhead((p) => (Math.abs(p - t) > 0.01 ? t : p));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [preview]);

  const bars = analysis.downbeats.filter((d) => d >= clip.start - 0.01 && d <= clip.end + 0.01);
  const { beats: liveBeats } = editedBeats(analysis, project.hits);
  const allBeats = analysis.beats.filter((b) => b >= clip.start - 0.01 && b < clip.end);
  const added = project.hits.added.filter((a) => a.time >= clip.start && a.time < clip.end);
  const isMuted = (t: number) => project.hits.muted.some((m) => Math.abs(m - t) < HIT_MATCH_TOLERANCE);
  const sections = effectiveSections(project, analysis).filter((x) => x.end > clip.start && x.start < clip.end);
  const blocks: StageBlock[] = project.blocks.length ? project.blocks : [{ id: "main", start: clip.start, end: clip.end, stageId: project.stageId, params: project.stageParams }];
  const pins = project.photos.filter((p) => p.pinnedTo !== undefined && p.pinnedTo >= clip.start && p.pinnedTo < clip.end);

  const pct = (t: number) => `${((t - clip.start) / dur) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    return clip.start + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
  };
  const snapBar = (t: number) => nearest(bars, t) ?? t;
  const snapBeat = (t: number) => nearest(allBeats, t) ?? t;
  const subdivisions = useMemo(() => {
    const out: number[] = [];
    allBeats.forEach((b, i) => {
      out.push(b);
      const next = allBeats[i + 1];
      if (next) out.push((b + next) / 2);
    });
    return out;
  }, [allBeats]);

  // Dragging -------------------------------------------------------------------
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const t = timeAt(e.clientX);
    if (drag.kind === "block") {
      const lo = blocks[drag.index - 1].start;
      const hi = blocks[drag.index].end;
      const snapped = snapBar(t);
      if (snapped > lo + 0.5 && snapped < hi - 0.5) setDrag({ ...drag, time: snapped });
    } else if (drag.kind === "section") {
      const lo = sections[drag.index - 1]?.start ?? clip.start;
      const hi = sections[drag.index]?.end ?? clip.end;
      const snapped = snapBar(t);
      if (snapped > lo + 0.5 && snapped < hi - 0.5) setDrag({ ...drag, time: snapped });
    } else setDrag({ ...drag, time: snapBeat(t) });
  };

  const onUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.kind === "block") {
      update((p) => ({ ...p, blocks: p.blocks.map((b, i) => (i === d.index - 1 ? { ...b, end: d.time } : i === d.index ? { ...b, start: d.time } : b)) }));
    } else if (d.kind === "section") {
      update((p) => {
        const all = [...effectiveSections(p, analysis)];
        const target = all.indexOf(sections[d.index]);
        if (target <= 0) return p;
        all[target - 1] = { ...all[target - 1], end: d.time };
        all[target] = { ...all[target], start: d.time };
        return { ...p, sections: all };
      });
      track("section_edited", { projectId: project.id });
    } else {
      update((p) => ({ ...p, photos: p.photos.map((ph) => (ph.id === d.photoId ? { ...ph, pinnedTo: d.time } : ph)) }));
    }
  };

  // Edits ------------------------------------------------------------------------
  const toggleHit = (t: number) => {
    update((p) => {
      const muted = p.hits.muted.some((m) => Math.abs(m - t) < HIT_MATCH_TOLERANCE);
      return { ...p, hits: { ...p.hits, muted: muted ? p.hits.muted.filter((m) => Math.abs(m - t) >= HIT_MATCH_TOLERANCE) : [...p.hits.muted, t] } };
    });
    track("hit_edited", { projectId: project.id, action: "toggle" });
  };
  const addHit = (clientX: number) => {
    const t = nearest(subdivisions, timeAt(clientX));
    if (t === undefined || liveBeats.some((b) => Math.abs(b - t) < HIT_MATCH_TOLERANCE)) return;
    update((p) => ({ ...p, hits: { ...p.hits, added: [...p.hits.added, { time: Math.round(t * 1000) / 1000, type: "beat" }] } }));
    track("hit_edited", { projectId: project.id, action: "add" });
  };
  const removeAdded = (t: number) => update((p) => ({ ...p, hits: { ...p.hits, added: p.hits.added.filter((a) => Math.abs(a.time - t) >= 0.001) } }));

  const splitAtPlayhead = () => {
    const t = snapBar(playhead);
    update((p) => {
      const current: StageBlock[] = p.blocks.length ? p.blocks : [{ id: "b0", start: clip.start, end: clip.end, stageId: p.stageId, params: p.stageParams }];
      const i = current.findIndex((b) => t > b.start + 0.5 && t < b.end - 0.5);
      if (i < 0) return p;
      const b = current[i];
      const next = [...current];
      next.splice(i, 1, { ...b, end: t }, { ...b, id: `b${Date.now().toString(36)}`, start: t });
      return { ...p, blocks: next };
    });
  };
  const mergeWithNext = () => {
    if (selectedBlock >= blocks.length - 1 || !project.blocks.length) return;
    update((p) => {
      const next = [...p.blocks];
      next.splice(selectedBlock, 2, { ...next[selectedBlock], end: next[selectedBlock + 1].end });
      return next.length === 1 ? { ...p, stageId: next[0].stageId, stageParams: next[0].params, blocks: [] } : { ...p, blocks: next };
    });
  };
  const relabel = (sec: Section, label: Section["label"]) =>
    update((p) => ({ ...p, sections: effectiveSections(p, analysis).map((x) => (x.start === sec.start && x.end === sec.end ? { ...x, label } : x)) }));

  // Waveform for the clip ---------------------------------------------------------
  const wave = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = wave.current;
    if (!c) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const { hop, peaks } = analysis.waveform;
    ctx.fillStyle = "#6a6a78";
    for (let x = 0; x < w; x++) {
      const a = Math.floor((clip.start + (x / w) * dur) / hop);
      const b = Math.max(a + 1, Math.floor((clip.start + ((x + 1) / w) * dur) / hop));
      let m = 0;
      for (let i = a; i < b && i < peaks.length; i++) m = Math.max(m, peaks[i]);
      const hh = Math.max(1, m * (h / 2 - 2));
      ctx.fillRect(x, h / 2 - hh, 1, hh * 2);
    }
  }, [analysis, clip.start, dur, zoom]);

  const blockBoundaryTime = (i: number) => (drag?.kind === "block" && drag.index === i ? drag.time : blocks[i].start);
  const sectionBoundaryTime = (i: number) => (drag?.kind === "section" && drag.index === i ? drag.time : sections[i].start);

  return (
    <div className={st.studio}>
      <div className={st.toolbar}>
        <button className="btn btn-sm" onClick={splitAtPlayhead} title="Split the Stage block at the playhead (snaps to the bar)">
          Split at playhead
        </button>
        <button className="btn btn-sm" onClick={mergeWithNext} disabled={!project.blocks.length || selectedBlock >= blocks.length - 1}>
          Merge with next
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => update((p) => ({ ...p, hits: { muted: [], added: [] } }))} disabled={!project.hits.muted.length && !project.hits.added.length}>
          Reset hits
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => update((p) => ({ ...p, sections: null }))} disabled={!project.sections}>
          Reset sections
        </button>
        <label className={st.zoom}>
          Zoom
          <input type="range" min={1} max={4} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>

      <div className={st.scroller}>
        <div className={st.grid} style={{ width: `${zoom * 100}%` }}>
          <div className={st.labels}>
            <span>Sections</span>
            <span>Stages</span>
            <span>Pins</span>
            <span>Hits</span>
            <span>Song</span>
          </div>
          <div
            ref={lane}
            className={st.lanes}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          >
            {/* bar grid */}
            {bars.map((b, i) => (
              <span key={b} className={st.barLine} style={{ left: pct(b) }}>
                {zoom >= 2 || i % 2 === 0 ? <em>{analysis.downbeats.indexOf(b) + 1}</em> : null}
              </span>
            ))}

            {/* Sections */}
            <div className={st.track}>
              {sections.map((sec, i) => {
                const start = Math.max(clip.start, i > 0 ? sectionBoundaryTime(i) : sec.start);
                const end = Math.min(clip.end, i < sections.length - 1 ? sectionBoundaryTime(i + 1) : sec.end);
                return (
                  <div key={`${sec.start}-${i}`} className={st.section} style={{ left: pct(start), width: `${((end - start) / dur) * 100}%`, background: SECTION_COLORS[sec.label] }}>
                    <select value={sec.label} onChange={(e) => relabel(sec, e.target.value as Section["label"])} aria-label="Section label">
                      {LABELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {i > 0 && sec.start > clip.start && (
                      <span
                        className={st.handle}
                        role="separator"
                        aria-label="Move section boundary"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget.closest(`.${st.lanes}`) as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ kind: "section", index: i, time: sec.start });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Stage blocks */}
            <div className={st.track}>
              {blocks.map((b, i) => {
                const start = i > 0 ? blockBoundaryTime(i) : b.start;
                const end = i < blocks.length - 1 ? blockBoundaryTime(i + 1) : b.end;
                return (
                  <button
                    key={b.id}
                    className={`${st.block} ${i === selectedBlock ? st.blockSel : ""}`}
                    style={{ left: pct(start), width: `${((end - start) / dur) * 100}%` }}
                    onClick={() => onSelectBlock(i)}
                  >
                    {findStage(b.stageId, customStages).name}
                    {i > 0 && (
                      <span
                        className={st.handle}
                        role="separator"
                        aria-label="Move Stage boundary"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget.closest(`.${st.lanes}`) as HTMLElement).setPointerCapture(e.pointerId);
                          setDrag({ kind: "block", index: i, time: b.start });
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Pins */}
            <div className={st.track}>
              {pins.map((ph) => {
                const t = drag?.kind === "pin" && drag.photoId === ph.id ? drag.time : ph.pinnedTo!;
                return (
                  <span
                    key={ph.id}
                    className={st.pin}
                    style={{ left: pct(t), backgroundImage: `url(${ASSET_BASE}/${ph.src}?w=160)` }}
                    title={`Pinned at ${formatTime(t)}; drag to move`}
                    onPointerDown={(e) => {
                      (e.currentTarget.closest(`.${st.lanes}`) as HTMLElement).setPointerCapture(e.pointerId);
                      setDrag({ kind: "pin", photoId: ph.id, time: ph.pinnedTo! });
                    }}
                  />
                );
              })}
            </div>

            {/* Hits: click a beat to mute/unmute, double-click empty space to add one */}
            <div className={st.track} onDoubleClick={(e) => addHit(e.clientX)} title="Click a hit to mute it. Double-click to add one.">
              {allBeats.map((b) => {
                const bar = analysis.downbeats.some((d) => Math.abs(d - b) < 0.06);
                const muted = isMuted(b);
                return (
                  <button
                    key={b}
                    className={`${st.hit} ${bar ? st.hitBar : ""} ${muted ? st.hitMuted : ""}`}
                    style={{ left: pct(b) }}
                    onClick={() => toggleHit(b)}
                    onDoubleClick={(e) => e.stopPropagation()}
                    aria-label={`${muted ? "Unmute" : "Mute"} hit at ${formatTime(b)}`}
                  />
                );
              })}
              {added.map((a) => (
                <button
                  key={`a${a.time}`}
                  className={`${st.hit} ${st.hitAdded}`}
                  style={{ left: pct(a.time) }}
                  onClick={() => removeAdded(a.time)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-label={`Remove added hit at ${formatTime(a.time)}`}
                />
              ))}
            </div>

            {/* Song */}
            <div
              className={st.track}
              onClick={(e) => preview.current?.seekToSongTime(timeAt(e.clientX))}
              style={{ cursor: "pointer" }}
              title="Click to move the playhead"
            >
              <canvas ref={wave} className={st.wave} />
            </div>

            <span className={st.playhead} style={{ left: pct(Math.min(clip.end, Math.max(clip.start, playhead))) }} />
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Drag boundaries (they snap to bars) · click a hit to mute it, double-click to add one · drag a pinned photo to another beat · space plays.
      </p>
    </div>
  );
}

export type { Project };
