import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Analysis, Project, StageDef } from "@stages/project";
import { REPO_ROOT } from "@stages/render/paths";
import { analyzeSong } from "@stages/render/python";
import { analysisPath, importYouTube, readAnalysis } from "@stages/render/songs";
import { DATA_DIR, newId, updateProject } from "./store";

/**
 * In-process job runner (local mode). Jobs: song analysis, YouTube import,
 * render. State lives in memory and in data/jobs/<id>.json so a page reload
 * can pick it up. In production this becomes a queue + GPU/render workers
 * (roadmap: architecture), with progress pushed over Supabase Realtime.
 */

export type JobKind = "analysis" | "import" | "render";
export type Job = {
  id: string;
  kind: JobKind;
  key: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
  partial?: boolean;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type Registry = { jobs: Map<string, Job>; renderQueue: Promise<unknown> };
const g = globalThis as unknown as { __stagesJobs?: Registry };
const reg: Registry = (g.__stagesJobs ??= { jobs: new Map(), renderQueue: Promise.resolve() });

const jobsDir = () => {
  const d = path.join(DATA_DIR, "jobs");
  fs.mkdirSync(d, { recursive: true });
  return d;
};

function persist(job: Job) {
  job.updatedAt = new Date().toISOString();
  reg.jobs.set(job.id, job);
  try {
    fs.writeFileSync(path.join(jobsDir(), `${job.id}.json`), JSON.stringify(job));
  } catch {}
}

export function getJob(id: string): Job | null {
  if (!/^[a-f0-9]{12}$/.test(id)) return null;
  const mem = reg.jobs.get(id);
  if (mem) return mem;
  const file = path.join(jobsDir(), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const job = JSON.parse(fs.readFileSync(file, "utf8")) as Job;
  // A job file from a previous server process that never finished is dead.
  if (job.status === "running" || job.status === "queued") return { ...job, status: "error", error: "Server restarted. Please try again." };
  return job;
}

function activeJob(kind: JobKind, key: string): Job | undefined {
  for (const j of reg.jobs.values()) if (j.kind === kind && j.key === key && (j.status === "running" || j.status === "queued")) return j;
}

function newJob(kind: JobKind, key: string): Job {
  const now = new Date().toISOString();
  const job: Job = { id: newId(), kind, key, status: "queued", progress: 0, message: "Waiting", createdAt: now, updatedAt: now };
  persist(job);
  return job;
}

// Analysis -------------------------------------------------------------------

/** Start analysis for a stored song unless it's complete or already running. Returns the job (or null when done). */
export function ensureAnalysis(hash: string, songPath: string): Job | null {
  const existing = readAnalysis(DATA_DIR, hash);
  if (existing?.status === "complete") return null;
  const running = activeJob("analysis", hash);
  if (running) return running;
  const job = newJob("analysis", hash);
  job.status = "running";
  job.message = "Listening to the song";
  persist(job);
  analyzeSong(songPath, analysisPath(DATA_DIR, hash), {
    hash,
    onProgress: (p, message) => persist({ ...job, ...reg.jobs.get(job.id), progress: p, message }),
    onPartial: () => persist({ ...reg.jobs.get(job.id)!, partial: true }),
  })
    .then(() => persist({ ...reg.jobs.get(job.id)!, status: "done", progress: 1, message: "Done" }))
    .catch((e: Error) => persist({ ...reg.jobs.get(job.id)!, status: "error", error: e.message }));
  return job;
}

export function analysisState(hash: string): { status: "missing" | "partial" | "complete"; analysis: Analysis | null; job: Job | null } {
  const analysis = readAnalysis(DATA_DIR, hash);
  const job = activeJob("analysis", hash) ?? [...reg.jobs.values()].reverse().find((j) => j.kind === "analysis" && j.key === hash) ?? null;
  return { status: analysis ? analysis.status : "missing", analysis, job };
}

// YouTube import ---------------------------------------------------------------

export function startYouTubeImport(projectId: string, url: string): Job {
  const job = newJob("import", projectId);
  job.status = "running";
  job.message = "Downloading the song";
  job.progress = 0.1;
  persist(job);
  importYouTube(url, DATA_DIR)
    .then(({ song, path: songPath }) => {
      updateProject(projectId, (p) => ({ ...p, song, clip: null, blocks: [], sections: null, hits: { muted: [], added: [] }, name: p.name === "Untitled video" ? song.name : p.name }));
      const analysis = ensureAnalysis(song.id, songPath);
      persist({ ...reg.jobs.get(job.id)!, status: "done", progress: 1, message: "Downloaded", result: { song, analysisJob: analysis?.id ?? null } });
    })
    .catch((e: Error) => persist({ ...reg.jobs.get(job.id)!, status: "error", error: e.message }));
  return job;
}

// Render -----------------------------------------------------------------------

export function startRender(project: Project, analysis: Analysis, customStages: StageDef[]): Job {
  const job = newJob("render", project.id);
  const renderId = job.id;
  const outBase = path.join(DATA_DIR, "renders", project.id, renderId);
  const jobFile = path.join(jobsDir(), `${renderId}.input.json`);
  fs.writeFileSync(jobFile, JSON.stringify({ input: { project, analysis, customStages }, outBase, assetsDir: DATA_DIR }));

  const run = () =>
    new Promise<void>((resolve) => {
      persist({ ...reg.jobs.get(job.id)!, status: "running", message: "Starting", progress: 0.01 });
      const child = spawn(process.execPath, [path.join(REPO_ROOT, "services", "render", "src", "cli.mjs"), "job", jobFile], {
        cwd: REPO_ROOT,
        env: { ...process.env, STAGES_DATA_DIR: DATA_DIR },
        windowsHide: true,
      });
      let buf = "";
      let error = "";
      let lastWrite = 0;
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line.startsWith("PROGRESS ")) {
            const [, p, ...msg] = line.split(" ");
            const now = Date.now();
            if (now - lastWrite > 250) {
              lastWrite = now;
              persist({ ...reg.jobs.get(job.id)!, progress: Number(p), message: msg.join(" ") });
            }
          } else if (line.startsWith("RESULT ")) {
            const r = JSON.parse(line.slice(7));
            const rel = (abs: string) => path.relative(DATA_DIR, abs).split(path.sep).join("/");
            persist({
              ...reg.jobs.get(job.id)!,
              result: { withAudio: rel(r.withAudio), silent: rel(r.silent), seconds: r.seconds, clip: project.clip },
            });
          } else if (line.startsWith("ERROR ")) error = line.slice(6);
        }
      });
      child.stderr.on("data", (d) => (error ||= String(d).slice(0, 400)));
      child.on("close", (code) => {
        const j = reg.jobs.get(job.id)!;
        if (code === 0 && j.result) persist({ ...j, status: "done", progress: 1, message: "Done" });
        else persist({ ...j, status: "error", error: error || `Render failed (${code})` });
        fs.rmSync(jobFile, { force: true });
        resolve();
      });
    });

  // One render at a time; Remotion already uses every core.
  reg.renderQueue = reg.renderQueue.then(run, run);
  persist({ ...job, message: "Queued" });
  return reg.jobs.get(job.id)!;
}
