// Bygger utvidelsen til én CJS-fil: vscode/src/extension.js + den felles
// kjernen i ../src -> dist/extension.js. `vscode` er ekstern (leveres av
// utvidelsesverten). Metafilen skrives til dist/meta.json og sjekkes av
// scripts/check-package.mjs (ingen @inquirer/ora/config.js/bin i bundelen).
// Se .claude/docs/D0-vscode-verifisering.md, punkt h.
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, "dist");

const result = await build({
  absWorkingDir: here,
  entryPoints: ["src/extension.js"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  sourcemap: false,
  minify: false,
  metafile: true,
  logLevel: "info",
});

mkdirSync(outdir, { recursive: true });
writeFileSync(join(outdir, "meta.json"), JSON.stringify(result.metafile, null, 2));
