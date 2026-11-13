import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (…/video-creation-tool). */
export const REPO_ROOT = path.resolve(here, "../../..");

/** Where songs, analyses, photos, projects and renders live. Override with STAGES_DATA_DIR. */
export function dataDir() {
  const dir = process.env.STAGES_DATA_DIR || path.join(REPO_ROOT, "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const ANALYSIS_DIR = path.join(REPO_ROOT, "services", "analysis");

/** The analysis service's Python (its virtual environment), overridable with STAGES_PYTHON. */
export function pythonExe() {
  if (process.env.STAGES_PYTHON) return process.env.STAGES_PYTHON;
  const win = path.join(ANALYSIS_DIR, ".venv", "Scripts", "python.exe");
  const unix = path.join(ANALYSIS_DIR, ".venv", "bin", "python");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return process.platform === "win32" ? "python" : "python3";
}
