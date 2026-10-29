// Ren logikk for økter i VS Code-utvidelsen (vscode/src/okter.mjs, D4):
// den felles regelen for overtakelse/sletting (B2, T12), sti-sjekken før
// sletting (som T6+), navn, markører og workspaceStorage-vakten (T11b).
// Ingen VS Code; alt skjer i egne tmp-mapper.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  symlinkSync,
  statSync,
  utimesSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  TID,
  OKT_MARKOR,
  FERDIG_MARKOR,
  OKT_INNSTILLINGER,
  vscodeRot,
  erOktNavn,
  oktNavn,
  oktUndermappenavn,
  opprettOkt,
  hjerteslag,
  skrivFerdig,
  lesFerdig,
  sjekkOktSti,
  slettOkt,
  lesOkt,
  vurderOkt,
  kanGjenopptas,
  nyVaktklokke,
  tikk,
  workspaceStorageRot,
  slettWorkspaceStorage,
  ryddWorkspaceStorage,
  ryddOkter,
  slettesOktNavn,
  sjekkRestSti,
  slettRest,
} from "../vscode/src/okter.mjs";
import { chmodSync } from "node:fs";

const erRoot = typeof process.getuid === "function" && process.getuid() === 0;
const lenkeType = process.platform === "win32" ? "junction" : "dir";

function medTmp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-okter-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const settMtime = (oktSti, ms) => utimesSync(path.join(oktSti, OKT_MARKOR), new Date(ms), new Date(ms));

test("vscodeRot: ~/canvas-clone/vscode, egen rot ved siden av grading", () => {
  assert.equal(vscodeRot("/home/x"), path.join("/home/x", "canvas-clone", "vscode"));
});

test("oktNavn/erOktNavn: <YYYYMMDD-HHMMSS>-<8 hex>", () => {
  const navn = oktNavn(new Date(2026, 9, 29, 8, 5, 3), () => "0a1b2c3d");
  assert.equal(navn, "20261029-080503-0a1b2c3d");
  assert.equal(erOktNavn(navn), true);
  assert.equal(erOktNavn(oktNavn()), true);
  for (const feil of ["", ".", "..", "20261029-080503-123", "20261029-080503-0A1B2C3D", "x20261029-080503-0a1b2c3d",
    "20261029-080503-0a1b2c3d/..", "20261029-080503-0a1b2c3dx", null, undefined, 5]) {
    assert.equal(erOktNavn(feil), false, String(feil));
  }
});

test("oktUndermappenavn: aldri punktum først (T9a), ellers som sanitizeFolderName", () => {
  assert.equal(oktUndermappenavn(".vscode"), "_.vscode");
  assert.equal(oktUndermappenavn("..hemmelig"), "_..hemmelig");
  assert.equal(oktUndermappenavn("eier_repo"), "eier_repo");
  assert.equal(oktUndermappenavn("12345"), "12345");
  assert.equal(oktUndermappenavn("."), "_");
});

test("opprettOkt: markør, bare settings.json i .vscode, .gitignore i ~/canvas-clone", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const okt = opprettOkt(root);
    assert.equal(erOktNavn(okt.navn), true);
    assert.equal(okt.sti, path.join(root, okt.navn));
    assert.deepEqual(readdirSync(okt.sti).sort(), [OKT_MARKOR, ".vscode"].sort());
    assert.deepEqual(readdirSync(path.join(okt.sti, ".vscode")), ["settings.json"]);
    const innst = JSON.parse(readFileSync(path.join(okt.sti, ".vscode", "settings.json"), "utf8"));
    assert.equal(innst["workbench.localHistory.enabled"], false);
    assert.deepEqual(innst, JSON.parse(JSON.stringify(OKT_INNSTILLINGER)));
    assert.equal(readFileSync(path.join(home, "canvas-clone", ".gitignore"), "utf8"), "*\n");
    // Ferskt hjerteslag med en gang.
    assert.equal(vurderOkt(lesOkt(root, okt.navn), { naa: Date.now(), vaakenSiden: 0 }), "aktiv");
  }));

