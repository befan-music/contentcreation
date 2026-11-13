// Types for the Node-only helpers in services/render (plain .mjs).
declare module "heic-convert" {
  const convert: (opts: { buffer: Buffer | ArrayBuffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer>;
  export default convert;
}

declare module "@stages/render/paths" {
  export const REPO_ROOT: string;
  export const ANALYSIS_DIR: string;
  export function dataDir(): string;
  export function pythonExe(): string;
}

declare module "@stages/render/photos" {
  import type { Photo } from "@stages/project";
  export function processPhoto(buffer: Buffer, dataDir: string): Promise<Photo>;
  export function thumbnail(srcPath: string, size?: number): Promise<Buffer>;
}

declare module "@stages/render/songs" {
  import type { Analysis, Song } from "@stages/project";
  export const AUDIO_EXTS: string[];
  export function hashFile(file: string): string;
  export function storeSong(srcPath: string, dataDir: string, opts?: { name?: string; move?: boolean }): { song: Song; path: string };
  export function importYouTube(url: string, dataDir: string): Promise<{ song: Song; path: string; meta: { title: string; artist: string; duration: number | null; videoId: string; name: string } }>;
  export function analysisPath(dataDir: string, hash: string): string;
  export function readAnalysis(dataDir: string, hash: string): Analysis | null;
}

declare module "@stages/render/python" {
  export function analyzeSong(
    songPath: string,
    outJson: string,
    opts?: { hash?: string; fast?: boolean; onProgress?: (p: number, message: string) => void; onPartial?: () => void },
  ): Promise<unknown>;
  export function fetchYouTube(url: string, outDir: string): Promise<unknown>;
}
