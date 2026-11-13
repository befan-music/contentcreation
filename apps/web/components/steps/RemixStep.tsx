"use client";

import { useState } from "react";
import { editedBeats, effectiveSections, formatTime, nearest, resolveClip, type Analysis, type ParamValues, type StageBlock, type StageDef } from "@stages/project";
import { BUILTIN_STAGES, energyToParams, findStage, withDefaults } from "@stages/stages";
import { ASSET_BASE, track } from "@/lib/client";
import type { EditorApi } from "../Editor";
import { EnergyPad, Knobs } from "../Knobs";
import { Studio } from "../Studio";
import { MagicPanel } from "../MagicPanel";
import s from "./steps.module.css";
import r from "./remix.module.css";

const SECTION_COLORS: Record<string, string> = {
  intro: "#6b7cff",
  verse: "#3fa7ff",
  chorus: "#c6ff3d",
  drop: "#ff4fa3",
  bridge: "#ffb13d",
  outro: "#8b8b99",
};

export function RemixStep({ api: editor, analysis, customStages }: { api: EditorApi; analysis: Analysis; customStages: StageDef[] }) {
  const { project, update, go, preview } = editor;
  const clip = resolveClip(project, analysis);
  const allStages = [...BUILTIN_STAGES, ...customStages];
  const perSection = project.blocks.length > 0;
  const [selected, setSelected] = useState(0);
  const [studio, setStudio] = useState(false);

  const blocks: StageBlock[] = perSection ? project.blocks : [{ id: "main", start: clip.start, end: clip.end, stageId: project.stageId, params: project.stageParams }];
  const sel = Math.min(selected, blocks.length - 1);
  const block = blocks[sel];
  const stage = findStage(block.stageId, customStages);
  const values = withDefaults(stage, block.params);

  const patchBlock = (patch: Partial<StageBlock>) => {
    if (!perSection) {
      update((p) => ({ ...p, stageId: patch.stageId ?? p.stageId, stageParams: patch.params ?? p.stageParams }));
    } else {
      update((p) => ({ ...p, blocks: p.blocks.map((b, i) => (i === sel ? { ...b, ...patch } : b)) }));
    }
  };
  const patchParams = (patch: ParamValues) => {
    patchBlock({ params: { ...block.params, ...patch } });
    track("knob_changed", { projectId: project.id, keys: Object.keys(patch) });
  };

  const splitBySection = () => {
    const sections = effectiveSections(project, analysis).filter((x) => x.end > clip.start && x.start < clip.end);
    const next: StageBlock[] = sections.map((x, i) => ({
      id: `b${i}-${Math.round(x.start * 10)}`,
      start: Math.max(x.start, clip.start),
      end: Math.min(x.end, clip.end),
      stageId: project.stageId,
      params: project.stageParams,
    }));
    if (next.length < 2) return;
    update((p) => ({ ...p, blocks: next }));
    setSelected(0);
  };

  const merge = () => {
    update((p) => ({ ...p, stageId: block.stageId, stageParams: block.params, blocks: [] }));
    setSelected(0);
  };

  // Photos ---------------------------------------------------------------
  const pinAtPlayhead = (photoId: string) => {
    const t = preview.current?.songTime() ?? clip.start;
    const { beats } = editedBeats(analysis, project.hits);
    const hit = nearest(beats.filter((b) => b >= clip.start && b < clip.end), t) ?? t;
    update((p) => ({
      ...p,
      photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, pinnedTo: hit } : ph.pinnedTo !== undefined && Math.abs(ph.pinnedTo - hit) < 0.05 ? { ...ph, pinnedTo: undefined } : ph)),
    }));
    track("photo_pinned", { projectId: project.id });
  };
  const unpin = (photoId: string) => update((p) => ({ ...p, photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, pinnedTo: undefined } : ph)) }));
  const shuffle = () =>
    update((p) => {
      const photos = [...p.photos];
      for (let i = photos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [photos[i], photos[j]] = [photos[j], photos[i]];
      }
      return { ...p, photos };
    });

  const sectionAt = (t: number) => effectiveSections(project, analysis).find((x) => t >= x.start - 0.05 && t < x.end);
  const sectionsInClip = effectiveSections(project, analysis).filter((x) => x.end > clip.start + 0.5 && x.start < clip.end - 0.5).length;
  const total = clip.end - clip.start;
  const ex = typeof values.energyX === "number" ? values.energyX : 0.8;
  const ey = typeof values.intensity === "number" ? values.intensity : 0.7;

  return (
    <section className={s.step}>
      <div>
        <h1 className={s.h1}>Remix</h1>
        <p className={s.lead}>Change the Stage for each part of the song, turn the knobs, pin your best photo to the moment that matters.</p>
      </div>

      <div className={`card ${s.panel}`}>
        <div className={s.spread}>
          <strong>Stages along the clip</strong>
          {perSection ? (
            <button className="btn btn-sm btn-ghost" onClick={merge}>
              One Stage for everything
            </button>
          ) : (
            <button
              className="btn btn-sm"
              onClick={splitBySection}
              disabled={sectionsInClip < 2}
              title={sectionsInClip < 2 ? "This clip is a single section. Open Studio and use “Split at playhead” to switch Stages mid-clip." : undefined}
            >
              Different Stage per section
            </button>
          )}
        </div>
        <div className={r.strip} role="tablist" aria-label="Stage blocks">
          {blocks.map((b, i) => {
            const sec = sectionAt(b.start);
            return (
              <button
                key={b.id}
                role="tab"
                aria-selected={i === sel}
                className={r.block}
                style={{ flexGrow: (b.end - b.start) / total, borderTopColor: SECTION_COLORS[sec?.label ?? ""] ?? "var(--border)" }}
                onClick={() => {
                  setSelected(i);
                  preview.current?.seekToSongTime(b.start);
                }}
              >
                <span className={r.blockStage}>{findStage(b.stageId, customStages).name}</span>
                <span className={r.blockMeta}>
                  {perSection && sec ? `${sec.label} · ` : ""}
                  {formatTime(b.start)}
                </span>
              </button>
            );
          })}
        </div>
        <div className={s.row}>
          <label className="muted" style={{ fontSize: 13 }} htmlFor="block-stage">
            Stage{perSection ? " for this part" : ""}
          </label>
          <select
            id="block-stage"
            className="input"
            style={{ width: "auto", minHeight: 36 }}
            value={block.stageId}
            onChange={(e) => {
              patchBlock({ stageId: e.target.value, params: {} });
              track("stage_selected", { projectId: project.id, stageId: e.target.value, scope: perSection ? "block" : "all" });
            }}
          >
            {allStages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            style={{ marginLeft: "auto" }}
            aria-expanded={studio}
            onClick={() => {
              setStudio((v) => !v);
              if (!studio) track("studio_opened", { projectId: project.id });
            }}
          >
            {studio ? "Close Studio" : "Open Studio"}
          </button>
        </div>
        {studio && <Studio api={editor} analysis={analysis} customStages={customStages} selectedBlock={sel} onSelectBlock={setSelected} />}
      </div>

      {stage.id === "magic" && (
        <MagicPanel api={editor} params={values} onParams={(patch) => patchBlock({ params: { ...block.params, ...patch } })} />
      )}

      <div className={`card ${s.panel}`}>
        <div className={s.spread}>
          <strong>Energy</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            Moves density and intensity together
          </span>
        </div>
        <EnergyPad x={ex} y={ey} onChange={(x, y) => patchParams(energyToParams(x, y, stage))} />
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 12 }}>All knobs</summary>
          <Knobs defs={stage.id === "magic" ? stage.params.filter((p) => p.type !== "text") : stage.params} values={values} onChange={patchParams} />
        </details>
      </div>

      <div className={`card ${s.panel}`}>
        <div className={s.spread}>
          <strong>Photos</strong>
          <div className={s.row}>
            <button className="btn btn-sm" onClick={shuffle}>
              Shuffle
            </button>
            <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, seed: Math.floor(Math.random() * 1_000_000) }))}>
              New look
            </button>
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Pause the preview where you want a photo, then tap the photo to pin it to that beat.
        </p>
        <ul className={s.grid}>
          {project.photos.map((ph, i) => (
            <li key={ph.id} className={s.tile}>
              <button style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", height: "100%" }} onClick={() => pinAtPlayhead(ph.id)} aria-label={`Pin photo ${i + 1} at the playhead`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${ASSET_BASE}/${ph.src}?w=160`} alt="" />
              </button>
              <span className={s.tileIndex}>{i + 1}</span>
              {ph.pinnedTo !== undefined && (
                <button className={s.pin} style={{ border: 0, cursor: "pointer" }} onClick={() => unpin(ph.id)} aria-label="Unpin" title="Unpin">
                  📌 {formatTime(ph.pinnedTo)}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className={s.footer}>
        <button className="btn btn-ghost" onClick={() => go("stage")}>
          ← Stages
        </button>
        <button className="btn btn-primary" onClick={() => go("export")}>
          Export →
        </button>
      </div>
    </section>
  );
}