test("opprettOkt: et navn som finnes, brukes aldri om igjen", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const now = new Date(2026, 9, 29, 8, 0, 0);
    const a = opprettOkt(root, { now, tilfeldig: () => "aaaaaaaa" });
    writeFileSync(path.join(a.sti, "elevfil"), "x");
    const serie = ["aaaaaaaa", "bbbbbbbb"];
    const b = opprettOkt(root, { now, tilfeldig: () => serie.shift() });
    assert.equal(b.navn, "20261029-080000-bbbbbbbb");
    assert.equal(existsSync(path.join(a.sti, "elevfil")), true, "den gamle økten er urørt");
    assert.throws(() => opprettOkt(root, { now, tilfeldig: () => "aaaaaaaa" }), /ledig/);
  }));

test("hjerteslag setter markørens mtime; kaster når økten er slettet", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const okt = opprettOkt(root);
    settMtime(okt.sti, 1_000_000);
    const naa = new Date(2_000_000_000_000);
    hjerteslag(okt.sti, naa);
    assert.equal(Math.round(statSync(path.join(okt.sti, OKT_MARKOR)).mtimeMs), naa.getTime());
    assert.throws(() => hjerteslag(path.join(root, "20261029-080000-00000000")), { code: "ENOENT" });
  }));

test("skrivFerdig/lesFerdig: atomisk, overskriver, ugyldig innhold gir null", () =>
  medTmp((home) => {
    const okt = opprettOkt(vscodeRot(home));
    assert.equal(lesFerdig(okt.sti), null);
    skrivFerdig(okt.sti, { tid: 123, workspaceStorage: "/x/workspaceStorage/abc" });
    assert.deepEqual(lesFerdig(okt.sti), { tid: 123, workspaceStorage: "/x/workspaceStorage/abc" });
    skrivFerdig(okt.sti, { tid: 456 });
    assert.deepEqual(lesFerdig(okt.sti), { tid: 456, workspaceStorage: null });
    assert.equal(readdirSync(okt.sti).some((f) => f.endsWith(".tmp")), false, "ingen temp-filer igjen");
    writeFileSync(path.join(okt.sti, FERDIG_MARKOR), "{ halv");
    assert.equal(lesFerdig(okt.sti), null);
    writeFileSync(path.join(okt.sti, FERDIG_MARKOR), JSON.stringify({ tid: "nå" }));
    assert.equal(lesFerdig(okt.sti), null);
  }));

// --- Den felles regelen -----------------------------------------------------

const T0 = 1_800_000_000_000;
const okt = (hjerteslag, ferdig = null) => ({ gyldig: true, hjerteslag, ferdig });
const lengeVaaken = T0 - 10 * TID.VAAKEN_KRAV;

test("tidene henger sammen: fortsett-terskelen er godt under slette-terskelen", () => {
  assert.ok(TID.GJENOPPTA_MAKS < TID.UTLOPT);
  assert.ok(TID.VAAKEN_KRAV >= 3 * TID.HJERTESLAG);
  assert.ok(TID.FERDIG_VENT > TID.GJENOPPLIV + TID.TOLERANSE);
  assert.ok(TID.HOLD >= TID.HJERTESLAG);
  assert.ok(TID.FRAMTID_MAKS > TID.UTLOPT);
});

test("vurderOkt: ferskt hjerteslag slettes aldri, uansett hvor lenge hovedvinduet har vært våkent", () => {
  for (const alder of [0, 1, TID.HJERTESLAG, TID.GJENOPPTA_MAKS, TID.UTLOPT]) {
    assert.equal(vurderOkt(okt(T0 - alder), { naa: T0, vaakenSiden: lengeVaaken }), "aktiv", `alder ${alder}`);
  }
  // Hjerteslag i framtiden (klokka er stilt tilbake): forsiktig, ikke slett.
  assert.equal(vurderOkt(okt(T0 + 3_600_000), { naa: T0, vaakenSiden: lengeVaaken }), "aktiv");
});

test("vurderOkt: gammelt hjerteslag er «forlatt» bare når hovedvinduet har vært våkent lenge nok (hvilemodus, B2)", () => {
  const gammel = okt(T0 - TID.UTLOPT - 1);
  assert.equal(vurderOkt(gammel, { naa: T0, vaakenSiden: T0 }), "venter", "nettopp startet/våknet");
  assert.equal(vurderOkt(gammel, { naa: T0, vaakenSiden: T0 - TID.VAAKEN_KRAV + 1 }), "venter");
  assert.equal(vurderOkt(gammel, { naa: T0, vaakenSiden: T0 - TID.VAAKEN_KRAV }), "forlatt");
  assert.equal(vurderOkt(okt(T0 - 3 * 86_400_000), { naa: T0, vaakenSiden: lengeVaaken }), "forlatt");
});

