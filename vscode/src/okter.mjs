// Ren logikk for økter i VS Code-utvidelsen (D4). Ingen import av `vscode`
// her, slik at alt kan testes med `node --test` (tests/vscode-okter.test.js;
// .mjs fordi vscode/package.json ikke har "type": "module").
//
// Modellen (kritikers B2, tilsynets T12, Lars 2026-10-29):
// - Egen rot `~/canvas-clone/vscode/`. Én mappe per økt,
//   `<YYYYMMDD-HHMMSS>-<8 hex>`. Navnet brukes aldri om igjen (T9a: tillit gitt
//   til en sti blir liggende i VS Code etter at mappen er slettet).
// - Markøren `<økt>/.canvas-clone-okt` (Lars) aktiverer utvidelsen i
//   øktvinduet. Hjerteslaget er markørens mtime: øktvinduet setter den hvert
//   HJERTESLAG ms. Ingen stier, ingen journal.
// - «Ferdig» i øktvinduet stopper hjerteslaget, skriver
//   `<økt>/.canvas-clone-ferdig` ({ tid, workspaceStorage }) og lukker vinduet.
// - Én felles regel (`vurderOkt`/`kanGjenopptas`) avgjør både om hovedvinduet
//   (eller neste oppstart) kan slette en økt, og om et øktvindu som åpnes på
//   nytt (Reload, gjenopprettede vinduer etter omstart) får fortsette økten.
//   Terskelen for å fortsette er mye lavere enn terskelen for å slette, så de
//   to kan aldri slå til samtidig. Et ferskt hjerteslag slettes aldri.
// - All sletting går via `safeRemove()` i src/storage.js, etter en egen
//   sti-sjekk (`sjekkOktSti`, tilsvarende T6+ for CLI-et).
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
  utimesSync,
  renameSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { safeRemove, ensureBaseGitignore, sanitizeFolderName } from "../../src/storage.js";

export const OKT_MARKOR = ".canvas-clone-okt";
export const FERDIG_MARKOR = ".canvas-clone-ferdig";

// Tider i ms. Kravene mellom dem (testet i tests/vscode-okter.test.js):
// GJENOPPTA_MAKS < UTLOPT, VAAKEN_KRAV > flere hjerteslag, og FERDIG_VENT >
// GJENOPPLIV + TOLERANSE.
export const TID = Object.freeze({
  HJERTESLAG: 5_000, // øktvinduet setter markørens mtime så ofte
  GJENOPPTA_MAKS: 60_000, // et øktvindu som starter (igjen) kan fortsette økten bare hvis hjerteslaget er yngre enn dette
  UTLOPT: 180_000, // hovedvinduet kan overta (slette) bare hvis hjerteslaget er eldre enn dette ...
  VAAKEN_KRAV: 30_000, // ... og hovedvinduet selv har vært våkent (ingen hvilemodus/tidshopp) minst så lenge
  FERDIG_VENT: 6_000, // sletting etter «Ferdig» venter så lenge etter ferdig-tiden
  GJENOPPLIV: 3_000, // er øktvinduet fortsatt åpent så lenge etter «Ferdig», slår det hjerteslaget på igjen
  TOLERANSE: 2_000, // mtime kan være grovere enn ms (FAT: 2 s)
  TIKK: 3_000, // hovedvinduet ser etter ferdige/forlatte økter så ofte
  HOPP: 15_000, // tikk som kommer så mye for sent tolkes som hvilemodus
  HOLD: 30 * 60_000, // hovedvinduet holder liv i en økt det har opprettet (D5 kloner) til den åpnes, høyst så lenge
  FRAMTID_MAKS: 24 * 3_600_000, // hjerteslag mer enn dette fram i tid regnes som gammelt (klokka er stilt kraftig tilbake)
});

// Innstillinger i `<økt>/.vscode/settings.json` (T11, D0 e/f). Bare rot-`.vscode/`
// i workspace-mappen leses av VS Code, så elevrepoenes egne `.vscode/` har
// ingen effekt (T9a). Aldri tasks.json, launch.json, extensions.json eller mcp.json.
export const OKT_INNSTILLINGER = Object.freeze({
  // Ingen kopier av elevfiler i <userData>/User/History/ (scope RESOURCE, virker
  // også i Restricted Mode, D0 e).
  "workbench.localHistory.enabled": false,
  // Søk følger ikke symlenker i elevrepoene ut av økten.
  "search.followSymlinks": false,
  // Nestede AGENTS.md fra elevrepoer leses ikke av KI-agenter hvis vinduet blir
  // betrodd (D0 f, R-V2). Er av som standard; satt eksplisitt.
  "chat.useNestedAgentsMdFiles": false,
  // Våre egne filer skjules i utforskeren.
  "files.exclude": { [OKT_MARKOR]: true, [FERDIG_MARKOR]: true, ".vscode": true },
});

