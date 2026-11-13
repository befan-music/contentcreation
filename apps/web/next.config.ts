import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  // Shared TypeScript packages are compiled by Next.
  transpilePackages: ["@stages/project", "@stages/stages"],
  // Node-only code (sharp, child processes) stays outside the bundle.
  serverExternalPackages: ["sharp", "heic-convert", "@stages/render"],
  turbopack: { root },
  outputFileTracingRoot: root,
  devIndicators: false,
};

export default nextConfig;