test("vurderOkt: «Ferdig» uten hjerteslag etterpå slettes etter FERDIG_VENT, også med ferskt hjerteslag før", () => {
  const tid = T0 - 1_000;
  const t = okt(tid - 500, { tid, workspaceStorage: null });
  assert.equal(vurderOkt(t, { naa: tid + TID.FERDIG_VENT - 1, vaakenSiden: T0 }), "avslutter");
  assert.equal(vurderOkt(t, { naa: tid + TID.FERDIG_VENT, vaakenSiden: T0 }), "ferdig", "venter ikke på våkenkravet");
  // mtime rundet opp inntil TOLERANSE regnes fortsatt som før «Ferdig».
  assert.equal(vurderOkt(okt(tid + TID.TOLERANSE, { tid }), { naa: tid + TID.FERDIG_VENT, vaakenSiden: 0 }), "ferdig");
});

test("vurderOkt: hjerteslag etter «Ferdig» (vinduet ble ikke lukket) opphever markøren", () => {
  const tid = T0 - 20_000;
  const gjenopplivet = okt(tid + TID.GJENOPPLIV + 10, { tid });
  assert.equal(vurderOkt(gjenopplivet, { naa: T0, vaakenSiden: lengeVaaken }), "aktiv");
  assert.equal(kanGjenopptas(gjenopplivet, T0), true);
});

test("vurderOkt: ugyldig tilstand røres ikke", () => {
  assert.equal(vurderOkt({ gyldig: false }, { naa: T0, vaakenSiden: 0 }), "ugyldig");
  assert.equal(vurderOkt(null, { naa: T0, vaakenSiden: 0 }), "ugyldig");
  assert.equal(vurderOkt(okt(NaN), { naa: T0, vaakenSiden: 0 }), "ugyldig");
});

test("kanGjenopptas: Reload fortsetter, gammel/avsluttet økt (omstart av VS Code) fortsetter ikke", () => {
  assert.equal(kanGjenopptas(okt(T0 - 2_000), T0), true, "Reload Window");
  assert.equal(kanGjenopptas(okt(T0 - TID.GJENOPPTA_MAKS), T0), true);
  assert.equal(kanGjenopptas(okt(T0 - TID.GJENOPPTA_MAKS - 1), T0), false);
  assert.equal(kanGjenopptas(okt(T0 - 2_000, { tid: T0 - 1_000 }), T0), false, "etter «Ferdig»");
  assert.equal(kanGjenopptas({ gyldig: false }, T0), false);
});

test("felles regel: et vindu som får fortsette, kan aldri samtidig bli slettet (B2)", () => {
  const vaaken = [T0, T0 - TID.VAAKEN_KRAV, lengeVaaken];
  const ferdigTider = [null, T0 - 100_000, T0 - 5_000, T0 - 1_000, T0];
  const aldre = [];
  for (let a = -10_000; a <= 3 * TID.UTLOPT; a += 1_000) aldre.push(a);
  aldre.push(-TID.FRAMTID_MAKS, -TID.FRAMTID_MAKS - 1, -10 * TID.FRAMTID_MAKS);
  for (const alder of aldre) {
    for (const ft of ferdigTider) {
      const t = okt(T0 - alder, ft === null ? null : { tid: ft });
      if (!kanGjenopptas(t, T0)) continue;
      for (const v of vaaken) {
        const res = vurderOkt(t, { naa: T0, vaakenSiden: v });
        assert.ok(!["ferdig", "forlatt"].includes(res), `alder ${alder}, ferdig ${ft}, våken ${v}: ${res}`);
      }
    }
  }
});

test("tikk: hvilemodus og klokke som går baklengs flytter vaakenSiden", () => {
  const k = nyVaktklokke(T0);
  assert.equal(k.vaakenSiden, T0);
  tikk(k, T0 + TID.TIKK);
  tikk(k, T0 + 2 * TID.TIKK);
  assert.equal(k.vaakenSiden, T0);
  const etterSovn = T0 + 2 * TID.TIKK + 3_600_000;
  tikk(k, etterSovn);
  assert.equal(k.vaakenSiden, etterSovn);
  tikk(k, etterSovn - 60_000);
  assert.equal(k.vaakenSiden, etterSovn - 60_000);
});

