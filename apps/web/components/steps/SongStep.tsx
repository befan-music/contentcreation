"use client";

import { useEffect, useRef, useState } from "react";
import { CLIP_LENGTHS, clipFrom, effectiveSections, formatTime, resolveClip, type Project } from "@stages/project";
import { ASSET_BASE, api, track, uploadForm, useJob, type AnalysisState } from "@/lib/client";
import type { EditorApi } from "../Editor";
import { Waveform } from "../Waveform";
import s from "./steps.module.css";

export function SongStep({ api: editor, analysisState }: { api: EditorApi; analysisState: AnalysisState | null }) {
  const { project, update, replace, go } = editor;
  const [upload, setUpload] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [importJob, setImportJob] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [changing, setChanging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const job = useJob(importJob, async (j) => {
    if (j.status === "done") {
      replace(await api<Project>(`/api/projects/${project.id}`));
      track("song_uploaded", { projectId: project.id, source: "youtube" });
      setChanging(false);
    } else setError(j.error ?? "Import failed");
    setImportJob(null);
  });

  async function uploadFile(file: File) {
    setError(null);
    setUpload(0);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await uploadForm<{ project: Project }>(`/api/projects/${project.id}/song`, form, setUpload);
      replace(res.project);
      track("song_uploaded", { projectId: project.id, source: "file", bytes: file.size });
      setChanging(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpload(null);
    }
  }

  async function importLink() {
    setError(null);
    try {
      const res = await api<{ importJob: string }>(`/api/projects/${project.id}/song`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      setImportJob(res.importJob);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const busy = upload !== null || !!importJob;
  const showPicker = !project.song || changing;

  return (
    <section className={s.step}>
      <div>
        <h1 className={s.h1}>Add a song</h1>
        <p className={s.lead}>Stages listens for the beats, bars and sections, then cuts your photos to them.</p>
      </div>

      {showPicker && (
        <div className={`card ${s.panel}`}>
          <div
            className={`${s.drop} ${dragOver ? s.dropActive : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) uploadFile(f);
            }}
          >
            <strong>Drop an audio file</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              mp3, m4a, wav, flac · up to 60 MB
            </span>
            <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
              Choose file
            </button>
            <input ref={fileInput} type="file" accept="audio/*,.m4a,.mp3,.wav,.flac,.aac,.ogg" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </div>

          <div className={s.or}>or paste a YouTube link</div>

          <form
            className={s.row}
            onSubmit={(e) => {
              e.preventDefault();
              importLink();
            }}
          >
            <input
              className="input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="https://www.youtube.com/watch?v=…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              aria-label="YouTube link"
            />
            <button className="btn btn-primary" disabled={busy || !link.trim()}>
              Import
            </button>
          </form>

          {upload !== null && <Progress value={upload} label={`Uploading… ${Math.round(upload * 100)}%`} />}
          {job && job.status !== "done" && job.status !== "error" && <Progress value={job.progress} label={job.message} pulse />}
          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
          {project.song && (
            <button className="btn btn-ghost btn-sm" onClick={() => setChanging(false)} style={{ alignSelf: "flex-start" }}>
              Keep {project.song.name}
            </button>
          )}
        </div>
      )}

      {project.song && !changing && <SongDetails api={editor} analysisState={analysisState} onChange={() => setChanging(true)} />}

      <div className={s.footer}>
        <button className="btn btn-primary" disabled={!project.song || busy} onClick={() => go("photos")}>
          Next: photos →
        </button>
      </div>
    </section>
  );
}

function SongDetails({ api: editor, analysisState, onChange }: { api: EditorApi; analysisState: AnalysisState | null; onChange: () => void }) {
  const { project, update } = editor;
  // `wave` may be a preview (waveform only, seconds after import); `analysis` needs beats.
  const wave = analysisState?.analysis ?? null;
  const analysis = wave && wave.status !== "preview" ? wave : null;
  const audio = useRef<HTMLAudioElement>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [mode, setMode] = useState<"clip" | "song">("clip");
  const [duration, setDuration] = useState<number | null>(null);
  const clip = analysis ? resolveClip(project, analysis) : null;

  useEffect(() => {
    if (playhead === null) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (!a) return;
      const end = mode === "clip" && clip ? clip.end : a.duration || Infinity;
      if (a.currentTime >= end || a.ended) {
        a.pause();
        setPlayhead(null);
        return;
      }
      setPlayhead(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playhead !== null, mode, clip?.start, clip?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    audio.current?.pause();
    setPlayhead(null);
  };

  const play = (from: number, m: "clip" | "song") => {
    const a = audio.current;
    if (!a) return;
    setMode(m);
    a.currentTime = from;
    a.play().then(() => setPlayhead(from)).catch(() => {});
  };

  const status = analysisState?.status ?? "missing";
  const job = analysisState?.job;
  const chorus = analysis && clip ? effectiveSections(project, analysis).find((x) => Math.abs(x.start - clip.start) < 0.3) : null;
  const total = wave?.duration ?? duration;

  return (
    <div className={`card ${s.panel}`}>
      <div className={s.spread}>
        <div className={s.songCard}>
          <div className={s.songIcon} aria-hidden>
            ♪
          </div>
          <div>
            <strong>{project.song!.name}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {analysis
                ? `${formatTime(analysis.duration)} · ${Math.round(analysis.tempo)} bpm · ${analysis.downbeats.length} bars`
                : total
                  ? `${formatTime(total)} · finding the beat…`
                  : "Loading…"}
            </div>
          </div>
        </div>
        <div className={s.row}>
          <button
            className="btn btn-sm"
            onClick={() => (playhead !== null && mode === "song" ? stop() : play(playhead ?? 0, "song"))}
            aria-label={playhead !== null && mode === "song" ? "Pause song" : "Play song"}
          >
            {playhead !== null && mode === "song" ? "❚❚ Pause" : "▶ Play song"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onChange}>
            Change song
          </button>
        </div>
      </div>

      {status !== "complete" && (
        <Progress
          value={job?.progress ?? 0.05}
          label={
            job?.status === "error"
              ? `Analysis failed: ${job.error}`
              : status === "partial"
                ? `Beats and bars ready. ${job?.message ?? "Finding notes"}… (you can keep going)`
                : status === "preview"
                  ? `You can listen already. ${job?.message ?? "Finding the beat"}…`
                  : job?.message ?? "Listening to the song…"
          }
          pulse={job?.status !== "error"}
        />
      )}

      {wave && !analysis && (
        <Waveform
          analysis={wave}
          sections={[]}
          clip={null}
          clipLength={project.clipLength}
          playhead={playhead}
          onSeek={(t) => (playhead !== null ? play(t, mode) : audio.current && (audio.current.currentTime = t))}
          onClipChange={() => {}}
        />
      )}

      {analysis && clip && (
        <>
          <div className={s.spread}>
            <strong>Which part of the song?</strong>
            <div className={s.segmented} role="group" aria-label="Clip length">
              {CLIP_LENGTHS.filter((l) => l <= analysis.duration + 1 || l === 15).map((len) => (
                <button
                  key={len}
                  aria-pressed={project.clipLength === len}
                  onClick={() =>
                    update((p) => {
                      const suggested = analysis.suggestedClips[String(len)];
                      const c = suggested && !p.clip ? suggested : clipFrom(p.clip?.start ?? suggested?.start ?? 0, len, analysis);
                      return { ...p, clipLength: len, clip: c };
                    })
                  }
                >
                  {len}s
                </button>
              ))}
            </div>
          </div>
          <Waveform
            analysis={analysis}
            sections={effectiveSections(project, analysis)}
            clip={clip}
            clipLength={project.clipLength}
            playhead={playhead}
            onClipChange={(c) => {
              update((p) => ({ ...p, clip: c }));
              if (audio.current && playhead !== null && mode === "clip") audio.current.currentTime = c.start;
            }}
          />
          <div className={s.spread}>
            <div className={s.stats + " muted"}>
              <span>
                Clip <b>{formatTime(clip.start)}</b>–<b>{formatTime(clip.end)}</b>
              </span>
              {chorus && <span>starts at the {chorus.label}</span>}
            </div>
            <div className={s.row}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => update((p) => ({ ...p, clip: analysis.suggestedClips[String(p.clipLength)] ?? clipFrom(0, p.clipLength, analysis) }))}
              >
                Use suggestion
              </button>
              <button
                className="btn btn-sm"
                onClick={() => (playhead !== null && mode === "clip" ? stop() : play(clip.start, "clip"))}
                aria-label={playhead !== null && mode === "clip" ? "Stop" : "Play clip"}
              >
                {playhead !== null && mode === "clip" ? "■ Stop" : "▶ Play clip"}
              </button>
            </div>
          </div>
          {analysis.warnings.includes("This song has no steady beat.") && (
            <p className={s.notice}>This song has no steady beat. Piano usually works better than Beat Flash here.</p>
          )}
        </>
      )}
      <audio
        ref={audio}
        src={`${ASSET_BASE}/${project.song!.src}`}
        preload="auto"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setDuration(null)}
      />
    </div>
  );
}

function Progress({ value, label, pulse }: { value: number; label: string; pulse?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className={`muted ${pulse ? "pulse" : ""}`} style={{ fontSize: 13 }}>
        {label}
      </span>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.max(3, value * 100)}%` }} />
      </div>
    </div>
  );
}

export { Progress };
