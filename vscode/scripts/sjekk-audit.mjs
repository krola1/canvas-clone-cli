// Steg 2 i scripts/release-check.mjs: `npm audit --json` for hele treet (også
// devDependencies) vurdert mot tillatelseslisten i audit.mjs. Kjøres via
// release-check (som setter npm_execpath), eller alene med stien til npm-cli.js:
//   env npm_execpath=/usr/lib/node_modules/npm/bin/npm-cli.js node scripts/sjekk-audit.mjs
// (stien varierer mellom systemer; `npm run release-check` setter den selv).
// Ingen shell: npm startes som `node <npm-cli.js>` med argumentliste.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vurderAudit } from "./audit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli || !/\.(c?js|mjs)$/i.test(npmCli)) {
  console.error("Kjør dette via `npm run release-check` (fant ikke npm_execpath).");
  process.exit(1);
}

// npm audit avslutter med 1 når det finnes sårbarheter; utdataene leses uansett.
const stdout = await new Promise((resolve) => {
  execFile(process.execPath, [npmCli, "audit", "--json"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }, (_err, out) =>
    resolve(out ?? ""),
  );
});
let rapport = null;
try {
  rapport = JSON.parse(stdout);
} catch {
  // rapport = null gir feil under
}
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const r = vurderAudit(rapport, lock);

const tall = rapport?.metadata?.vulnerabilities;
if (tall) console.log(`npm audit: ${JSON.stringify(tall)}`);
console.log(`Godtatt etter kjent unntak (DECISIONS 2026-11-04, bare devDependencies): ${r.godtatt.length ? r.godtatt.join(", ") : "ingen"}`);
if (r.godtatt.length) console.log("Påminnelse: unntaket vurderes på nytt ved hver release (Lars 2026-11-04); fjern det fra TILLATT i audit.mjs når oppstrøms fiks finnes.");
if (r.ikkeFunnet.length) console.log(`Ikke lenger i rapporten (unntaket kan fjernes): ${r.ikkeFunnet.join(", ")}`);
if (!r.ok) {
  for (const f of r.feil) console.error(`FEIL: ${f}`);
  process.exit(1);
}
console.log("npm audit OK: ingen andre advisories på moderate eller høyere.");