// --- Sti-sjekk og sletting ----------------------------------------------------

test("sjekkOktSti: godtar bare ekte øktmapper direkte under roten med markør", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const okt = opprettOkt(root);
    assert.deepEqual(sjekkOktSti(root, okt.sti), { ok: true, navn: okt.navn, sti: okt.sti });

    assert.equal(sjekkOktSti(root, root).grunn, "ikke_oktnavn", "roten selv");
    assert.equal(sjekkOktSti(root, "").grunn, "tom_sti");
    assert.equal(sjekkOktSti(root, path.join(root, "20261029-080000-00000000")).grunn, "finnes_ikke");

    const utenMarkor = path.join(root, "20261029-080000-11111111");
    mkdirSync(utenMarkor);
    assert.equal(sjekkOktSti(root, utenMarkor).grunn, "mangler_markor");

    const markorSomMappe = path.join(root, "20261029-080000-22222222");
    mkdirSync(path.join(markorSomMappe, OKT_MARKOR), { recursive: true });
    assert.equal(sjekkOktSti(root, markorSomMappe).grunn, "mangler_markor");

    const fil = path.join(root, "20261029-080000-33333333");
    writeFileSync(fil, "x");
    assert.equal(sjekkOktSti(root, fil).grunn, "ikke_mappe");

    // Symlenke med øktnavn som peker på en ekte økt et annet sted.
    const annenRot = vscodeRot(path.join(home, "annen"));
    const fremmed = opprettOkt(annenRot);
    const lenke = path.join(root, "20261029-080000-44444444");
    symlinkSync(fremmed.sti, lenke, lenkeType);
    assert.equal(sjekkOktSti(root, lenke).grunn, "ikke_mappe");

    // Økt i en annen rot, og nestet under en økt.
    assert.equal(sjekkOktSti(root, fremmed.sti).grunn, "utenfor_roten");
    const nestet = path.join(okt.sti, "20261029-080000-55555555");
    mkdirSync(nestet);
    writeFileSync(path.join(nestet, OKT_MARKOR), "");
    assert.equal(sjekkOktSti(root, nestet).grunn, "utenfor_roten");
    assert.equal(sjekkOktSti(root, path.join(root, "..", "vscode", okt.navn)).ok, true, "normaliseres");
  }));

test("slettOkt: sletter en gyldig økt, nekter symlenker og stier utenfor (målet urørt)", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const okt = opprettOkt(root);
    writeFileSync(path.join(okt.sti, "elev.txt"), "x");

    const utenfor = path.join(home, "viktig");
    mkdirSync(utenfor);
    writeFileSync(path.join(utenfor, OKT_MARKOR), "");
    writeFileSync(path.join(utenfor, "data"), "behold");
    const lenke = path.join(root, "20261029-080000-66666666");
    symlinkSync(utenfor, lenke, lenkeType);

    assert.equal(slettOkt(root, lenke).ok, false);
    assert.equal(existsSync(lenke), true);
    assert.equal(readFileSync(path.join(utenfor, "data"), "utf8"), "behold");
    assert.equal(slettOkt(root, utenfor).ok, false);
    assert.equal(slettOkt(root, root).ok, false);
    assert.equal(existsSync(root), true);

    assert.equal(slettOkt(root, okt.sti).ok, true);
    assert.equal(existsSync(okt.sti), false);
  }));

// --- workspaceStorage (T11b) -------------------------------------------------

function lagWs(wsRot, id, folder) {
  const dir = path.join(wsRot, id);
  mkdirSync(dir, { recursive: true });
  if (folder !== undefined) writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ folder }));
  writeFileSync(path.join(dir, "state.vscdb"), "x");
  return dir;
}

const ID = "0123456789abcdef0123456789abcdef";

test("workspaceStorageRot: utledes fra globalStorageUri", () => {
  assert.equal(
    workspaceStorageRot(path.join("/u", "User", "globalStorage", "krola1.canvas-clone-vscode")),
    path.join("/u", "User", "workspaceStorage"),
  );
});

