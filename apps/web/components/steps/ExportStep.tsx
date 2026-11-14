"use client";

import { useEffect, useState } from "react";
import { formatTime, resolveClip, type Analysis, type StageDef } from "@stages/project";
import { findStage } from "@stages/stages";
import { ASSET_BASE, api, track, useJob } from "@/lib/client";
import type { EditorApi } from "../Editor";
import { Progress } from "./SongStep";
import s from "./steps.module.css";

type RenderResult = { withAudio: string; silent: string; seconds: number; clip: { start: number; end: number } };

export function ExportStep({ api: editor, analysis, customStages }: { api: EditorApi; analysis: Analysis; customStages: StageDef[] }) {
  const { project, update, go } = editor;
  const clip = resolveClip(project, analysis);
  const storageKey = `stages.render.${project.id}`;
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);

  // Resume a render that was running (or finished) before a reload.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setJobId(saved);
    } catch {}
  }, [storageKey]);

  const job = useJob(jobId, (j) => {
    if (j.status === "done") setResult(j.result as RenderResult);
    else setError(j.error ?? "Render failed");
  });

  const start = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await api<{ renderJob: string }>(`/api/projects/${project.id}/render`, { method: "POST" });
      setJobId(res.renderJob);
      try {
        localStorage.setItem(storageKey, res.renderJob);
      } catch {}
      track("render_started", { projectId: project.id, stageId: project.stageId, blocks: project.blocks.length, seconds: clip.end - clip.start });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const running = job && (job.status === "queued" || job.status === "running");
  const stageNames = project.blocks.length ? [...new Set(project.blocks.map((b) => findStage(b.stageId, customStages).name))].join(" + ") : findStage(project.stageId, customStages).name;
  const fileBase = project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "stages-video";
  const renderedClip = result?.clip ?? clip;
  const [copied, setCopied] = useState(false);
  const credits = project.photos.flatMap((p) => (p.credit ? [p.credit] : []));
  const creditText = ["Photos:", ...credits.map((c) => `• "${c.title}" by ${c.creator} (${c.license}) ${c.sourceUrl}`)].join("\n");

  return (
    <section className={s.step}>
      <div>
        <h1 className={s.h1}>Export</h1>
        <p className={s.lead}>A 1080×1920 MP4 at 30 fps, with the song and without it.</p>
      </div>

      <div className={`card ${s.panel}`}>
        <div className={s.stats + " muted"}>
          <span>
            Song <b>{project.song?.name}</b>
          </span>
          <span>
            Clip <b>{formatTime(clip.start)}</b>–<b>{formatTime(clip.end)}</b> ({Math.round(clip.end - clip.start)} s)
          </span>
          <span>
            Stage <b>{stageNames}</b>
          </span>
          <span>
            <b>{project.photos.length}</b> photos
          </span>
        </div>
        <label className={s.row} style={{ fontSize: 14 }}>
          <input type="checkbox" checked={project.export.watermark} onChange={(e) => update((p) => ({ ...p, export: { ...p.export, watermark: e.target.checked } }))} />
          &ldquo;made with Stages&rdquo; watermark <span className="muted">(removed on Pro)</span>
        </label>
        <div className={s.row}>
          <button className="btn btn-primary" onClick={start} disabled={!!running}>
            {result ? "Render again" : "Render video"}
          </button>
          {running && <span className="muted">Rendering usually takes about as long as the clip, up to a few minutes on this computer.</span>}
        </div>
        {running && <Progress value={job.progress} label={`${job.message}… ${Math.round(job.progress * 100)}%`} pulse />}
        {error && <p className="error">{error}</p>}
      </div>

      {result && (
        <div className={`card ${s.panel}`}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <video
              src={`${ASSET_BASE}/${result.withAudio}`}
              controls
              playsInline
              style={{ width: 220, aspectRatio: "9/16", borderRadius: 14, background: "#000" }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 220 }}>
              <strong>Your video is ready</strong>
              <a
                className="btn btn-primary"
                href={`${ASSET_BASE}/${result.withAudio}?download=${fileBase}.mp4`}
                onClick={() => track("export_downloaded", { projectId: project.id, version: "audio" })}
              >
                Download with audio
              </a>
              <a
                className="btn"
                href={`${ASSET_BASE}/${result.silent}?download=${fileBase}-silent.mp4`}
                onClick={() => track("export_downloaded", { projectId: project.id, version: "silent" })}
              >
                Download silent version
              </a>
              <p className={s.notice} style={{ margin: 0 }}>
                <b>Posting to TikTok or Instagram?</b> Use the silent version and add the song from the app&rsquo;s music library. Start the sound at{" "}
                <b style={{ color: "var(--accent)" }}>{formatTime(renderedClip.start)}</b> so the cuts land on the beat.
              </p>
              <span className="muted" style={{ fontSize: 12 }}>
                Rendered in {Math.round(result.seconds)} s
              </span>
            </div>
          </div>
        </div>
      )}

      {credits.length > 0 && (
        <div className={`card ${s.panel}`}>
          <strong>Photo credits</strong>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {credits.length} photo{credits.length === 1 ? "" : "s"} came from the online search. Their licenses ask for a credit: paste this into your caption or bio link.
          </p>
          <textarea className={s.credits} readOnly value={creditText} onFocus={(e) => e.target.select()} aria-label="Photo credits" />
          <div className={s.row}>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(creditText).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? "Copied ✓" : "Copy credits"}
            </button>
          </div>
        </div>
      )}

      <div className={s.footer}>
        <button className="btn btn-ghost" onClick={() => go("remix")}>
          ← Remix
        </button>
      </div>
    </section>
  );
}
