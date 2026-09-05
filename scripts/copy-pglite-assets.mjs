#!/usr/bin/env node
/**
 * Nitro inlines @electric-sql/pglite but does not copy the sidecar
 * pglite.data / pglite.wasm files that Emscripten loads via import.meta.url.
 * Vite preview (and any PGLite-backed server function) then ENOENT-crashes.
 * Copy the sidecars next to the bundled module after `vite build`.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const destDirs = [
  join(root, ".vercel/output/functions/__server.func/_libs"),
  join(root, "node_modules/.nitro/vite/services/ssr/assets"),
];
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

let copied = 0;
for (const dest of destDirs) {
  if (!existsSync(dest)) continue;
  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    const from = join(srcDir, file);
    if (!existsSync(from)) {
      console.warn(`[pglite-assets] missing ${from}`);
      continue;
    }
    copyFileSync(from, join(dest, file));
    copied += 1;
  }
}
if (copied === 0) {
  console.warn("[pglite-assets] no destination directories found; skipped");
} else {
  console.log(`[pglite-assets] copied ${copied} sidecar file(s)`);
}