test("slettWorkspaceStorage: sletter bare id-mappen som peker på akkurat denne økten", () =>
  medTmp((dir) => {
    const wsRot = path.join(dir, "User", "workspaceStorage");
    const okt = opprettOkt(vscodeRot(dir));
    const url = pathToFileURL(okt.sti).href;

    const annen = lagWs(wsRot, "f".repeat(32), pathToFileURL(path.join(dir, "prosjekt")).href);
    assert.equal(slettWorkspaceStorage(wsRot, annen, okt.sti).code, "annen_mappe");
    assert.equal(existsSync(annen), true);

    const ikkeId = lagWs(wsRot, "ikke-en-id", url);
    assert.equal(slettWorkspaceStorage(wsRot, ikkeId, okt.sti).code, "ikke_id");

    const utenJson = lagWs(wsRot, "e".repeat(32));
    assert.equal(slettWorkspaceStorage(wsRot, utenJson, okt.sti).code, "mangler_workspace_json");

    const utenfor = lagWs(path.join(dir, "annet"), ID, url);
    assert.equal(slettWorkspaceStorage(wsRot, utenfor, okt.sti).code, "utenfor_roten");
    assert.equal(slettWorkspaceStorage(wsRot, "relativ/sti", okt.sti).code, "ugyldig_sti");

    const lenkeMal = lagWs(path.join(dir, "lenkemal"), ID, url);
    const lenke = path.join(wsRot, "d".repeat(32));
    symlinkSync(lenkeMal, lenke, lenkeType);
    assert.equal(slettWorkspaceStorage(wsRot, lenke, okt.sti).code, "ikke_mappe");
    assert.equal(existsSync(path.join(lenkeMal, "state.vscdb")), true);

    const riktig = lagWs(wsRot, ID, url);
    assert.equal(slettWorkspaceStorage(wsRot, riktig, okt.sti).ok, true);
    assert.equal(existsSync(riktig), false);
    assert.equal(existsSync(annen), true);
    assert.equal(slettWorkspaceStorage(wsRot, riktig, okt.sti).code, "finnes_ikke");
  }));

// --- ryddOkter -----------------------------------------------------------------

test("ryddOkter: sletter ferdige og forlatte økter, lar ferske, holdte og ukjente være", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const wsRot = path.join(home, "User", "workspaceStorage");
    const naa = Date.now();
    const lag = (alder) => {
      const o = opprettOkt(root);
      writeFileSync(path.join(o.sti, "elev.txt"), "x");
      settMtime(o.sti, naa - alder);
      return o;
    };
    const fersk = lag(1_000);
    const forlatt = lag(TID.UTLOPT + 60_000);
    const holdt = lag(TID.UTLOPT + 60_000);
    const ferdig = lag(20_000);
    const wsDir = lagWs(wsRot, ID, pathToFileURL(ferdig.sti).href);
    skrivFerdig(ferdig.sti, { tid: naa - 10_000, workspaceStorage: wsDir });
    const nettoppFerdig = lag(2_000);
    skrivFerdig(nettoppFerdig.sti, { tid: naa - 1_000 });
    mkdirSync(path.join(root, "noe-annet"));
    writeFileSync(path.join(root, "notat.txt"), "x");
    const utenfor = path.join(home, "utenfor");
    mkdirSync(utenfor);
    writeFileSync(path.join(utenfor, OKT_MARKOR), "");
    utimesSync(path.join(utenfor, OKT_MARKOR), new Date(0), new Date(0));
    symlinkSync(utenfor, path.join(root, "20200101-000000-77777777"), lenkeType);

    const r = ryddOkter(root, { naa, vaakenSiden: naa - TID.VAAKEN_KRAV, wsRot, holdt: new Set([holdt.navn]) });
    assert.deepEqual(r.slettet.map((s) => s.navn).sort(), [ferdig.navn, forlatt.navn].sort());
    assert.equal(r.slettet.find((s) => s.navn === ferdig.navn).workspaceStorage.ok, true);
    assert.equal(existsSync(wsDir), false);
    for (const o of [fersk, holdt, nettoppFerdig]) assert.equal(existsSync(o.sti), true);
    assert.equal(existsSync(path.join(root, "noe-annet")), true);
    assert.equal(existsSync(path.join(root, "notat.txt")), true);
    assert.equal(existsSync(path.join(utenfor, OKT_MARKOR)), true);
    assert.equal(r.ukjente, 3);
    assert.equal(r.rootSymlink, false);

    // Rett etter oppstart/hvilemodus: forlatte venter.
    const forlatt2 = lag(TID.UTLOPT + 60_000);
    const r2 = ryddOkter(root, { naa, vaakenSiden: naa, wsRot });
    assert.deepEqual(r2.slettet, []);
    assert.equal(r2.igjen.find((o) => o.navn === forlatt2.navn).vurdering, "venter");
  }));

