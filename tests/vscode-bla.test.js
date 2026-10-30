// Ren logikk for bla og kloning i VS Code-utvidelsen (vscode/src/bla.mjs, D5):
// trenoder med samme kategorisering som CLI-et, valg (T16), mappestruktur i
// økten (T9a), kloneplan, kjøring, uten_lenke.txt og oppsummering (T11), og
// vaktposten for T-A. Ingen VS Code; alt skjer i egne tmp-mapper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { safeRemove } from "../src/storage.js";
import path from "node:path";
import { createStrings } from "../src/strings.js";
import { listSubmissions } from "../src/canvas.js";
import { cloneRepoAsync } from "../src/github.js";
import { buildCategoryTree } from "../src/categories.js";
import { destRootFor, formatSkippedLog, selectForBulk, itemsForAssignment, buildCrossCourseCourse } from "../src/workflow.js";
import {
  STOR_BULK,
  kursnoder,
  fagretningsnoder,
  fagretningsbarn,
  modulnoder,
  oppgavenoder,
  innleveringsnoder,
  bulkfilterValg,
  omfangValg,
  velgSelvValg,
  trengerBekreftelse,
  omfangPaTvers,
  oktOppgavemappe,
  planleggKloning,
  kjorKloning,
  skrivUtenLenke,
  oppsummer,
  nodeFraArg,
} from "../vscode/src/bla.mjs";

const t = createStrings(false);
const SENTINEL = "BODY-VAKTPOST-7c1e9a";

// Prosjektregelen: all sletting via safeRemove, også i testene (tmp-mappene ligger i tmpdir()).
const fjern = (p) => assert.ok(safeRemove(tmpdir(), p).ok, `kunne ikke slette ${p}`);
const tmp = () => mkdtempSync(path.join(tmpdir(), "cc-bla-"));
const a = (id, name, needsGrading = 0) => ({ id, name, needsGrading, submissionTypes: ["online_url"] });
const sub = (navn, { repo = null, state = "submitted" } = {}) => ({
  studentName: navn,
  workflowState: state,
  repo,
  owner: repo ? repo.split("/")[0] : null,
  userId: 1,
});

const kurs = {
  id: 1,
  name: "Kurs A",
  needsGrading: 5,
  assignments: [
    a(10, "Frontend modul 1: HTML", 2),
    a(11, "Frontend modul 2: CSS", 3),
    a(12, "SQL Oppgave 1", 0),
    a(13, "Fritt prosjekt", 0),
  ],
};

test("kursnoder: sortert på «klare til retting», med CLI-ets tekst", () => {
  const n = kursnoder([{ ...kurs, id: 2, name: "B", needsGrading: 0, assignments: [] }, kurs], t);
  assert.deepEqual(
    n.map((x) => [x.type, x.label, x.description]),
    [
      ["kurs", "Kurs A", t.gradingLabel(5)],
      ["kurs", "B", t.gradingLabel(0)],
    ],
  );
  assert.equal(n[0].pool, kurs.assignments);
});

test("fagretning/modul/oppgave: samme kategorisering som CLI-et (buildCategoryTree), ukategorisert til slutt", () => {
  const f = fagretningsnoder(kurs, t);
  const { categories, uncategorized } = buildCategoryTree(kurs.assignments);
  assert.deepEqual(
    f.map((x) => x.label),
    ["Frontend", "SQL", t.uncategorized()],
  );
  assert.equal(categories.length + (uncategorized.length > 0 ? 1 : 0), f.length);
  assert.equal(f[0].description, `${t.gradingLabel(5)} (2)`);
  // Frontend har moduler, SQL ikke (oppgavene direkte), ukategorisert heller ikke.
  const moduler = fagretningsbarn(f[0], t);
  assert.deepEqual(moduler.map((m) => [m.type, m.label]), [
    ["modul", "modul 2"],
    ["modul", "modul 1"],
  ]);
  assert.deepEqual(oppgavenoder(kurs, moduler[0].pool, t).map((o) => o.assignment.id), [11]);
  assert.deepEqual(fagretningsbarn(f[1], t).map((o) => [o.type, o.assignment.id]), [["oppgave", 12]]);
  assert.deepEqual(fagretningsbarn(f[2], t).map((o) => o.assignment.id), [13]);
  assert.deepEqual(modulnoder(kurs, f[0].category, t).map((m) => m.pool.length), [1, 1]);
});

