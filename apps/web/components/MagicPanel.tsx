"use client";

import { useEffect, useState } from "react";
import type { ParamValues, Project } from "@stages/project";
import { MAGIC_PRESETS, normalizePrompt, styleKey } from "@stages/stages";
import { ASSET_BASE, api, track, useJob } from "@/lib/client";
import type { EditorApi } from "./Editor";
import { Progress } from "./steps/SongStep";
import s from "./steps/steps.module.css";
import m from "./magic.module.css";

type MagicConfig = { provider: "higgsfield" | "mock" | "none"; model: string; configured: boolean };

/**
 * Magic Stage controls: type a style (or pick a preset), generate the styled
 * photos with the AI provider, see them arrive, ask for a new variation.
 * Generation is explicit (a button), because every image costs credits.
 */
export function MagicPanel({ api: editor, params, onParams }: { api: EditorApi; params: ParamValues; onParams: (patch: ParamValues) => void }) {
  const { project, patchLocal } = editor;
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  const variation = typeof params.variation === "number" ? params.variation : 0;
  const [draft, setDraft] = useState(prompt);
  const [config, setConfig] = useState<MagicConfig | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(prompt), [prompt]);
  useEffect(() => {
    api<MagicConfig>("/api/magic").then(setConfig).catch(() => setConfig(null));
  }, []);

  const key = normalizePrompt(prompt) ? styleKey(prompt, variation) : null;
  const total = project.photos.length;
  const styled = key ? project.photos.filter((p) => p.styles?.[key]).length : 0;
  const draftChanged = normalizePrompt(draft) !== normalizePrompt(prompt);

  // Pull newly generated styles from the server (they're saved per photo as they finish).
  const syncStyles = async () => {
    const fresh = await api<Project>(`/api/projects/${project.id}`);
    patchLocal((p) => ({ ...p, photos: p.photos.map((ph) => ({ ...ph, styles: fresh.photos.find((f) => f.id === ph.id)?.styles ?? ph.styles })) }));
  };

  const job = useJob(jobId, async (j) => {
    await syncStyles();
    const result = j.result as { generated: number; failed: { reason: string }[] } | undefined;
    if (j.status === "error") setError(j.error ?? "Magic failed");
    else if (result?.failed.length) setError(`${result.failed.length} photo${result.failed.length === 1 ? "" : "s"} couldn't be styled: ${result.failed[0].reason}`);
    track("magic_generated", { projectId: project.id, generated: result?.generated ?? 0, failed: result?.failed.length ?? 0 });
  });
  const running = !!job && (job.status === "queued" || job.status === "running");

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => syncStyles().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async (nextVariation: number) => {
    const text = draft.trim();
    if (!normalizePrompt(text)) {
      setError("Type a style first, e.g. “minecraft”.");
      return;
    }
    setError(null);
    onParams({ prompt: text, variation: nextVariation });
    try {
      const res = await api<{ magicJob: string; total: number }>(`/api/projects/${project.id}/magic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, variation: nextVariation }),
      });
      setJobId(res.magicJob);
      track("magic_started", { projectId: project.id, photos: res.total, variation: nextVariation });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const samples = key ? project.photos.filter((p) => p.styles?.[key]).slice(0, 8) : [];

  return (
    <div className={`card ${s.panel} ${m.panel}`}>
      <div className={s.spread}>
        <strong>✨ Magic style</strong>
        {config?.configured && (
          <span className="muted" style={{ fontSize: 12 }}>
            {config.provider === "mock" ? "Test mode: local filter, not AI" : `Higgsfield · ${config.model}`}
          </span>
        )}
      </div>

      {config && !config.configured && (
        <div className={s.notice}>
          <b>Connect Higgsfield to use Magic.</b> Create a key in the Higgsfield Console, then add it to <code>apps/web/.env.local</code>:
          <pre className={m.code}>HIGGSFIELD_KEY=your-key-id:your-key-secret</pre>
          and restart the app. The key stays on the server.
        </div>
      )}

      <form
        className={s.row}
        onSubmit={(e) => {
          e.preventDefault();
          generate(draftChanged ? 0 : variation);
        }}
      >
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a style: minecraft, anime, claymation…"
          aria-label="Magic style"
        />
        <button className="btn btn-primary" disabled={running || !config?.configured || !total}>
          {running ? "Styling…" : styled === total && total > 0 && !draftChanged ? "Styled ✓" : "Generate"}
        </button>
      </form>

      <div className={m.presets} role="group" aria-label="Style presets">
        {MAGIC_PRESETS.map((p) => (
          <button key={p.label} type="button" className={m.preset} aria-pressed={normalizePrompt(draft) === p.prompt} onClick={() => setDraft(p.prompt)}>
            {p.label}
          </button>
        ))}
      </div>

      {running && job && <Progress value={job.progress} label={job.message} pulse />}

      {key && !running && (
        <div className={s.spread}>
          <span className="muted" style={{ fontSize: 13 }}>
            {styled === total ? `All ${total} photos styled as “${prompt}”` : `${styled} of ${total} photos styled as “${prompt}”`}
            {variation > 0 ? ` · variation ${variation + 1}` : ""}
          </span>
          {styled > 0 && (
            <button className="btn btn-sm" onClick={() => generate(variation + 1)} disabled={!config?.configured} title="Regenerates every photo with a fresh take (uses credits)">
              New variation
            </button>
          )}
        </div>
      )}

      {samples.length > 0 && (
        <ul className={m.samples}>
          {samples.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET_BASE}/${p.styles![key!].srcSmall ?? p.styles![key!].src}`} alt="" />
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error" style={{ margin: 0, fontSize: 14 }}>{error}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        One AI image per photo ({total} total). Results are saved, so the export matches the preview; “New variation” asks the model for a fresh take.
      </p>
    </div>
  );
}