test("ryddOkter: symlenket rot sletter bare ferdige økter, ikke forlatte (som startupCleanup)", () =>
  medTmp((dir) => {
    const ekteBase = path.join(dir, "disk", "canvas-clone");
    const home = path.join(dir, "home");
    mkdirSync(ekteBase, { recursive: true });
    mkdirSync(home);
    symlinkSync(ekteBase, path.join(home, "canvas-clone"), lenkeType);
    const root = vscodeRot(home);
    const naa = Date.now();
    const forlatt = opprettOkt(root);
    settMtime(forlatt.sti, naa - TID.UTLOPT - 60_000);
    const ferdig = opprettOkt(root);
    settMtime(ferdig.sti, naa - 20_000);
    skrivFerdig(ferdig.sti, { tid: naa - 10_000 });

    const r = ryddOkter(root, { naa, vaakenSiden: 0 });
    assert.equal(r.rootSymlink, true);
    assert.deepEqual(r.slettet.map((s) => s.navn), [ferdig.navn]);
    assert.equal(existsSync(forlatt.sti), true);
    assert.equal(r.igjen[0].vurdering, "forlatt");
  }));

test("ryddOkter: manglende rot gir tomt resultat", () =>
  medTmp((home) => {
    const r = ryddOkter(vscodeRot(home), { naa: Date.now(), vaakenSiden: 0 });
    assert.deepEqual(r, { slettet: [], feilet: [], igjen: [], ukjente: 0, rootSymlink: false });
  }));

// --- D4-rettingsrunden -----------------------------------------------------------

test("hjerteslag langt fram i tid regnes som gammelt (tak), men innenfor taket er det aktivt", () => {
  const t = okt(T0 + TID.FRAMTID_MAKS + 1);
  assert.equal(vurderOkt(t, { naa: T0, vaakenSiden: T0 }), "venter");
  assert.equal(vurderOkt(t, { naa: T0, vaakenSiden: lengeVaaken }), "forlatt");
  assert.equal(kanGjenopptas(t, T0), false);
  assert.equal(vurderOkt(okt(T0 + TID.FRAMTID_MAKS), { naa: T0, vaakenSiden: lengeVaaken }), "aktiv");
  assert.equal(kanGjenopptas(okt(T0 + 3_600_000), T0), true);
});

test("workspaceStorageRot: også for en annen profil enn standard", () => {
  assert.equal(
    workspaceStorageRot(path.join("/u", "User", "profiles", "-7a1b2c3", "globalStorage", "krola1.canvas-clone-vscode")),
    path.join("/u", "User", "workspaceStorage"),
  );
});

test("slettesOktNavn/sjekkRestSti: kjenner igjen «slettes»-navn og rester, nekter symlenker og stier utenfor", () =>
  medTmp((home) => {
    assert.equal(slettesOktNavn("20261029-080000-aaaaaaaa.slettes-0123abcd"), "20261029-080000-aaaaaaaa");
    for (const n of ["20261029-080000-aaaaaaaa", "x.slettes-0123abcd", "20261029-080000-aaaaaaaa.slettes-", null]) {
      assert.equal(slettesOktNavn(n), null, String(n));
    }
    assert.equal(erOktNavn("20261029-080000-aaaaaaaa.slettes-0123abcd"), false);
    const root = vscodeRot(home);
    mkdirSync(root, { recursive: true });
    const utenfor = path.join(home, "utenfor");
    mkdirSync(utenfor);
    writeFileSync(path.join(utenfor, "data"), "behold");
    const lenke = path.join(root, "20261029-080000-aaaaaaaa.slettes-0123abcd");
    symlinkSync(utenfor, lenke, lenkeType);
    assert.equal(sjekkRestSti(root, lenke).grunn, "ikke_mappe");
    assert.equal(slettRest(root, lenke).ok, false);
    assert.equal(readFileSync(path.join(utenfor, "data"), "utf8"), "behold");
    assert.equal(sjekkRestSti(root, root).grunn, "ikke_oktnavn");
    assert.equal(sjekkRestSti(root, path.join(home, "20261029-080000-bbbbbbbb")).grunn, "utenfor_roten");
  }));

