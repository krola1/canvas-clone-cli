// T12 (D5): «vis hva som ble liggende» og «slett alle nå», for begge røttene
// under ~/canvas-clone: utvidelsens `vscode/` og CLI-ets `grading/`. Ren
// logikk uten `vscode`-import (tests/vscode-rester.test.js).
//
// - vscode/: kartlegges med kartleggOkter (den felles regelen fra D4), og
//   slettes av hovedvinduets vanlige rydding. Et ferskt hjerteslag (vurdering
//   "aktiv") og økter hovedvinduet selv holder, røres aldri.
// - grading/: kartlegges her med samme regel som startupCleanup (øktnavn med
//   PID, død PID = rest, symlenket rot = ingenting), og slettes med
//   startupCleanup selv, uendret.
// Bare øktnavn og status kommer ut herfra, aldri innholdet i en økt (elevdata).
import { readdirSync, lstatSync, existsSync } from "node:fs";
import path from "node:path";
import { sessionPid, pidAlive, startupCleanup } from "../../src/storage.js";
import { TID, kartleggOkter } from "./okter.mjs";

function erSymlenke(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// Statusen til hver oppføring i vscode-roten, sett fra brukeren:
//   "slettes"   - ryddingen sletter den nå (ferdig, forlatt, gammel rest, halvveis slettet)
//   "apen"      - ferskt hjerteslag: åpen i et vindu (røres aldri)
//   "lukket"    - hjerteslaget har stoppet nylig; slettes automatisk når det er UTLOPT gammelt
//   "holdt"     - hovedvinduet kloner inn i den eller venter på at den åpnes
//   "avslutter" - «Ferdig» er nettopp trykket; slettes om noen sekunder
//   "venter"    - VS Code har nettopp startet eller våknet; vurderes om litt
//   "rest"      - mappe uten markør; slettes automatisk når den er gammel nok
//   "symlenke"  - ville vært slettet, men roten er en symlenke
export function statusVscode(o) {
  if (o.handling) return "slettes";
  if (o.symlenke) return "symlenke";
  if (o.vurdering === "aktiv") return o.hjerteslagAlder <= TID.GJENOPPTA_MAKS ? "apen" : "lukket";
  if (o.vurdering === "holdt" || o.vurdering === "avslutter" || o.vurdering === "venter") return o.vurdering;
  if (o.vurdering === "rest_venter") return "rest";
  return "venter";
}

export function kartleggVscode(root, { naa, vaakenSiden, holdt }) {
  const k = kartleggOkter(root, { naa, vaakenSiden, holdt });
  return {
    root,
    okter: k.oppforinger.map((o) => ({ navn: o.navn, status: statusVscode(o) })).sort((a, b) => a.navn.localeCompare(b.navn)),
    ukjente: k.ukjente,
    rootSymlink: k.rootSymlink,
  };
}

// Kjører VS Code i en sandkasse med eget PID-navnerom (Flatpak), ser pidAlive
// ikke vertens prosesser, og en pågående CLI-kjøring ville sett død ut. Da
// røres ikke grading/ i det hele tatt. Snap tas ikke med (Lars, 2026-10-30): VS Code
// som snap er «classic» og ser vertens PID-er.
export function iSandkasse({ env = process.env, finnes = existsSync } = {}) {
  if (env.FLATPAK_ID) return "flatpak";
  if (finnes("/.flatpak-info")) return "flatpak";
  return null;
}

// Samme regel som startupCleanup (src/storage.js), uten å slette:
//   "slettes" - øktnavn med PID som ikke lever (rest etter CLI-et)
//   "i_bruk"  - PID-en lever (en CLI-kjøring pågår)
//   "symlenke" - roten eller ~/canvas-clone er en symlenke: ingenting slettes
//   "sandkasse" - VS Code kjører i en sandkasse (iSandkasse): ingenting slettes
export function kartleggGrading(root, { isAlive = pidAlive, sandkasse = iSandkasse() } = {}) {
  const okter = [];
  let ukjente = 0;
  const rootSymlink = erSymlenke(root) || erSymlenke(path.dirname(root));
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return { root, okter, ukjente, rootSymlink, sandkasse };
  }
  for (const entry of entries) {
    const pid = sessionPid(entry.name);
    if (pid === null || !entry.isDirectory()) {
      ukjente++;
      continue;
    }
    const status = sandkasse ? "sandkasse" : isAlive(pid) ? "i_bruk" : rootSymlink ? "symlenke" : "slettes";
    okter.push({ navn: entry.name, status });
  }
  okter.sort((a, b) => a.navn.localeCompare(b.navn));
  return { root, okter, ukjente, rootSymlink, sandkasse };
}

export function antallSomSlettes(kart) {
  return kart.okter.filter((o) => o.status === "slettes").length;
}

// Sletter rester i grading/ med startupCleanup, uendret. Utvidelsen har ingen
// egen økt der: ownName null, og en PID som aldri forekommer i et øktnavn.
// I en sandkasse slettes ingenting (se iSandkasse).
export function slettGrading(root, { isAlive = pidAlive, sandkasse = iSandkasse() } = {}) {
  if (sandkasse) return { removed: [], failed: [], skippedAlive: [], unknown: 0, rootSymlink: false, sandkasse };
  return { ...startupCleanup(root, null, { isAlive, ownPid: -1 }), sandkasse: null };
}
