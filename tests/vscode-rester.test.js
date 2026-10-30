// T12 i VS Code-utvidelsen (vscode/src/rester.mjs, D5): «vis hva som ble
// liggende» og «slett alle nå» for begge røttene. vscode/ følger D4-regelen
// (kartleggOkter, samme som ryddOkter), grading/ samme regel som
// startupCleanup, og slettes med startupCleanup uendret. Egne tmp-mapper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { safeRemove } from "../src/storage.js";
import path from "node:path";
import { TID, OKT_MARKOR, FERDIG_MARKOR, kartleggOkter, ryddOkter } from "../vscode/src/okter.mjs";
import { kartleggVscode, kartleggGrading, antallSomSlettes, slettGrading, iSandkasse } from "../vscode/src/rester.mjs";

const NAA = 1_800_000_000_000;
// Prosjektregelen: all sletting via safeRemove, også i testene (tmp-mappene ligger i tmpdir()).
const fjern = (p) => assert.ok(safeRemove(tmpdir(), p).ok, `kunne ikke slette ${p}`);
const tmp = () => mkdtempSync(path.join(tmpdir(), "cc-rester-"));

function okt(root, navn, { alder, ferdigFor = null }) {
  const sti = path.join(root, navn);
  mkdirSync(sti, { recursive: true });
  writeFileSync(path.join(sti, "elev.txt"), "falsk\n");
  writeFileSync(path.join(sti, OKT_MARKOR), "{}\n");
  if (ferdigFor !== null) writeFileSync(path.join(sti, FERDIG_MARKOR), JSON.stringify({ tid: NAA - ferdigFor }));
  const t = new Date(NAA - alder);
  utimesSync(path.join(sti, OKT_MARKOR), t, t);
  return sti;
}

function rest(root, navn, alder) {
  const sti = path.join(root, navn);
  mkdirSync(sti, { recursive: true });
  const t = new Date(NAA - alder);
  utimesSync(sti, t, t);
  return sti;
}

function lagVscodeRot(base) {
  const root = path.join(base, "canvas-clone", "vscode");
  mkdirSync(root, { recursive: true });
  okt(root, "20261030-100000-0000000a", { alder: 2_000 }); // åpen
  okt(root, "20261030-100000-0000000b", { alder: 100_000 }); // lukket nylig
  okt(root, "20261030-100000-0000000c", { alder: 400_000 }); // forlatt
  okt(root, "20261030-100000-0000000d", { alder: 20_000, ferdigFor: 10_000 }); // ferdig
  okt(root, "20261030-100000-0000000e", { alder: 400_000 }); // holdt
  rest(root, "20261030-100000-0000000f", 1_000); // ny rest
  rest(root, "20261030-100000-00000010", 400_000); // gammel rest
  mkdirSync(path.join(root, "20261030-100000-00000011.slettes-abcdef01")); // halvveis slettet
  writeFileSync(path.join(root, "notat.txt"), "ikke vår\n");
  return root;
}

const opts = { naa: NAA, vaakenSiden: NAA - 60_000, holdt: new Set(["20261030-100000-0000000e"]) };

test("vscode-roten: status per økt etter D4-regelen; et ferskt hjerteslag er «åpen» og slettes aldri", () => {
  const base = tmp();
  try {
    const root = lagVscodeRot(base);
    const k = kartleggVscode(root, opts);
    assert.deepEqual(Object.fromEntries(k.okter.map((o) => [o.navn, o.status])), {
      "20261030-100000-0000000a": "apen",
      "20261030-100000-0000000b": "lukket",
      "20261030-100000-0000000c": "slettes",
      "20261030-100000-0000000d": "slettes",
      "20261030-100000-0000000e": "holdt",
      "20261030-100000-0000000f": "rest",
      "20261030-100000-00000010": "slettes",
      "20261030-100000-00000011": "slettes",
    });
    assert.equal(k.ukjente, 1);
    assert.equal(antallSomSlettes(k), 4);
    // Rett etter oppvåkning: forlatte økter og gamle rester venter.
    const vaaken = kartleggVscode(root, { ...opts, vaakenSiden: NAA - 1_000 });
    assert.equal(vaaken.okter.find((o) => o.navn === "20261030-100000-0000000c").status, "venter");
    assert.equal(vaaken.okter.find((o) => o.navn === "20261030-100000-00000010").status, "rest");
  } finally {
    fjern(base);
  }
});

test("kartleggOkter og ryddOkter er enige: det som kartlegges som «slettes», er nøyaktig det som slettes", () => {
  const base = tmp();
  try {
    const root = lagVscodeRot(base);
    const plan = kartleggOkter(root, opts).oppforinger.filter((o) => o.handling).map((o) => o.navn).sort();
    const r = ryddOkter(root, opts);
    assert.deepEqual(r.slettet.map((s) => s.navn).sort(), plan);
    assert.deepEqual(r.feilet, []);
    for (const n of ["0000000a", "0000000b", "0000000e", "0000000f"]) assert.ok(existsSync(path.join(root, `20261030-100000-${n}`)), n);
    assert.ok(existsSync(path.join(root, "notat.txt")));
    // Etterpå: ingenting mer å slette.
    assert.equal(antallSomSlettes(kartleggVscode(root, opts)), 0);
  } finally {
    fjern(base);
  }
});