test("slettOkt: får først et «slettes»-navn; feiler renamen, står økten urørt med markør", { skip: erRoot || process.platform === "win32" }, () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const a = opprettOkt(root);
    assert.equal(slettOkt(root, a.sti, { tilfeldig: () => "0123abcd" }).ok, true);
    assert.deepEqual(readdirSync(root), []);

    const b = opprettOkt(root);
    chmodSync(root, 0o555);
    try {
      const r = slettOkt(root, b.sti);
      assert.equal(r.ok, false);
      assert.equal(r.code, "EACCES");
    } finally {
      chmodSync(root, 0o755);
    }
    assert.equal(sjekkOktSti(root, b.sti).ok, true, "økten er urørt og prøves igjen");
  }));

test("delvis sletting: «slettes»-mappen ryddes neste runde, også uten regel", { skip: erRoot || process.platform === "win32" }, () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const naa = Date.now();
    const o = opprettOkt(root);
    const laast = path.join(o.sti, "repo", "laast");
    mkdirSync(laast, { recursive: true });
    writeFileSync(path.join(laast, "fil"), "x");
    skrivFerdig(o.sti, { tid: naa - 10_000 });
    settMtime(o.sti, naa - 20_000);
    chmodSync(laast, 0o555);
    let r1;
    try {
      r1 = ryddOkter(root, { naa, vaakenSiden: naa });
    } finally {
      // Mappen har fått nytt navn; lås opp der den ligger nå.
      for (const n of readdirSync(root)) {
        const p = path.join(root, n, "repo", "laast");
        if (existsSync(p)) chmodSync(p, 0o755);
      }
    }
    assert.equal(r1.feilet.length, 1);
    assert.equal(r1.feilet[0].navn, o.navn, "telleren nøkles på øktnavnet");
    const rest = readdirSync(root);
    assert.equal(rest.length, 1);
    assert.equal(slettesOktNavn(rest[0]), o.navn);
    // Markøren er borte, men «slettes»-navnet holder.
    const r2 = ryddOkter(root, { naa, vaakenSiden: naa });
    assert.deepEqual(r2.slettet.map((s) => [s.navn, s.vurdering]), [[o.navn, "slettes"]]);
    assert.deepEqual(readdirSync(root), []);
  }));

test("rest: øktnavn-mappe uten markør (f.eks. gjenskapt av VS Code etter lagring) ryddes når den er gammel", () =>
  medTmp((home) => {
    const root = vscodeRot(home);
    const naa = Date.now();
    const o = opprettOkt(root);
    slettOkt(root, o.sti);
    // VS Code lagrer en fil etter slettingen: mappen dukker opp igjen uten markør.
    mkdirSync(path.join(o.sti, "repo"), { recursive: true });
    writeFileSync(path.join(o.sti, "repo", "fil.js"), "x");
    let r = ryddOkter(root, { naa, vaakenSiden: naa - TID.VAAKEN_KRAV });
    assert.equal(r.igjen.find((x) => x.navn === o.navn).vurdering, "rest_venter", "ny mappe: kan være under oppretting");
    const gammel = new Date(naa - TID.UTLOPT - 1_000);
    utimesSync(o.sti, gammel, gammel);
    r = ryddOkter(root, { naa, vaakenSiden: naa });
    assert.equal(r.igjen.find((x) => x.navn === o.navn).vurdering, "rest_venter", "hovedvinduet har nettopp våknet");
    r = ryddOkter(root, { naa, vaakenSiden: naa - TID.VAAKEN_KRAV });
    assert.deepEqual(r.slettet.map((s) => [s.navn, s.vurdering]), [[o.navn, "rest"]]);
    assert.equal(existsSync(o.sti), false);
  }));