// ~/canvas-clone/vscode - egen rot for utvidelsen (Lars, tilsynets T12).
export function vscodeRot(home = homedir()) {
  return path.join(home, "canvas-clone", "vscode");
}

const OKT_RE = /^\d{8}-\d{6}-[0-9a-f]{8}$/;
// En økt som er i ferd med å slettes, får først dette navnet (rename i samme
// mappe), så slettes den. Feiler slettingen halvveis, prøver ryddingen igjen
// på navnet, uten markør og uten regel: slettingen er allerede bestemt.
const SLETTES_RE = /^(\d{8}-\d{6}-[0-9a-f]{8})\.slettes-[0-9a-f]{8}$/;

export function erOktNavn(navn) {
  return typeof navn === "string" && OKT_RE.test(navn);
}

// Øktnavnet bak et «slettes»-navn, ellers null.
export function slettesOktNavn(navn) {
  const m = typeof navn === "string" ? SLETTES_RE.exec(navn) : null;
  return m ? m[1] : null;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function tilfeldigHex() {
  return randomBytes(4).toString("hex");
}

export function oktNavn(now = new Date(), tilfeldig = tilfeldigHex) {
  const dato = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const tid = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${dato}-${tid}-${tilfeldig()}`;
}

// Mappenavn under en økt (for D5): som sanitizeFolderName, men aldri med
// punktum først, slik at ingen direkte undermappe kan hete `.vscode` o.l. (T9a).
export function oktUndermappenavn(navn) {
  const s = sanitizeFolderName(navn);
  return s.startsWith(".") ? `_${s}` : s;
}

function lstatEllerNull(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function realpathEllerNull(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

function erSymlenke(p) {
  return lstatEllerNull(p)?.isSymbolicLink() === true;
}

const caseUfolsom = (platform) => platform === "win32";

// Stien med forelderen løst opp med realpath (stien selv trenger ikke finnes).
// Brukes når en sti fra VS Code (workspace.json) skal sammenlignes med vår
// egen, og roten (eller noe over den) kan være en symlenke.
function kanonisk(p) {
  const abs = path.resolve(p);
  const forelder = realpathEllerNull(path.dirname(abs));
  return forelder ? path.join(forelder, path.basename(abs)) : abs;
}

function sammeSti(a, b, platform = process.platform) {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return caseUfolsom(platform) ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// Lager en ny, tom økt: `<rot>/<navn>/.vscode/settings.json` og til slutt
// markøren (med mtime = nå, altså et ferskt hjerteslag). Markøren skrives
// sist: en mappe uten markør regnes ikke som økt, bare som rest (se ryddOkter).
// `~/canvas-clone/.gitignore` (`*`) lages om den mangler (T12).
// Finnes navnet fra før, prøves et nytt (navnet brukes aldri om igjen).
export function opprettOkt(root, { now = new Date(), tilfeldig = tilfeldigHex, forsok = 5 } = {}) {
  ensureBaseGitignore(root);
  mkdirSync(root, { recursive: true });
  for (let i = 0; i < forsok; i++) {
    const navn = oktNavn(now, tilfeldig);
    const sti = path.join(root, navn);
    try {
      mkdirSync(sti);
    } catch (err) {
      if (err.code === "EEXIST") continue;
      throw err;
    }
    mkdirSync(path.join(sti, ".vscode"));
    writeFileSync(path.join(sti, ".vscode", "settings.json"), `${JSON.stringify(OKT_INNSTILLINGER, null, 2)}\n`, {
      flag: "wx",
    });
    writeFileSync(path.join(sti, OKT_MARKOR), `${JSON.stringify({ canvasClone: 1 })}\n`, { flag: "wx" });
    return { navn, sti };
  }
  throw new Error("fant ikke et ledig øktnavn");
}

// Hjerteslag: setter markørens mtime til `naa`. Kaster (ENOENT) hvis
// markøren er borte, f.eks. fordi økten er slettet.
export function hjerteslag(oktSti, naa = new Date()) {
  const p = path.join(oktSti, OKT_MARKOR);
  const st = lstatSync(p);
  if (!st.isFile()) throw Object.assign(new Error("markøren er ikke en vanlig fil"), { code: "EINVAL" });
  utimesSync(p, naa, naa);
}

// Skriver ferdig-markøren atomisk (temp-fil + rename, så hovedvinduet aldri
// leser en halv fil). `wx` på temp-fila: følger ingen eksisterende lenke.
export function skrivFerdig(oktSti, { tid, workspaceStorage = null }) {
  const tmp = path.join(oktSti, `${FERDIG_MARKOR}.${tilfeldigHex()}.tmp`);
  writeFileSync(tmp, `${JSON.stringify({ tid, workspaceStorage })}\n`, { flag: "wx" });
  renameSync(tmp, path.join(oktSti, FERDIG_MARKOR));
}

// Leser ferdig-markøren. Alt som ikke er en liten, vanlig fil med gyldig
// innhold gir null (behandles som «ikke ferdig», altså den forsiktige veien).
export function lesFerdig(oktSti) {
  const p = path.join(oktSti, FERDIG_MARKOR);
  const st = lstatEllerNull(p);
  if (!st || !st.isFile() || st.size > 64 * 1024) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    if (!Number.isFinite(data?.tid)) return null;
    const ws = typeof data.workspaceStorage === "string" && data.workspaceStorage !== "" ? data.workspaceStorage : null;
    return { tid: data.tid, workspaceStorage: ws };
  } catch {
    return null;
  }
}

// Sti-sjekk før sletting (tilsvarende T6+ for CLI-et). Godtar bare en ekte
// mappe (ikke symlenke) som ligger DIREKTE under roten, har øktnavn og
// inneholder markøren som vanlig fil. Roten selv avvises (navnet passer ikke).
// Roten løses opp med realpath, slik at en symlenket hjemmemappe virker.
export function sjekkOktSti(root, sti) {
  if (typeof sti !== "string" || sti === "") return { ok: false, grunn: "tom_sti" };
  const navn = path.basename(sti);
  if (!erOktNavn(navn)) return { ok: false, grunn: "ikke_oktnavn" };
  const rootReal = realpathEllerNull(root);
  const forelderReal = realpathEllerNull(path.dirname(path.resolve(sti)));
  if (!rootReal || !forelderReal || !sammeSti(rootReal, forelderReal)) return { ok: false, grunn: "utenfor_roten" };
  const st = lstatEllerNull(sti);
  if (!st) return { ok: false, grunn: "finnes_ikke" };
  if (st.isSymbolicLink() || !st.isDirectory()) return { ok: false, grunn: "ikke_mappe" };
  const m = lstatEllerNull(path.join(sti, OKT_MARKOR));
  if (!m || !m.isFile()) return { ok: false, grunn: "mangler_markor" };
  return { ok: true, navn, sti: path.join(rootReal, navn) };
}

// Vakt for mapper ryddingen sletter uten markør: «slettes»-mapper og
// øktnavn-mapper uten markør (rester). Bare en ekte mappe (ikke symlenke)
// direkte under roten med et av de to navnemønstrene.
export function sjekkRestSti(root, sti) {
  const navn = path.basename(sti ?? "");
  if (!erOktNavn(navn) && !slettesOktNavn(navn)) return { ok: false, grunn: "ikke_oktnavn" };
  const rootReal = realpathEllerNull(root);
  const forelderReal = realpathEllerNull(path.dirname(path.resolve(sti)));
  if (!rootReal || !forelderReal || !sammeSti(rootReal, forelderReal)) return { ok: false, grunn: "utenfor_roten" };
  const st = lstatEllerNull(sti);
  if (!st) return { ok: false, grunn: "finnes_ikke" };
  if (st.isSymbolicLink() || !st.isDirectory()) return { ok: false, grunn: "ikke_mappe" };
  return { ok: true, navn, sti: path.join(rootReal, navn) };
}

// Sletter én økt etter sti-sjekken. Mappen får først et «slettes»-navn
// (rename i roten), så slettes den via safeRemove (som i tillegg krever at
// stien ligger strengt inni roten). Går renamen ikke (f.eks. EBUSY på
// Windows), står økten urørt med markøren og prøves igjen. Feiler selve
// slettingen halvveis, står «slettes»-mappen igjen og ryddes neste runde.
// Returnerer { ok, code? }.
export function slettOkt(root, sti, { tilfeldig = tilfeldigHex } = {}) {
  const s = sjekkOktSti(root, sti);
  if (!s.ok) return { ok: false, path: sti, code: s.grunn };
  const til = path.join(path.dirname(s.sti), `${s.navn}.slettes-${tilfeldig()}`);
  try {
    renameSync(s.sti, til);
  } catch (err) {
    return { ok: false, path: s.sti, code: err.code ?? "RENAME" };
  }
  return safeRemove(root, til);
}

// Sletter en «slettes»-mappe eller en rest (øktnavn uten markør) etter sjekkRestSti.
export function slettRest(root, sti) {
  const s = sjekkRestSti(root, sti);
  if (!s.ok) return { ok: false, path: sti, code: s.grunn };
  return safeRemove(root, s.sti);
}

// Tilstanden til en økt, lest fra disken. `hjerteslag` er markørens mtime (ms).
export function lesOkt(root, navn) {
  const sti = path.join(root, navn);
  const s = sjekkOktSti(root, sti);
  if (!s.ok) return { gyldig: false, navn, sti, grunn: s.grunn };
  const m = lstatEllerNull(path.join(sti, OKT_MARKOR));
  if (!m) return { gyldig: false, navn, sti, grunn: "mangler_markor" };
  return { gyldig: true, navn, sti, hjerteslag: m.mtimeMs, ferdig: lesFerdig(sti) };
}

// Er økten avsluttet med «Ferdig», uten hjerteslag etterpå?
function erAvsluttet(t) {
  return t.ferdig !== null && t.ferdig !== undefined && t.hjerteslag <= t.ferdig.tid + TID.TOLERANSE;
}

// DEN FELLES REGELEN, sett fra hovedvinduet (eller neste oppstart):
//   "ugyldig"   - ikke en økt (røres ikke)
//   "avslutter" - «Ferdig» er trykket for under FERDIG_VENT siden (vent)
//   "ferdig"    - «Ferdig» er trykket, og ingen hjerteslag etterpå: slett
//   "aktiv"     - ferskt hjerteslag (≤ UTLOPT, eller i framtiden): slettes aldri
//   "venter"    - gammelt hjerteslag, men hovedvinduet har nettopp startet
//                 eller våknet fra hvilemodus; øktvinduet får tid til å slå
//   "forlatt"   - gammelt hjerteslag, og hovedvinduet har vært våkent lenge
//                 nok: overta og slett
export function vurderOkt(t, { naa, vaakenSiden }) {
  if (!t?.gyldig || !Number.isFinite(t.hjerteslag)) return "ugyldig";
  if (erAvsluttet(t)) return naa - t.ferdig.tid >= TID.FERDIG_VENT ? "ferdig" : "avslutter";
  const alder = naa - t.hjerteslag;
  // Et hjerteslag langt fram i tid kommer ikke fra et levende vindu (det ville
  // slått med dagens klokke innen 5 s); behandles som gammelt.
  if (alder <= TID.UTLOPT && -alder <= TID.FRAMTID_MAKS) return "aktiv";
  if (naa - vaakenSiden < TID.VAAKEN_KRAV) return "venter";
  return "forlatt";
}

// DEN FELLES REGELEN, sett fra et øktvindu som starter (nytt vindu, Reload,
// overgang fra betrodd til ikke betrodd, eller et vindu VS Code gjenoppretter
// etter omstart): fortsett bare hvis økten ikke er avsluttet og hjerteslaget
// er yngre enn GJENOPPTA_MAKS. Ellers er økten slutt («lukkes VS Code, er
// økten slutt»), og vinduet lukker seg uten å slå.
export function kanGjenopptas(t, naa) {
  if (!t?.gyldig || !Number.isFinite(t.hjerteslag)) return false;
  if (erAvsluttet(t)) return false;
  const alder = naa - t.hjerteslag;
  return alder <= TID.GJENOPPTA_MAKS && -alder <= TID.FRAMTID_MAKS;
}

// Klokke i hovedvinduet for å oppdage hvilemodus og tidshopp. `vaakenSiden`
// settes til nå ved start og hver gang et tikk kommer mye for sent (eller
// klokka går baklengs).
export function nyVaktklokke(naa) {
  return { sist: naa, vaakenSiden: naa };
}

export function tikk(klokke, naa) {
  if (naa - klokke.sist > TID.TIKK + TID.HOPP || naa < klokke.sist) klokke.vaakenSiden = naa;
  klokke.sist = naa;
  return klokke;
}

// `<userData>/User/workspaceStorage` utledet fra hovedvinduets
// `context.globalStorageUri`. Den er `<userData>/User/globalStorage/<utvidelse>`
// i standardprofilen og `<userData>/User/profiles/<id>/globalStorage/<utvidelse>`
// i andre profiler, mens workspaceStorage alltid ligger rett under `User/`
// (VS Code 1.100: `workspaceStorageHome = appSettingsHome/workspaceStorage`).
export function workspaceStorageRot(globalStorageSti) {
  let user = path.dirname(path.dirname(globalStorageSti));
  if (path.basename(path.dirname(user)) === "profiles") user = path.dirname(path.dirname(user));
  return path.join(user, "workspaceStorage");
}

const WS_ID_RE = /^[0-9a-f]{32}$/i;

// Leser `workspaceStorage/<id>/` med vakten for T11b: målet må være en ekte
// mappe (ikke symlenke) DIREKTE under `wsRot` (realpath) med et 32-hex
// id-navn, og `workspace.json` må være en liten vanlig fil med en
// `folder`-URI. Gir { ok, mappe (kanonisk sti fra workspace.json), mal } eller
// { ok: false, code }.
function lesWorkspaceStorage(wsRot, mal, platform) {
  if (typeof mal !== "string" || !path.isAbsolute(mal)) return { ok: false, code: "ugyldig_sti" };
  if (!WS_ID_RE.test(path.basename(mal))) return { ok: false, code: "ikke_id" };
  const rotReal = realpathEllerNull(wsRot);
  const forelderReal = realpathEllerNull(path.dirname(mal));
  if (!rotReal || !forelderReal || !sammeSti(rotReal, forelderReal, platform)) return { ok: false, code: "utenfor_roten" };
  const st = lstatEllerNull(mal);
  if (!st) return { ok: false, code: "finnes_ikke" };
  if (st.isSymbolicLink() || !st.isDirectory()) return { ok: false, code: "ikke_mappe" };
  const wj = path.join(mal, "workspace.json");
  const wst = lstatEllerNull(wj);
  if (!wst || !wst.isFile() || wst.size > 64 * 1024) return { ok: false, code: "mangler_workspace_json" };
  let mappe;
  try {
    const folder = JSON.parse(readFileSync(wj, "utf8"))?.folder;
    mappe = fileURLToPath(new URL(folder));
  } catch {
    return { ok: false, code: "ugyldig_workspace_json" };
  }
  return { ok: true, mappe: kanonisk(mappe), rotReal, mal: path.join(rotReal, path.basename(mal)) };
}

// T11b: sletter `workspaceStorage/<id>/` for en avsluttet økt, bare hvis den
// består vakten over og `workspace.json` peker på akkurat denne øktmappen
// (begge sider sammenlignes med realpath på forelderen, så en symlenke over
// roten gir ikke falsk avvisning).
export function slettWorkspaceStorage(wsRot, mal, oktSti, { platform = process.platform } = {}) {
  const w = lesWorkspaceStorage(wsRot, mal, platform);
  if (!w.ok) return w.code === "finnes_ikke" ? { ok: true, code: "finnes_ikke" } : w;
  if (!sammeSti(w.mappe, kanonisk(oktSti), platform)) return { ok: false, code: "annen_mappe" };
  return safeRemove(w.rotReal, w.mal);
}

// T11b for økter som ble borte uten «Ferdig» (krasj, krysset, omstart):
// skanner `workspaceStorage/*/workspace.json` og sletter id-mapper der
// `folder` ligger DIREKTE i øktroten (realpath), har øktnavn, og økten ikke
// finnes lenger (verken som øktmappe eller som rest). Samme vakt som over.
export function ryddWorkspaceStorage(wsRot, root, { platform = process.platform } = {}) {
  const slettet = [];
  const feilet = [];
  const rootReal = realpathEllerNull(root);
  const rotReal = realpathEllerNull(wsRot);
  if (!rootReal || !rotReal) return { slettet, feilet };
  let ider;
  try {
    ider = readdirSync(rotReal).filter((n) => WS_ID_RE.test(n));
  } catch {
    return { slettet, feilet };
  }
  for (const id of ider) {
    const w = lesWorkspaceStorage(wsRot, path.join(rotReal, id), platform);
    if (!w.ok) continue;
    if (!erOktNavn(path.basename(w.mappe))) continue;
    if (!sammeSti(path.dirname(w.mappe), rootReal, platform)) continue;
    if (lstatEllerNull(w.mappe)) continue; // økten (eller en rest med samme navn) finnes: aldri
    const res = safeRemove(w.rotReal, w.mal);
    (res.ok ? slettet : feilet).push({ id, okt: path.basename(w.mappe), code: res.code });
  }
  return { slettet, feilet };
}

// Én runde opprydding fra hovedvinduet. Sletter økter som etter den felles
// regelen er "ferdig" eller "forlatt", pluss workspaceStorage fra
// ferdig-markøren. `holdt` er navn på økter hovedvinduet selv holder liv i.
// Symlenkevakt som startupCleanup i CLI-et: er roten eller ~/canvas-clone en
// symlenke, slettes ingen forlatte økter (bare "ferdig", som er et uttrykkelig
// valg fra læreren med vår egen markør, slik CLI-et alltid sletter sin egen økt).
export function ryddOkter(root, { naa, vaakenSiden, wsRot = null, holdt = new Set() }) {
  const slettet = [];
  const feilet = [];
  const igjen = [];
  let ukjente = 0;
  const rootSymlink = erSymlenke(root) || erSymlenke(path.dirname(root));
  let oppforinger;
  try {
    oppforinger = readdirSync(root);
  } catch {
    return { slettet, feilet, igjen, ukjente, rootSymlink };
  }
  const rydd = (navn, sti, vurdering) => {
    const res = slettRest(root, sti);
    (res.ok ? slettet : feilet).push({ navn, sti: path.join(root, navn), vurdering, code: res.code });
  };
  for (const oppforing of oppforinger) {
    // Halvveis slettet tidligere: prøv igjen (slettingen er allerede bestemt).
    const opprinnelig = slettesOktNavn(oppforing);
    if (opprinnelig) {
      rydd(opprinnelig, path.join(root, oppforing), "slettes");
      continue;
    }
    const navn = oppforing;
    if (!erOktNavn(navn)) {
      ukjente++;
      continue;
    }
    if (holdt.has(navn)) {
      igjen.push({ navn, vurdering: "holdt" });
      continue;
    }
    const t = lesOkt(root, navn);
    // Rest: en ekte øktnavn-mappe uten markør (f.eks. gjenskapt av VS Code
    // fordi en fil ble lagret etter slettingen). Slettes når mappen selv har
    // stått urørt lenger enn UTLOPT og hovedvinduet har vært våkent, aldri
    // under symlenket rot. En økt som akkurat opprettes (markøren skrives
    // millisekunder etter mappen) er ny og røres ikke.
    if (!t.gyldig && t.grunn === "mangler_markor") {
      const st = lstatEllerNull(t.sti);
      const gammel = st && naa - st.mtimeMs > TID.UTLOPT && naa - vaakenSiden >= TID.VAAKEN_KRAV;
      if (gammel && !rootSymlink) rydd(navn, t.sti, "rest");
      else igjen.push({ navn, vurdering: "rest_venter" });
      continue;
    }
    const vurdering = vurderOkt(t, { naa, vaakenSiden });
    if (vurdering === "ugyldig") {
      ukjente++;
      continue;
    }
    const slett = vurdering === "ferdig" || (vurdering === "forlatt" && !rootSymlink);
    if (!slett) {
      igjen.push({ navn, vurdering });
      continue;
    }
    let ws = null;
    if (t.ferdig?.workspaceStorage && wsRot) ws = slettWorkspaceStorage(wsRot, t.ferdig.workspaceStorage, t.sti);
    const res = slettOkt(root, t.sti);
    (res.ok ? slettet : feilet).push({ navn, sti: t.sti, vurdering, code: res.code, workspaceStorage: ws });
  }
  return { slettet, feilet, igjen, ukjente, rootSymlink };
}
