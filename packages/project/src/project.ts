import type { Project } from "./types";

export const PROJECT_VERSION = 1 as const;

export function createProject(id: string, now = new Date()): Project {
  const iso = now.toISOString();
  return {
    version: PROJECT_VERSION,
    id,
    name: "Untitled video",
    createdAt: iso,
    updatedAt: iso,
    song: null,
    clip: null,
    clipLength: 15,
    photos: [],
    stageId: "beat-flash",
    stageParams: {},
    blocks: [],
    sections: null,
    hits: { muted: [], added: [] },
    seed: Math.floor(Math.random() * 1_000_000),
    export: { watermark: true },
  };
}

/**
 * Bring a stored project up to the current version. Every schema change adds a
 * step here so old saved projects keep opening.
 */
export function migrateProject(raw: unknown): Project {
  const p = raw as Partial<Project> & { version?: number };
  if (!p || typeof p !== "object" || !p.id) throw new Error("Not a project");
  const base = createProject(p.id, new Date(p.createdAt ?? Date.now()));
  return {
    ...base,
    ...p,
    version: PROJECT_VERSION,
    hits: { muted: [], added: [], ...(p.hits ?? {}) },
    export: { ...base.export, ...(p.export ?? {}) },
    stageParams: p.stageParams ?? {},
    blocks: p.blocks ?? [],
    photos: p.photos ?? [],
  } as Project;
}

export const MIN_PHOTOS = 5;
export const CLIP_LENGTHS = [15, 30, 60] as const;
