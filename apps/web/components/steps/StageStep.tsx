"use client";

import Link from "next/link";
import { effectiveSections, resolveClip, type Analysis, type StageDef } from "@stages/project";
import { BUILTIN_STAGES, autoBlocks, recommendStage } from "@stages/stages";
import { ASSET_BASE, track } from "@/lib/client";
import type { EditorApi } from "../Editor";
import s from "./steps.module.css";

const SWATCH: Record<string, string> = {
  "beat-flash": "linear-gradient(135deg, #ffffff 0 55%, #ff5a36 55% 100%)",
  piano: "repeating-linear-gradient(90deg, #f4f4f6 0 14px, #0b0b12 14px 18px)",
  auto: "conic-gradient(#c6ff3d, #3fa7ff, #ff4fa3, #c6ff3d)",
};

export function StageStep({ api: editor, analysis, customStages }: { api: EditorApi; analysis: Analysis | null; customStages: StageDef[] }) {
  const { project, update, go } = editor;
  if (!analysis) return <p className="muted pulse">Finding the beat… the Stages appear as soon as the song is analyzed.</p>;

  const clip = resolveClip(project, analysis);
  const rec = recommendStage(analysis, clip);
  const isAuto = project.blocks.length > 0 && project.blocks.every((b) => b.id.startsWith("auto-"));
  const isMulti = project.blocks.length > 0 && !isAuto;
  const selected = isAuto ? "auto" : isMulti ? "multi" : project.stageId;

  const pick = (stageId: string) => {
    update((p) => ({ ...p, stageId, stageParams: {}, blocks: [] }));
    track("stage_selected", { projectId: project.id, stageId, recommended: stageId === rec.stageId });
  };

  const pickAuto = () => {
    update((p) => ({ ...p, blocks: autoBlocks(analysis, clip, effectiveSections(p, analysis)) }));
    track("stage_selected", { projectId: project.id, stageId: "auto" });
  };

  const notesPending = analysis.status !== "complete";

  return (
    <section className={s.step}>
      <div>
        <h1 className={s.h1}>Pick a Stage</h1>
        <p className={s.lead}>Same song, same photos, a different video. Tap a Stage and watch the preview.</p>
      </div>

      <div className={s.stageGrid}>
        {BUILTIN_STAGES.map((st) => (
          <StageCard
            key={st.id}
            stage={st}
            swatch={SWATCH[st.id]}
            selected={selected === st.id}
            recommended={rec.stageId === st.id ? rec.reason : null}
            note={st.id === "piano" && notesPending ? "Notes still analyzing; plays a scale on the beat for now" : null}
            onPick={() => pick(st.id)}
          />
        ))}
        <button className={s.stageCard} aria-pressed={selected === "auto"} onClick={pickAuto}>
          <div className={s.stageTop}>
            <span className={s.stageName}>Auto: per section</span>
            <span className={s.swatch} style={{ background: SWATCH.auto }} aria-hidden />
          </div>
          <span className={s.stageDesc}>A different Stage for each part of the song: calmer in the verse, full energy on the chorus.</span>
        </button>
        {customStages.map((st) => (
          <StageCard
            key={st.id}
            stage={st}
            swatch={st.look.kind === "photo" ? `center / cover no-repeat url(${ASSET_BASE}/${st.look.imageSrc}?w=160)` : "#333"}
            selected={selected === st.id}
            recommended={null}
            note={null}
            onPick={() => pick(st.id)}
          />
        ))}
        <Link href={`/stages/new?project=${project.id}`} className={s.stageCard} style={{ textDecoration: "none", borderStyle: "dashed" }}>
          <div className={s.stageTop}>
            <span className={s.stageName}>Make your own</span>
            <span className={s.swatch} style={{ background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }} aria-hidden>
              +
            </span>
          </div>
          <span className={s.stageDesc}>Upload a photo of an object, tap the parts that should become windows.</span>
        </Link>
      </div>

      {isMulti && <p className={s.notice}>This video uses different Stages per section (set in Remix). Picking a Stage here replaces them.</p>}

      <div className={s.footer}>
        <button className="btn btn-ghost" onClick={() => go("photos")}>
          ← Photos
        </button>
        <button className="btn" onClick={() => go("remix")}>
          Fine-tune
        </button>
        <button className="btn btn-primary" onClick={() => go("export")}>
          Export →
        </button>
      </div>
    </section>
  );
}

function StageCard({
  stage,
  swatch,
  selected,
  recommended,
  note,
  onPick,
}: {
  stage: StageDef;
  swatch: string;
  selected: boolean;
  recommended: string | null;
  note: string | null;
  onPick: () => void;
}) {
  return (
    <button className={s.stageCard} aria-pressed={selected} onClick={onPick}>
      <div className={s.stageTop}>
        <span className={s.stageName}>{stage.name}</span>
        <span className={s.swatch} style={{ background: swatch }} aria-hidden />
      </div>
      {recommended && (
        <span className="chip chip-accent" style={{ alignSelf: "flex-start" }} title={recommended}>
          Recommended
        </span>
      )}
      <span className={s.stageDesc}>{stage.description}</span>
      {note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
    </button>
  );
}
