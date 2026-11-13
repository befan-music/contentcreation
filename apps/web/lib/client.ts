"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis, Project } from "@stages/project";

export const ASSET_BASE = "/api/files";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export function saveProject(p: Project) {
  return api<Project>(`/api/projects/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
}

/** Upload with progress (fetch has no upload progress). */
export function uploadForm<T>(url: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

// Analytics ------------------------------------------------------------------

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

function distinctId() {
  try {
    let id = localStorage.getItem("stages.uid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("stages.uid", id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/** Funnel events (roadmap Phase 3). PostHog when configured, else data/events.jsonl. */
export function track(event: string, props: Record<string, unknown> = {}) {
  const body = POSTHOG_KEY
    ? { url: `${POSTHOG_HOST}/capture/`, data: { api_key: POSTHOG_KEY, event, distinct_id: distinctId(), properties: props } }
    : { url: "/api/events", data: { event, props: { ...props, uid: distinctId() } } };
  fetch(body.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body.data), keepalive: true }).catch(() => {});
}

// Polling hooks ----------------------------------------------------------------

export type AnalysisState = {
  status: "missing" | "preview" | "partial" | "complete";
  analysis: Analysis | null;
  job: { status: string; progress: number; message: string; error?: string } | null;
};

/** Polls the song's analysis until it's complete. */
export function useAnalysis(hash: string | undefined): AnalysisState | null {
  const [state, setState] = useState<AnalysisState | null>(null);
  useEffect(() => {
    setState(null);
    if (!hash) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastStatus = "";
    const tick = async () => {
      try {
        const s = await api<AnalysisState>(`/api/songs/${hash}/analysis`);
        if (stop) return;
        // Only replace the analysis object when it changed, so the preview doesn't re-render every second.
        if (s.status !== lastStatus || !s.analysis) setState(s);
        else setState((prev) => (prev ? { ...prev, job: s.job } : s));
        lastStatus = s.status;
        if (s.status === "complete" || s.job?.status === "error") return;
      } catch {}
      timer = setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [hash]);
  return state;
}

export type JobState = { id: string; status: "queued" | "running" | "done" | "error"; progress: number; message: string; result?: any; error?: string };

export function useJob(id: string | null, onDone?: (job: JobState) => void): JobState | null {
  const [job, setJob] = useState<JobState | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    setJob(null);
    if (!id) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await api<JobState>(`/api/jobs/${id}`);
        if (stop) return;
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          done.current?.(j);
          return;
        }
      } catch {}
      timer = setTimeout(tick, 600);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);
  return job;
}