test("vscode-roten under symlenke: forlatte økter og rester beholdes og merkes, ferdige slettes", { skip: process.platform === "win32" }, () => {
  const base = tmp();
  try {
    const ekte = lagVscodeRot(base);
    const lenkeBase = path.join(base, "lenke", "canvas-clone");
    mkdirSync(lenkeBase, { recursive: true });
    const root = path.join(lenkeBase, "vscode");
    symlinkSync(ekte, root, "dir");
    const k = kartleggVscode(root, opts);
    assert.equal(k.rootSymlink, true);
    const s = Object.fromEntries(k.okter.map((o) => [o.navn, o.status]));
    assert.equal(s["20261030-100000-0000000c"], "symlenke");
    assert.equal(s["20261030-100000-00000010"], "symlenke");
    assert.equal(s["20261030-100000-0000000d"], "slettes");
  } finally {
    fjern(base);
  }
});

test("grading-roten: død PID slettes, levende PID er i bruk, ukjente telles; slettGrading = startupCleanup uendret", () => {
  const base = tmp();
  try {
    const root = path.join(base, "canvas-clone", "grading");
    mkdirSync(path.join(root, "20261030-100000-111"), { recursive: true });
    mkdirSync(path.join(root, "20261030-100000-222"), { recursive: true });
    writeFileSync(path.join(root, "20261030-100000-222", "elev.txt"), "falsk\n");
    mkdirSync(path.join(root, "noe-annet"));
    writeFileSync(path.join(root, "20261030-100000-333"), "fil, ikke mappe\n");
    const isAlive = (pid) => pid === 111;
    const k = kartleggGrading(root, { isAlive, sandkasse: null });
    assert.deepEqual(k.okter, [
      { navn: "20261030-100000-111", status: "i_bruk" },
      { navn: "20261030-100000-222", status: "slettes" },
    ]);
    assert.equal(k.ukjente, 2);
    assert.equal(antallSomSlettes(k), 1);
    const r = slettGrading(root, { isAlive, sandkasse: null });
    assert.equal(r.removed.length, 1);
    assert.deepEqual(r.skippedAlive, ["20261030-100000-111"]);
    assert.equal(existsSync(path.join(root, "20261030-100000-222")), false);
    assert.ok(existsSync(path.join(root, "20261030-100000-111")));
    assert.ok(existsSync(path.join(root, "noe-annet")));
  } finally {
    fjern(base);
  }
});

test("grading-roten under symlenke: ingenting slettes, alt merkes", { skip: process.platform === "win32" }, () => {
  const base = tmp();
  try {
    const ekte = path.join(base, "ekte");
    mkdirSync(path.join(ekte, "20261030-100000-222"), { recursive: true });
    mkdirSync(path.join(base, "canvas-clone"));
    const root = path.join(base, "canvas-clone", "grading");
    symlinkSync(ekte, root, "dir");
    const isAlive = () => false;
    assert.deepEqual(kartleggGrading(root, { isAlive, sandkasse: null }).okter, [{ navn: "20261030-100000-222", status: "symlenke" }]);
    assert.equal(slettGrading(root, { isAlive, sandkasse: null }).removed.length, 0);
    assert.ok(existsSync(path.join(ekte, "20261030-100000-222")));
  } finally {
    fjern(base);
  }
});

test("manglende røtter gir tomme kart", () => {
  const base = tmp();
  try {
    assert.deepEqual(kartleggGrading(path.join(base, "finnes-ikke"), { sandkasse: null }).okter, []);
    assert.deepEqual(kartleggVscode(path.join(base, "finnes-ikke"), opts).okter, []);
    assert.ok(TID.GJENOPPTA_MAKS < 100_000 && 100_000 < TID.UTLOPT, "testdataene forutsetter tidsgrensene fra D4");
  } finally {
    fjern(base);
  }
});

test("sandkasse: FLATPAK_ID og /.flatpak-info oppdages; SNAP og ingenting gir null", () => {
  const ingen = () => false;
  assert.equal(iSandkasse({ env: {}, finnes: ingen }), null);
  assert.equal(iSandkasse({ env: { FLATPAK_ID: "com.visualstudio.code" }, finnes: ingen }), "flatpak");
  assert.equal(iSandkasse({ env: {}, finnes: (p) => p === "/.flatpak-info" }), "flatpak");
  assert.equal(iSandkasse({ env: { SNAP: "/snap/code/1" }, finnes: ingen }), null);
});

test("grading-roten i sandkasse: ingenting kan slettes eller slettes, heller ikke med «død» PID", () => {
  const base = tmp();
  try {
    const root = path.join(base, "canvas-clone", "grading");
    mkdirSync(path.join(root, "20261030-100000-222"), { recursive: true });
    const isAlive = () => false; // i Flatpak ser vertens CLI-prosess død ut
    const k = kartleggGrading(root, { isAlive, sandkasse: "flatpak" });
    assert.deepEqual(k.okter, [{ navn: "20261030-100000-222", status: "sandkasse" }]);
    assert.equal(k.sandkasse, "flatpak");
    assert.equal(antallSomSlettes(k), 0);
    const r = slettGrading(root, { isAlive, sandkasse: "flatpak" });
    assert.deepEqual(r.removed, []);
    assert.equal(r.sandkasse, "flatpak");
    assert.ok(existsSync(path.join(root, "20261030-100000-222")));
  } finally {
    fjern(base);
  }
});
