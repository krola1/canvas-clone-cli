// Release-check for VS Code-utvidelsen (D7b, tilsynets T14/T14a).
// Kjøres med `npm run release-check` i vscode/ (eller fra roten, som en del av
// rot-`npm run release-check`).
//
// Steg, i rekkefølge; stopper ved første feil:
//   0. arbeidskatalogen er ren (`git status --porcelain` er tom), slik at
//      .vsix-fila bare bygges fra committet kode (Lars 2026-10-30)
//   1. npm ci --ignore-scripts      ren installasjon fra package-lock.json
//   2. npm audit --audit-level=moderate   hele treet, også devDependencies
//      (bundelen har ingen runtime-avhengigheter; byggverktøyene er det som
//      faktisk kjører og lager pakken)
//   3. bygg (esbuild.mjs)
//   4. vsce package
//   5. pakkesjekken (check-package.mjs: den faktiske .vsix-fila, vsce ls og
//      esbuild-metafilen; T14a)
//   6. SHA-256 av den faktiske .vsix-fila -> <pakke>.vsix.sha256 i formatet
//      `sha256sum -c` godtar (skriv-sjekksum.mjs)
//
// VS Code-testene (xvfb) er ikke med: de krever skjerm. Kjør dem for seg, se
// README. Alle prosesser startes med spawn og argumentliste, uten shell.
import { execFile, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// npm startes som `node <npm-cli.js>`, slik at det virker uten shell også på
// Windows (der `npm` er en .cmd-fil). npm_execpath settes av `npm run`.
const npmCli = process.env.npm_execpath;
if (!npmCli || !/\.(c?js|mjs)$/i.test(npmCli)) {
  console.error("Kjør dette via `npm run release-check` (fant ikke npm_execpath).");
  process.exit(1);
}

function kjor(navn, args) {
  return new Promise((resolve) => {
    console.log(`\n=== ${navn}: node ${args.join(" ")}`);
    const barn = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
    barn.on("error", (err) => {
      console.error(`${navn}: kunne ikke starte (${err.message})`);
      resolve(1);
    });
    barn.on("close", (kode, signal) => resolve(signal ? 1 : kode));
  });
}

// Steg 0: ren arbeidskatalog. Ignorerte filer (.vsix, .sha256, node_modules)
// vises ikke av --porcelain og stopper ikke.
const status = await new Promise((resolve) => {
  execFile("git", ["status", "--porcelain"], { cwd: root }, (err, stdout) =>
    resolve(err ? null : stdout),
  );
});
if (status === null) {
  console.error("release-check FEILET: kunne ikke kjøre `git status` (er git installert?).");
  process.exit(1);
}
if (status.trim() !== "") {
  console.error("release-check FEILET: arbeidskatalogen har endringer som ikke er committet:");
  console.error(status.trimEnd());
  console.error("Commit eller fjern dem først, så .vsix-fila bygges fra committet kode.");
  process.exit(1);
}

const steg = [
  ["npm ci", [npmCli, "ci", "--ignore-scripts"]],
  ["npm audit", [npmCli, "audit", "--audit-level=moderate"]],
  ["bygg", [join(root, "esbuild.mjs")]],
  ["vsce package", [join(root, "node_modules", "@vscode", "vsce", "vsce"), "package"]],
  ["pakkesjekk", [join(root, "scripts", "check-package.mjs")]],
  ["SHA-256", [join(root, "scripts", "skriv-sjekksum.mjs")]],
];

for (const [navn, args] of steg) {
  const kode = await kjor(navn, args);
  if (kode !== 0) {
    console.error(`\nrelease-check FEILET i steget «${navn}» (exit ${kode}).`);
    process.exit(1);
  }
}

console.log("\nrelease-check OK. Filene som deles: .vsix-fila og .vsix.sha256-fila over (i vscode/).");
