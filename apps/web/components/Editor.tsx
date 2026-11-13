"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MIN_PHOTOS, resolveClip, type Project, type StageDef } from "@stages/project";
import { saveProject, track, useAnalysis } from "@/lib/client";
import { Preview, type PreviewHandle } from "./Preview";
import { SongStep } from "./steps/SongStep";
import { PhotosStep } from "./steps/PhotosStep";
import { StageStep } from "./steps/StageStep";
import { RemixStep } from "./steps/RemixStep";
import { ExportStep } from "./steps/ExportStep";
import styles from "./editor.module.css";

export type Step = "song" | "photos" | "stage" | "remix" | "export";

const STEP_LABELS: Record<Step, string> = { song: "Song", photos: "Photos", stage: "Stage", remix: "Remix", export: "Export" };
const ORDER: Step[] = ["song", "photos", "stage", "remix", "export"];

export type EditorApi = {
  project: Project;
  /** apply a change; saved automatically and undoable */
  update: (fn: (p: Project) => Project) => void;
  /** replace with a project returned by the server (song/photo uploads) */
  replace: (p: Project) => void;
  go: (s: Step) => void;
  preview: React.RefObject<PreviewHandle | null>;
};

export function Editor({ initialProject, initialStep, customStages: initialStages }: { initialProject: Project; initialStep: Step; customStages: StageDef[] }) {
  const [project, setProject] = useState(initialProject);
  const [step, setStep] = useState<Step>(initialStep);
  const [customStages] = useState(initialStages);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const [, forceRender] = useState(0);
  const preview = useRef<PreviewHandle | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(project);
  latest.current = project;

  const analysisState = useAnalysis(project.song?.id);
  const analysis = analysisState?.analysis ?? null;

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await saveProject(latest.current);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 500);
  }, []);

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      setProject((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;
        history.current.past.push(prev);
        if (history.current.past.length > 60) history.current.past.shift();
        history.current.future = [];
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const replace = useCallback((p: Project) => {
    history.current = { past: [], future: [] };
    setProject(p);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(latest.current);
    setProject(prev);
    scheduleSave();
    forceRender((n) => n + 1);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(latest.current);
    setProject(next);
    scheduleSave();
    forceRender((n) => n + 1);
  }, [scheduleSave]);

  // Freeze the suggested clip into the project once the analysis has one.
  useEffect(() => {
    if (analysis && !project.clip) {
      const clip = resolveClip(project, analysis);
      setProject((p) => ({ ...p, clip }));
      scheduleSave();
    }
  }, [analysis, project, scheduleSave]);

  const go = useCallback((s: Step) => {
    setStep(s);
    const url = new URL(window.location.href);
    url.searchParams.set("step", s);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  // Keyboard: space plays/pauses the preview, ctrl/cmd+z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === " " && preview.current) {
        e.preventDefault();
        preview.current.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const canReach: Record<Step, boolean> = {
    song: true,
    photos: !!project.song,
    stage: !!project.song && project.photos.length > 0,
    remix: !!project.song && project.photos.length > 0 && !!analysis,
    export: !!project.song && project.photos.length > 0 && !!analysis,
  };

  const editorApi: EditorApi = { project, update, replace, go, preview };
  const showPreview = (step === "stage" || step === "remix") && !!analysis;
  const previewNode = useMemo(
    () => (analysis ? <Preview ref={preview} project={project} analysis={analysis} customStages={customStages} /> : null),
    [analysis, project, customStages],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <Link href="/" className={styles.back} aria-label="All videos">
          ←
        </Link>
        <input
          className={styles.title}
          value={project.name}
          aria-label="Video name"
          onChange={(e) => update((p) => ({ ...p, name: e.target.value.slice(0, 80) }))}
        />
        <div className={styles.topRight}>
          <button className="btn btn-ghost btn-sm" onClick={undo} disabled={!history.current.past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button className="btn btn-ghost btn-sm" onClick={redo} disabled={!history.current.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className={`${styles.save} muted`}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}</span>
        </div>
      </header>

      <nav className={styles.steps} aria-label="Steps">
        {ORDER.map((s, i) => (
          <button
            key={s}
            className={`${styles.stepBtn} ${s === step ? styles.stepActive : ""}`}
            disabled={!canReach[s]}
            onClick={() => go(s)}
            aria-current={s === step ? "step" : undefined}
          >
            <span className={styles.stepNum}>{i + 1}</span>
            {STEP_LABELS[s]}
          </button>
        ))}
      </nav>

      <div className={`${styles.body} ${showPreview ? styles.withPreview : ""}`}>
        {showPreview && <aside className={styles.previewCol}>{previewNode}</aside>}
        <main className={styles.content}>
          {step === "song" && <SongStep api={editorApi} analysisState={analysisState} />}
          {step === "photos" && <PhotosStep api={editorApi} minPhotos={MIN_PHOTOS} />}
          {step === "stage" && <StageStep api={editorApi} analysis={analysis} customStages={customStages} />}
          {step === "remix" && analysis && <RemixStep api={editorApi} analysis={analysis} customStages={customStages} />}
          {step === "export" && analysis && <ExportStep api={editorApi} analysis={analysis} customStages={customStages} />}
          {(step === "remix" || step === "export") && !analysis && <p className="muted pulse">Waiting for the song analysis…</p>}
        </main>
      </div>
    </div>
  );
}

export function trackStep(step: Step, project: Project) {
  track(`${step}_viewed`, { projectId: project.id });
}