test("rest: røres ikke under symlenket rot", () =>
  medTmp((dir) => {
    const ekteBase = path.join(dir, "disk", "canvas-clone");
    const home = path.join(dir, "home");
    mkdirSync(path.join(ekteBase, "vscode"), { recursive: true });
    mkdirSync(home);
    symlinkSync(ekteBase, path.join(home, "canvas-clone"), lenkeType);
    const root = vscodeRot(home);
    const rest = path.join(root, "20261029-080000-cccccccc");
    mkdirSync(rest);
    const gammel = new Date(Date.now() - TID.UTLOPT - 60_000);
    utimesSync(rest, gammel, gammel);
    const r = ryddOkter(root, { naa: Date.now(), vaakenSiden: 0 });
    assert.equal(existsSync(rest), true);
    assert.equal(r.igjen[0].vurdering, "rest_venter");
  }));

test("ryddWorkspaceStorage: sletter id-mapper for økter som er borte, aldri for økter som finnes eller andre mapper", () =>
  medTmp((dir) => {
    const root = vscodeRot(dir);
    const wsRot = path.join(dir, "User", "workspaceStorage");
    const finnes = opprettOkt(root);
    const borte = opprettOkt(root);
    slettOkt(root, borte.sti);
    const url = (p) => pathToFileURL(p).href;
    const wsBorte = lagWs(wsRot, "1".repeat(32), url(borte.sti));
    const wsFinnes = lagWs(wsRot, "2".repeat(32), url(finnes.sti));
    const wsRoten = lagWs(wsRot, "3".repeat(32), url(root));
    const wsDypere = lagWs(wsRot, "4".repeat(32), url(path.join(finnes.sti, "20261029-080000-dddddddd")));
    const wsAnnet = lagWs(wsRot, "5".repeat(32), url(path.join(dir, "prosjekt", "20261029-080000-eeeeeeee")));
    const wsIkkeId = lagWs(wsRot, "ikke-id", url(path.join(root, "20261029-080000-ffffffff")));
    // Rest med samme navn som en økt: røres ikke før resten er borte.
    const rest = path.join(root, "20261029-080000-abababab");
    mkdirSync(rest);
    const wsRest = lagWs(wsRot, "6".repeat(32), url(rest));

    const r = ryddWorkspaceStorage(wsRot, root);
    assert.deepEqual(r.slettet.map((s) => s.id), ["1".repeat(32)]);
    assert.equal(existsSync(wsBorte), false);
    for (const d of [wsFinnes, wsRoten, wsDypere, wsAnnet, wsIkkeId, wsRest]) assert.equal(existsSync(d), true, d);
    assert.deepEqual(ryddWorkspaceStorage(path.join(dir, "finnes-ikke"), root), { slettet: [], feilet: [] });
  }));

test("T11b med symlenke over roten: workspace.json med ekte sti godtas, både ved «Ferdig» og ved skanning", () =>
  medTmp((dir) => {
    const ekteBase = path.join(dir, "disk", "canvas-clone");
    const home = path.join(dir, "home");
    mkdirSync(ekteBase, { recursive: true });
    mkdirSync(home);
    symlinkSync(ekteBase, path.join(home, "canvas-clone"), lenkeType);
    const root = vscodeRot(home);
    const wsRot = path.join(dir, "User", "workspaceStorage");
    const naa = Date.now();
    const o = opprettOkt(root);
    const ekteOkt = path.join(ekteBase, "vscode", o.navn);
    const ws = lagWs(wsRot, ID, pathToFileURL(ekteOkt).href);
    skrivFerdig(o.sti, { tid: naa - 10_000, workspaceStorage: ws });
    settMtime(o.sti, naa - 20_000);
    const r = ryddOkter(root, { naa, vaakenSiden: naa, wsRot });
    assert.equal(r.slettet[0].workspaceStorage.ok, true);
    assert.equal(existsSync(ws), false);

    const borte = opprettOkt(root);
    slettOkt(root, borte.sti);
    const ws2 = lagWs(wsRot, "7".repeat(32), pathToFileURL(path.join(ekteBase, "vscode", borte.navn)).href);
    const ws3 = lagWs(wsRot, "8".repeat(32), pathToFileURL(path.join(root, "20261029-080000-12121212")).href);
    assert.deepEqual(ryddWorkspaceStorage(wsRot, root).slettet.map((s) => s.id).sort(), ["7".repeat(32), "8".repeat(32)]);
    assert.equal(existsSync(ws2) || existsSync(ws3), false);
  }));
