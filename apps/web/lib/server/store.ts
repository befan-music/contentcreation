import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createProject, migrateProject, type Project, type StageDef } from "@stages/project";
import { dataDir } from "@stages/render/paths";

/**
 * Local storage adapter: projects and Custom Stages as JSON files under data/.
 * Single-user "local mode" until Supabase is connected (status.md).
 */

export const DATA_DIR = dataDir();

function dir(name: string) {
  const d = path.join(DATA_DIR, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const safeId = (id: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(id);

function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export function newId() {
  return crypto.randomBytes(6).toString("hex");
}

// Projects -------------------------------------------------------------------

export function listProjects(): Project[] {
  return fs
    .readdirSync(dir("projects"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return migrateProject(JSON.parse(fs.readFileSync(path.join(dir("projects"), f), "utf8")));
      } catch {
        return null;
      }
    })
    .filter((p): p is Project => !!p)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(id: string): Project | null {
  if (!safeId(id)) return null;
  const file = path.join(dir("projects"), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return migrateProject(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function saveProject(project: Project): Project {
  if (!safeId(project.id)) throw new Error("bad id");
  const p = { ...project, updatedAt: new Date().toISOString() };
  writeJson(path.join(dir("projects"), `${p.id}.json`), p);
  return p;
}

export function createAndSaveProject(): Project {
  return saveProject(createProject(newId()));
}

export function updateProject(id: string, fn: (p: Project) => Project): Project {
  const p = getProject(id);
  if (!p) throw new Error("Project not found");
  return saveProject(fn(p));
}

export function deleteProject(id: string) {
  if (!safeId(id)) return;
  fs.rmSync(path.join(dir("projects"), `${id}.json`), { force: true });
}

// Custom Stages --------------------------------------------------------------

export function listCustomStages(): StageDef[] {
  return fs
    .readdirSync(dir("stages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir("stages"), f), "utf8")) as StageDef)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveCustomStage(stage: StageDef): StageDef {
  if (!safeId(stage.id)) throw new Error("bad id");
  writeJson(path.join(dir("stages"), `${stage.id}.json`), stage);
  return stage;
}

export function deleteCustomStage(id: string) {
  if (!safeId(id)) return;
  fs.rmSync(path.join(dir("stages"), `${id}.json`), { force: true });
}

// Analytics (local fallback for PostHog) ------------------------------------

export function appendEvent(event: Record<string, unknown>) {
  fs.appendFileSync(path.join(DATA_DIR, "events.jsonl"), JSON.stringify({ ...event, at: new Date().toISOString() }) + "\n");
}
