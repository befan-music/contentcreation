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
  export function storeSong(srcPath: string, dataDir: string, opts?: { name?: string; move?: boolean }): Promise<{ song: Song; path: string; converted: boolean }>;
  export function probeAudioCodec(file: string): Promise<string | null>;
  export function isUniversallyPlayable(ext: string, codec: string | null): boolean;
  export function importYouTube(url: string, dataDir: string, opts?: { onProgress?: (p: number, message: string) => void }): Promise<{ song: Song; path: string; meta: { title: string; artist: string; duration: number | null; videoId: string; name: string } }>;
  export function analysisPath(dataDir: string, hash: string): string;
  export function readAnalysis(dataDir: string, hash: string): Analysis | null;
}

declare module "@stages/render/magic" {
  import type { PhotoStyle } from "@stages/project";
  export function magicConfig(): { provider: "higgsfield" | "mock" | "none"; model: string; configured: boolean };
  export function stylizePhoto(o: { photo: { id: string; src: string }; dataDir: string; prompt: string; fullPrompt: string; key: string }): Promise<PhotoStyle>;
  export function checkHiggsfield(): Promise<{ ok: boolean; provider: string; model?: string; message: string }>;
}

declare module "@stages/render/python" {
  export function analyzeSong(
    songPath: string,
    outJson: string,
    opts?: { hash?: string; fast?: boolean; onProgress?: (p: number, message: string) => void; onPartial?: () => void },
  ): Promise<unknown>;
  export function fetchYouTube(url: string, outDir: string, opts?: { onProgress?: (p: number, message: string) => void }): Promise<unknown>;
}
