// Pakkesjekk (tilsynets T14/T14a). Kjøres etter `npm run package`.
//
// 1. Leser den FAKTISKE .vsix-fila (zip) og feiler hvis den inneholder noe
//    utenfor hvitelisten.
// 2. Kjører `vsce ls` og bruker samme hviteliste (fanger feil i .vscodeignore
//    selv om .vsix-fila er utdatert).
// 3. Leser esbuild-metafilen (dist/meta.json) og feiler hvis bundelen drar inn
//    @inquirer/*, ora, src/config.js eller bin/, eller har andre eksterne
//    avhengigheter enn `vscode` og Node-moduler.
//
// Ingen nye avhengigheter: zip-katalogen leses for hånd. vsce startes med
// execFileSync (uten shell).
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const errors = [];

// Stier relativt til utvidelsens rot. Sammenlignes uten hensyn til store/små
// bokstaver (vsce kan endre navn på README/LICENSE).
const ALLOWED = new Set(
  // media/canvas-clone.svg: ikonet til beholderen i Activity Bar (D8-GUI), bare den ene fila.
  ["package.json", "dist/extension.js", "README.md", "CHANGELOG.md", "LICENSE", "LICENSE.txt", "LICENSE.md", "media/canvas-clone.svg"].map((p) =>
    p.toLowerCase(),
  ),
);
// Ikonet er påkrevd: package.json peker på det (viewsContainers), og uten det får
// Activity Bar et tomt ikon (D8-GUI).
const REQUIRED = ["package.json", "dist/extension.js", "media/canvas-clone.svg"];
// Ekstra vern i tilfelle hvitelisten over utvides ved en feil.
const FORBIDDEN = [/(^|\/)\.claude(\/|$)/i, /(^|\/)tests?(\/|$)/i, /(^|\/)vsc-tests(\/|$)/i, /(^|\/)\.git(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i, /(^|\/)\.vscode-test(\/|$)/i, /(^|\/)config\.json$/i, /(^|\/)cache/i,
  /\.vsix$/i, /\.map$/i, /(^|\/)meta\.json$/i, /(^|\/)src\//i, /(^|\/)bin\//i, /(^|\/)grading(\/|$)/i];

function checkList(source, files) {
  for (const f of files) {
    if (!ALLOWED.has(f.toLowerCase())) errors.push(`${source}: ikke på hvitelisten: ${f}`);
    for (const re of FORBIDDEN) if (re.test(f)) errors.push(`${source}: forbudt sti: ${f}`);
  }
  for (const r of REQUIRED) if (!files.some((f) => f.toLowerCase() === r)) errors.push(`${source}: mangler ${r}`);
}

// --- 1. Den faktiske .vsix-fila --------------------------------------------
function zipEntries(buf) {
  // End of central directory: signatur 0x06054b50, maks 64 KiB kommentar.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("fant ikke zip-katalogen (EOCD)");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error(`ugyldig katalogoppføring ved ${off}`);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    names.push(buf.toString("utf8", off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

const vsixPath = join(root, `${pkg.name}-${pkg.version}.vsix`);
let vsixFiles = [];
if (!existsSync(vsixPath)) {
  errors.push(`fant ikke ${vsixPath} - kjør \`npm run package\` først`);
} else {
  const entries = zipEntries(readFileSync(vsixPath));
  const META = new Set(["extension.vsixmanifest", "[Content_Types].xml"]);
  for (const e of entries) {
    if (META.has(e)) continue;
    if (!e.startsWith("extension/")) { errors.push(`.vsix: uventet oppføring utenfor extension/: ${e}`); continue; }
    vsixFiles.push(e.slice("extension/".length));
  }
  checkList(".vsix", vsixFiles);
}

// --- 2. vsce ls --------------------------------------------------------------
const vsceBin = join(root, "node_modules", "@vscode", "vsce", "vsce");
const lsOut = execFileSync(process.execPath, [vsceBin, "ls"], { cwd: root, encoding: "utf8" });
const lsFiles = lsOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\\/g, "/"));
checkList("vsce ls", lsFiles);

// --- 3. esbuild-metafilen ----------------------------------------------------
const metaPath = join(root, "dist", "meta.json");
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
if (!existsSync(metaPath)) {
  errors.push(`fant ikke ${metaPath} - kjør \`npm run build\` først`);
} else {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const inputs = Object.keys(meta.inputs).map((p) => p.replace(/\\/g, "/"));
  const BAD_INPUT = [/node_modules\/@inquirer\//, /node_modules\/ora\//, /(^|\/)src\/config\.js$/, /(^|\/)bin\//];
  for (const i of inputs) for (const re of BAD_INPUT) if (re.test(i)) errors.push(`bundle: forbudt kilde: ${i}`);
  if (!inputs.includes("../src/config-store.js")) errors.push("bundle: ../src/config-store.js mangler (felles kjerne er ikke med)");
  for (const [out, info] of Object.entries(meta.outputs)) {
    for (const imp of info.imports) {
      if (!imp.external) continue;
      if (imp.path !== "vscode" && !builtins.has(imp.path)) errors.push(`bundle: uventet ekstern import i ${out}: ${imp.path}`);
    }
  }
  const bundle = readFileSync(join(root, "dist", "extension.js"), "utf8");
  if (/@inquirer\/|require\(["']ora["']\)/.test(bundle)) errors.push("bundle: dist/extension.js nevner @inquirer eller ora");
}

// --- Resultat ----------------------------------------------------------------
console.log(`vsce ls (${lsFiles.length}):\n  ${lsFiles.join("\n  ")}`);
if (vsixFiles.length) console.log(`.vsix extension/ (${vsixFiles.length}):\n  ${vsixFiles.join("\n  ")}`);
if (errors.length) {
  console.error(`\nPakkesjekk FEILET (${errors.length}):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("\nPakkesjekk OK.");