test("T-A: innleveringens body finnes ikke i noen node, label, tooltip eller valg (vaktpost)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        { user: { name: "Ola Nordmann" }, user_id: 1, workflow_state: "submitted", body: `${SENTINEL} https://github.com/ola/x` },
        { user: { name: "Kari Nordmann" }, user_id: 2, workflow_state: "graded", url: "https://github.com/kari/y", body: `<p>${SENTINEL}</p>` },
        { user: { name: "Per Uten" }, user_id: 3, workflow_state: "submitted", body: SENTINEL },
        { user: { name: "Ikke Levert" }, user_id: 4, workflow_state: "unsubmitted", body: SENTINEL },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const subs = await listSubmissions({ canvasUrl: "https://canvas.test.invalid", canvasToken: "x" }, 1, 10);
    const noder = innleveringsnoder(kurs, kurs.assignments[0], subs, t);
    assert.deepEqual(noder.map((n) => n.label), ["ola", "kari", "Per Uten"]);
    assert.deepEqual(noder.map((n) => n.description), [t.filterNeedsGrading(), t.vscGraded(), t.filterNeedsGrading()]);
    assert.equal(noder[0].tooltip, "Ola Nordmann (GitHub: ola)");
    const alt = JSON.stringify({ noder, valg: velgSelvValg(subs.filter((s) => s.workflowState !== "unsubmitted"), t), subs });
    assert.ok(!alt.includes(SENTINEL), "body lekket ut");
    // Og ikke i uten_lenke.txt eller oppsummeringen.
    const okt = tmp();
    try {
      const plan = planleggKloning(itemsForAssignment(subs, kurs, kurs.assignments[0]), okt, false);
      const res = await kjorKloning(plan, { klon: async () => ({ ok: false, reason: "failed", error: SENTINEL }) });
      skrivUtenLenke(res, t);
      const fil = readFileSync(path.join(okt, "10", "uten_lenke.txt"), "utf8");
      assert.ok(!fil.includes(SENTINEL));
      assert.ok(!JSON.stringify(oppsummer(res)).includes(SENTINEL));
    } finally {
      fjern(okt);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("innleveringsnoder: duplikate GitHub-navn får Canvas-navnet i parentes (T1a)", () => {
  const n = innleveringsnoder(kurs, kurs.assignments[0], [sub("Ole Stor", { repo: "Ola/y" }), sub("Ole Liten", { repo: "Ola/z" })], t);
  // labelWithDuplicates skiller på eksakt visningsnavn: "Ola" og "Ola" er like.
  assert.deepEqual(n.map((x) => x.label), ["Ola (Ole Stor)", "Ola (Ole Liten)"]);
});

test("T16: bulk-filteret har «trenger retting» først og som standardvalg; terskelen for bekreftelse", () => {
  const v = bulkfilterValg(t);
  assert.deepEqual(v.map((x) => x.filter), ["needs_grading", "all"]);
  assert.deepEqual(v.map((x) => x.standard === true), [true, false]);
  assert.equal(v[0].label, t.filterNeedsGrading());
  assert.equal(trengerBekreftelse(STOR_BULK - 1), false);
  assert.equal(trengerBekreftelse(STOR_BULK), true);
});

test("omfang for én oppgave: som CLI-ets pickCloneScope (trenger retting først bare når det er et reelt valg)", () => {
  const s1 = sub("A", { repo: "a/a" });
  const s2 = sub("B", { repo: "b/b", state: "graded" });
  assert.deepEqual(omfangValg([s1, s2], [s1], t).map((v) => v.omfang), ["needs_grading", "all", "choose"]);
  assert.deepEqual(omfangValg([s1, s2], [s1], t).filter((v) => v.standard).map((v) => v.omfang), ["needs_grading"]);
  assert.deepEqual(omfangValg([s1], [s1], t).map((v) => v.omfang), ["all", "choose"]);
  assert.deepEqual(velgSelvValg([s1, s2], t).map((v) => v.picked), [true, false]);
});

test("på tvers av kurs: omfang med alle, fagretninger og moduler", () => {
  const c = buildCrossCourseCourse([kurs, { id: 2, name: "Kurs B", assignments: [a(10, "Frontend modul 1: annen", 1)] }], t);
  const v = omfangPaTvers(c, t);
  assert.equal(v[0].pool.length, 5);
  assert.ok(v.some((x) => x.label === "Frontend › modul 1" && x.pool.length === 2));
  assert.ok(v.some((x) => x.label === "SQL"));
});

test("oktOppgavemappe: samme struktur som CLI-ets destRootFor, men aldri punktum først (T9a)", () => {
  const okt = path.join("/x", "okt");
  const s = { assignmentId: 10, courseName: "Kurs A" };
  assert.equal(oktOppgavemappe(okt, s, false), destRootFor(okt, s, false));
  assert.equal(oktOppgavemappe(okt, s, true), destRootFor(okt, s, true));
  assert.equal(oktOppgavemappe(okt, { assignmentId: 10, courseName: ".vscode" }, true), path.join(okt, "_.vscode", "10"));
  assert.equal(oktOppgavemappe(okt, { assignmentId: 10, courseName: "..." }, true), path.join(okt, "_", "10"));
});

test("T9a: etter kloning på tvers av kurs begynner ingen direkte undermappe av økten med punktum", async () => {
  const okt = tmp();
  try {
    const kursene = [".vscode", ".git", "..", ".canvas-clone-okt", "Vanlig kurs"].map((name, i) => ({
      id: i + 1,
      name,
      assignments: [a(10, "Frontend modul 1: X", 1)],
    }));
    const c = buildCrossCourseCourse(kursene, t);
    const perAssignment = c.assignments.map((x) => ({ assignment: x, subs: [sub(`E${x.courseId}`, { repo: `e${x.courseId}/r` })] }));
    const items = selectForBulk(perAssignment, c, "needs_grading");
    const res = await kjorKloning(planleggKloning(items, okt, true), {
      klon: async (_repo, dest) => {
        mkdirSync(dest, { recursive: true });
        return { ok: true };
      },
    });
    assert.equal(oppsummer(res).klonet, 5);
    const direkte = readdirSync(okt);
    assert.equal(direkte.length, 5);
    for (const n of direkte) assert.ok(!n.startsWith("."), n);
  } finally {
    fjern(okt);
  }
});

test("planleggKloning: <eier>_<repo> med -2 ved kollisjon i samme oppgave, egen teller per oppgavemappe, ingen lenke = ingen dest", () => {
  const okt = path.join("/x", "okt");
  const items = [
    { ...sub("A", { repo: "Ola/y" }), assignmentId: 10, courseName: "K" },
    { ...sub("B", { repo: "ola/y" }), assignmentId: 10, courseName: "K" },
    { ...sub("C", { repo: "ola/y" }), assignmentId: 11, courseName: "K" },
    { ...sub("D"), assignmentId: 10, courseName: "K" },
  ];
  const p = planleggKloning(items, okt, false);
  assert.deepEqual(
    p.map((j) => j.dest && path.relative(okt, j.dest)),
    [path.join("10", "ola_y"), path.join("10", "ola_y-2"), path.join("11", "ola_y"), null],
  );
  assert.deepEqual(p.map((j) => j.navn), ["Ola", "ola", "ola", "D"]);
});

test("kjorKloning: statuser, samtidighet, uten_lenke.txt i CLI-ets format uten git sin feilmelding, oppsummering", async () => {
  const okt = tmp();
  try {
    const items = [
      { ...sub("A", { repo: "ok/a" }), assignmentId: 10, courseName: "K" },
      { ...sub("B"), assignmentId: 10, courseName: "K" },
      { ...sub("C", { repo: "privat/c" }), assignmentId: 10, courseName: "K" },
      { ...sub("D", { repo: "feil/d" }), assignmentId: 11, courseName: "K" },
      { ...sub("E", { repo: "ok/e" }), assignmentId: 11, courseName: "K" },
    ];
    let samtidig = 0;
    let maks = 0;
    const underveis = [];
    const res = await kjorKloning(planleggKloning(items, okt, false), {
      samtidighet: 2,
      underveis: (f, n) => underveis.push([f, n]),
      klon: async (repo, dest) => {
        samtidig++;
        maks = Math.max(maks, samtidig);
        await new Promise((r) => setTimeout(r, 5));
        samtidig--;
        if (repo.startsWith("ok/")) {
          mkdirSync(dest, { recursive: true });
          return { ok: true };
        }
        const stderr = "fatal: HEMMELIG-STDERR https://github.com/x";
        return { ok: false, error: stderr, reason: repo.startsWith("privat/") ? "no_access" : "failed" };
      },
    });
    assert.ok(maks <= 2, `maks ${maks}`);
    assert.deepEqual(res.map((r) => r.status), ["klonet", "uten_lenke", "uten_tilgang", "klone_feil", "klonet"]);
    assert.equal(underveis.length, 5);
    assert.deepEqual(underveis.at(-1), [5, 5]);
    assert.equal(skrivUtenLenke(res, t), 2);
    assert.equal(
      readFileSync(path.join(okt, "10", "uten_lenke.txt"), "utf8"),
      formatSkippedLog([
        { name: "B", reason: t.reasonNoLink() },
        { name: "privat", reason: t.reasonNoAccess("privat/c") },
      ]),
    );
    const f11 = readFileSync(path.join(okt, "11", "uten_lenke.txt"), "utf8");
    assert.equal(f11, formatSkippedLog([{ name: "feil", reason: t.vscReasonCloneFailed("feil/d") }]));
    assert.ok(!f11.includes("HEMMELIG-STDERR"));
    assert.deepEqual(oppsummer(res), { klonet: 2, utenLenke: 1, utenTilgang: 1, kloneFeil: 1, avbrutt: 0, totalt: 5 });
  } finally {
    fjern(okt);
  }
});

test("kjorKloning: etter avbrudd startes ingen nye kloninger", async () => {
  const okt = tmp();
  try {
    const ac = new AbortController();
    const items = Array.from({ length: 6 }, (_, i) => ({ ...sub(`S${i}`, { repo: `s${i}/r` }), assignmentId: 10, courseName: "K" }));
    let startet = 0;
    const res = await kjorKloning(planleggKloning(items, okt, false), {
      signal: ac.signal,
      samtidighet: 1,
      klon: async () => {
        startet++;
        if (startet === 2) ac.abort();
        return ac.signal.aborted ? { ok: false, aborted: true } : { ok: true };
      },
    });
    assert.equal(startet, 2);
    assert.deepEqual(res.map((r) => r.status), ["klonet", "avbrutt", "avbrutt", "avbrutt", "avbrutt", "avbrutt"]);
    assert.equal(oppsummer(res).avbrutt, 5);
  } finally {
    fjern(okt);
  }
});

test("med cloneRepoAsync og falsk git: mappene havner i økten med CLI-ets struktur", { skip: process.platform === "win32" }, async () => {
  const base = tmp();
  try {
    const okt = path.join(base, "okt");
    mkdirSync(okt);
    const git = path.join(base, "git");
    writeFileSync(
      git,
      `#!${process.execPath}\nconst fs=require("node:fs");const a=process.argv.slice(2);` +
        `if(a.includes("clone")){fs.mkdirSync(a.at(-1),{recursive:true});fs.writeFileSync(a.at(-1)+"/REPO_ID",a.at(-2));process.exit(0)}process.exit(1)\n`,
    );
    chmodSync(git, 0o755);
    const items = itemsForAssignment([sub("A", { repo: "ola/x" }), sub("B", { repo: "kari/y" })], kurs, kurs.assignments[0]);
    const res = await kjorKloning(planleggKloning(items, okt, false), {
      klon: (repo, dest) => cloneRepoAsync(repo, dest, okt, { gitPath: git }),
    });
    assert.deepEqual(res.map((r) => r.status), ["klonet", "klonet"]);
    assert.equal(readFileSync(path.join(okt, "10", "ola_x", "REPO_ID"), "utf8"), "https://github.com/ola/x.git");
    assert.ok(existsSync(path.join(okt, "10", "kari_y")));
  } finally {
    fjern(base);
  }
});

test("nodeFraArg: id som tekst bare i testmodus; ukjente, gamle og ikke-klonbare noder avvises", () => {
  const oppg = { id: "cc1", type: "oppgave" };
  const info = { id: "cc2", type: "info" };
  const noder = new Map([["cc1", oppg], ["cc2", info]]);
  assert.equal(nodeFraArg(oppg, noder, false), oppg, "noden fra trevisningen");
  assert.equal(nodeFraArg("cc1", noder, false), null, "id som tekst utenfor testmodus");
  assert.equal(nodeFraArg("cc1", noder, true), oppg);
  assert.equal(nodeFraArg("cc999", noder, true), null, "ukjent id");
  assert.equal(nodeFraArg({ id: "cc1", type: "oppgave" }, noder, false), null, "gammel node (annet objekt)");
  assert.equal(nodeFraArg(info, noder, false), null, "ikke klonbar");
  assert.equal(nodeFraArg(undefined, noder, true), null);
});
