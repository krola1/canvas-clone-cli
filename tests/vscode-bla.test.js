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
  KLONBARE,
  innleveringsbeskrivelse,
  harNytt,
  gjelderInnlevering,
  medNyKarakter,
  erQuizLignende,
  QUIZ_LIGNENDE,
} from "../vscode/src/bla.mjs";
import { erLevert } from "../vscode/src/levert.mjs";

const t = createStrings(false);
const SENTINEL = "BODY-VAKTPOST-7c1e9a";

// Prosjektregelen: all sletting via safeRemove, også i testene (tmp-mappene ligger i tmpdir()).
const fjern = (p) => assert.ok(safeRemove(tmpdir(), p).ok, `kunne ikke slette ${p}`);
const tmp = () => mkdtempSync(path.join(tmpdir(), "cc-bla-"));
const a = (id, name, needsGrading = 0) => ({ id, name, needsGrading, submissionTypes: ["online_url"] });
// 0.4.0 (plan G3): hver fikstur har `submittedAt` eksplisitt (tid eller null), som
// listSubmissions(…, { levertOgFritak: true }) gir. 0.4.0 (G5): ingen stille standard;
// hjelperen kaster uten `submittedAt` (som tests/vscode-panel.test.js etter G4).
const LEVERT = "2026-11-01T08:00:00Z";
const sub = (navn, { repo = null, state = "submitted", submittedAt } = {}) => {
  if (submittedAt === undefined) throw new Error("fikstur uten submittedAt");
  return {
    studentName: navn,
    workflowState: state,
    submittedAt,
    repo,
    owner: repo ? repo.split("/")[0] : null,
    userId: 1,
  };
};

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
        { user: { name: "Ola Nordmann" }, user_id: 1, workflow_state: "submitted", submitted_at: LEVERT, body: `${SENTINEL} https://github.com/ola/x` },
        { user: { name: "Kari Nordmann" }, user_id: 2, workflow_state: "graded", submitted_at: LEVERT, url: "https://github.com/kari/y", body: `<p>${SENTINEL}</p>` },
        { user: { name: "Per Uten" }, user_id: 3, workflow_state: "submitted", submitted_at: LEVERT, body: SENTINEL },
        { user: { name: "Ikke Levert" }, user_id: 4, workflow_state: "unsubmitted", submitted_at: null, body: SENTINEL },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const subs = await listSubmissions({ canvasUrl: "https://canvas.test.invalid", canvasToken: "x" }, 1, 10, { levertOgFritak: true });
    const noder = innleveringsnoder(kurs, kurs.assignments[0], subs, t);
    // 0.4.0 (G3): den som ikke har levert, ligger i gruppen «Ikke levert (N)» sist.
    assert.deepEqual(noder.map((n) => n.label), ["ola", "kari", "Per Uten", t.vscNotSubmittedGroup(1)]);
    assert.deepEqual(noder.slice(0, 3).map((n) => n.description), [t.filterNeedsGrading(), t.vscGraded(), t.filterNeedsGrading()]);
    assert.deepEqual(noder[3].barn.map((n) => [n.label, n.description]), [["Ikke Levert", t.vscNotSubmittedThread()]]);
    assert.equal(noder[0].tooltip, "Ola Nordmann (GitHub: ola)");
    const alt = JSON.stringify({ noder, valg: velgSelvValg(subs.filter(erLevert), t), subs });
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
  const n = innleveringsnoder(kurs, kurs.assignments[0], [sub("Ole Stor", { repo: "Ola/y", submittedAt: LEVERT }), sub("Ole Liten", { repo: "Ola/z", submittedAt: LEVERT })], t);
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
  const s1 = sub("A", { repo: "a/a", submittedAt: LEVERT });
  const s2 = sub("B", { repo: "b/b", state: "graded", submittedAt: LEVERT });
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
    const perAssignment = c.assignments.map((x) => ({ assignment: x, subs: [sub(`E${x.courseId}`, { repo: `e${x.courseId}/r`, submittedAt: LEVERT })] }));
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
    { ...sub("A", { repo: "Ola/y", submittedAt: LEVERT }), assignmentId: 10, courseName: "K" },
    { ...sub("B", { repo: "ola/y", submittedAt: LEVERT }), assignmentId: 10, courseName: "K" },
    { ...sub("C", { repo: "ola/y", submittedAt: LEVERT }), assignmentId: 11, courseName: "K" },
    { ...sub("D", { submittedAt: LEVERT }), assignmentId: 10, courseName: "K" },
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
      { ...sub("A", { repo: "ok/a", submittedAt: LEVERT }), assignmentId: 10, courseName: "K" },
      { ...sub("B", { submittedAt: LEVERT }), assignmentId: 10, courseName: "K" },
      { ...sub("C", { repo: "privat/c", submittedAt: LEVERT }), assignmentId: 10, courseName: "K" },
      { ...sub("D", { repo: "feil/d", submittedAt: LEVERT }), assignmentId: 11, courseName: "K" },
      { ...sub("E", { repo: "ok/e", submittedAt: LEVERT }), assignmentId: 11, courseName: "K" },
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
    const items = Array.from({ length: 6 }, (_, i) => ({ ...sub(`S${i}`, { repo: `s${i}/r`, submittedAt: LEVERT }), assignmentId: 10, courseName: "K" }));
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
    const items = itemsForAssignment([sub("A", { repo: "ola/x", submittedAt: LEVERT }), sub("B", { repo: "kari/y", submittedAt: LEVERT })], kurs, kurs.assignments[0]);
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

test("nodeFraArg med typeliste (0.2.0, «Åpne GitHub Pages»): bare de typene godtas; standard er uendret", () => {
  const oppg = { id: "cc1", type: "oppgave" };
  const inn = { id: "cc2", type: "innlevering" };
  const noder = new Map([["cc1", oppg], ["cc2", inn]]);
  assert.equal(nodeFraArg(inn, noder, false, ["innlevering"]), inn);
  assert.equal(nodeFraArg(oppg, noder, false, ["innlevering"]), null);
  assert.equal(nodeFraArg("cc2", noder, false, ["innlevering"]), null, "id som tekst utenfor testmodus");
  assert.equal(nodeFraArg("cc2", noder, true, ["innlevering"]), inn);
  assert.equal(nodeFraArg({ id: "cc2", type: "innlevering" }, noder, false, ["innlevering"]), null, "falskt objekt");
  assert.equal(nodeFraArg(oppg, noder, false), oppg, "standard: KLONBARE");
});

// --- 0.3.0: kommentartråden i treet --------------------------------------------

const k = (fraEleven, id = 1, over = {}) => ({ id, fraEleven, forfatternavn: fraEleven ? "Elev" : "Lærer", tekst: "TRAD-TEKST-VAKT", tid: null, forsok: null, vedlegg: [], media: null, ...over });
const medTrad = (s, kommentarer) => ({ ...s, kommentarer });

test("0.3.0 merke: «N kommentarer», «nytt» når siste er fra eleven, annen lærer = besvart, null = intet merke; aldri teksten (K10)", () => {
  const s = sub("Ola", { repo: "ola/x", submittedAt: LEVERT });
  assert.equal(innleveringsbeskrivelse(s, t), t.filterNeedsGrading(), "uten kommentarer-feltet: som før");
  assert.equal(innleveringsbeskrivelse(medTrad(s, null), t), t.filterNeedsGrading());
  assert.equal(innleveringsbeskrivelse(medTrad(s, []), t), t.filterNeedsGrading());
  assert.equal(innleveringsbeskrivelse(medTrad(s, [k(false), k(true, 2)]), t), `${t.filterNeedsGrading()} · ${t.vscCommentsCount(2)} · ${t.vscCommentsNew()}`);
  assert.equal(innleveringsbeskrivelse(medTrad(s, [k(true), k(false, 2)]), t), `${t.filterNeedsGrading()} · ${t.vscCommentsCount(2)}`);
  assert.equal(innleveringsbeskrivelse(medTrad(s, [k(true)]), t), `${t.filterNeedsGrading()} · ${t.vscCommentsCount(1)} · ${t.vscCommentsNew()}`);
  assert.equal(innleveringsbeskrivelse(medTrad({ ...s, currentGrade: "B", workflowState: "graded" }, [k(false)]), t), `${t.vscGraded()} (${t.currentGradeLabel("B")}) · ${t.vscCommentsCount(1)}`);
  assert.equal(innleveringsbeskrivelse(medTrad(s, [k(true)]), t, { quiz: true }), t.filterNeedsGrading(), "quiz: intet merke");
  assert.equal(harNytt(null), false);
  assert.equal(harNytt([]), false);
  assert.equal(harNytt([k(false), k(true, 2)]), true);
  // Fast tekst for «unsubmitted» (ikke Canvas sin interne tilstand).
  assert.equal(innleveringsbeskrivelse(sub("Per", { state: "unsubmitted", submittedAt: null }), t), t.vscNotSubmittedThread());
  assert.ok(!innleveringsbeskrivelse(medTrad(s, [k(true)]), t).includes("TRAD-TEKST-VAKT"));
});

test("0.4.0 innleveringsnoder (G3): alle ikke-leverte (med eller uten tråd) som `ikkeLevert` i én gruppe «Ikke levert (N)» etter de leverte", () => {
  const ikke = (navn, kommentarer) => medTrad(sub(navn, { state: "unsubmitted", submittedAt: null }), kommentarer);
  const subs = [
    ikke("Ikke Med Tråd", [k(false)]),
    medTrad(sub("Ola", { repo: "ola/x", submittedAt: LEVERT }), [k(true)]),
    ikke("Ikke Uten Tråd", []),
    ikke("Ikke Ukjent", null),
    { ...sub("Ikke Gammel", { state: "unsubmitted", submittedAt: null }) },
    ikke("Ikke Elevsvar", [k(false), k(true, 2)]),
  ];
  const n = innleveringsnoder(kurs, kurs.assignments[0], subs, t);
  assert.deepEqual(n.map((x) => [x.type, x.label]), [
    ["innlevering", "ola"],
    ["ikkeLevertGruppe", t.vscNotSubmittedGroup(5)],
  ]);
  const g = n[1].barn;
  assert.deepEqual(g.map((x) => [x.type, x.label]), [
    ["ikkeLevert", "Ikke Med Tråd"],
    ["ikkeLevert", "Ikke Uten Tråd"],
    ["ikkeLevert", "Ikke Ukjent"],
    ["ikkeLevert", "Ikke Gammel"],
    ["ikkeLevert", "Ikke Elevsvar"],
  ]);
  assert.equal(g[0].description, `${t.vscNotSubmittedThread()} · ${t.vscCommentsCount(1)}`);
  assert.equal(g[1].description, t.vscNotSubmittedThread());
  assert.equal(g[4].description, `${t.vscNotSubmittedThread()} · ${t.vscCommentsCount(2)} · ${t.vscCommentsNew()}`);
  assert.equal(g[0].tooltip, t.vscSubmissionTooltipNoLink("Ikke Med Tråd"));
  assert.equal(n[1].description, undefined, "gruppen har bare antallet i navnet");
  assert.equal(n[1].id, undefined, "id-en gis av bla-vindu.js (ugjennomsiktig teller)");
  for (const x of [...n, ...g]) assert.ok(!JSON.stringify([x.label, x.description, x.tooltip]).includes("TRAD-TEKST-VAKT"), "K10");
  // `ikkeLevert` og gruppen er ikke klonbare.
  assert.ok(!KLONBARE.includes("ikkeLevert") && !KLONBARE.includes("ikkeLevertGruppe"));
  const alle = [...n, ...g];
  const noder = new Map(alle.map((x, i) => [`cc${i}`, Object.assign(x, { id: `cc${i}` })]));
  assert.equal(nodeFraArg(g[0], noder, false), null, "Klon (KLONBARE) godtar ikke ikkeLevert");
  assert.equal(nodeFraArg(n[1], noder, false), null, "Klon (KLONBARE) godtar ikke gruppen");
  assert.equal(nodeFraArg(g[0], noder, false, ["innlevering"]), null, "Åpne GitHub Pages / Sett karakter godtar ikke ikkeLevert");
  assert.equal(nodeFraArg(g[0], noder, false, ["ikkeLevert"]), g[0]);
  assert.equal(nodeFraArg(n[1], noder, false, ["ikkeLevert"]), null, "«Åpne i karakterpanelet» godtar ikke gruppen");
  assert.equal(nodeFraArg(n[0], noder, false, ["ikkeLevert"]), null, "«Åpne i karakterpanelet» godtar bare ikkeLevert");
});

test("0.3.0 innleveringsnoder: quiz gir ingen ikkeLevert-rader og ingen merker (Lars 2026-11-06)", () => {
  const quiz = { ...kurs.assignments[0], submissionTypes: ["online_quiz"] };
  const n = innleveringsnoder(kurs, quiz, [medTrad(sub("Ola", { submittedAt: LEVERT }), [k(true)]), medTrad(sub("Ikke", { state: "unsubmitted", submittedAt: null }), [k(false)])], t);
  assert.deepEqual(n.map((x) => [x.type, x.description]), [["innlevering", t.filterNeedsGrading()]]);
});

test("0.3.0 innleveringsnoder: duplikatnavn (T1a) regnes over leverte og ikke-leverte med tråd", () => {
  const n = innleveringsnoder(
    kurs,
    kurs.assignments[0],
    [sub("Kari A", { repo: "kari/x", submittedAt: LEVERT }), medTrad({ ...sub("Kari B", { state: "unsubmitted", submittedAt: null, repo: "kari/y" }) }, [k(false)])],
    t,
  );
  // 0.4.0 (G3): Kari B ligger i gruppen «Ikke levert (1)».
  assert.deepEqual([n[0].label, ...n[1].barn.map((x) => x.label)], ["kari (Kari A)", "kari (Kari B)"]);
});

test("0.3.0 gjelderInnlevering/medNyKarakter: begge typene; tråden byttes bare når svaret har en liste", () => {
  const hendelse = { kursId: 1, oppgaveId: 10, userId: 1, karakter: "A", status: "graded" };
  const nodeAv = (type) => ({ type, course: kurs, assignment: kurs.assignments[0], sub: sub("Ola", { submittedAt: LEVERT }) });
  assert.equal(gjelderInnlevering(nodeAv("innlevering"), hendelse), true);
  assert.equal(gjelderInnlevering(nodeAv("ikkeLevert"), hendelse), true);
  assert.equal(gjelderInnlevering(nodeAv("oppgave"), hendelse), false);
  const gammel = [k(true)];
  const s = medTrad(sub("Ola", { submittedAt: LEVERT }), gammel);
  assert.equal(medNyKarakter(s, { ...hendelse, kommentarer: null }).kommentarer, gammel);
  assert.equal(medNyKarakter(s, hendelse).kommentarer, gammel);
  const ny = [k(true), k(false, 2)];
  assert.equal(medNyKarakter(s, { ...hendelse, kommentarer: ny }).kommentarer, ny);
  assert.equal(medNyKarakter(s, hendelse).currentGrade, "A");
});

// --- 0.4.0 (plan G3): felles levert-definisjon og «Ikke levert (N)» -------------

test("0.4.0 G3: «karakter, men ingen submitted_at» er ikke levert: rad i gruppen med karakteren («ikke levert · B»)", () => {
  const papir = { ...sub("Papir", { state: "graded", submittedAt: null }), currentGrade: "B" };
  const n = innleveringsnoder(kurs, kurs.assignments[0], [sub("Ola", { repo: "ola/x", submittedAt: LEVERT }), papir], t);
  assert.deepEqual(n.map((x) => x.type), ["innlevering", "ikkeLevertGruppe"]);
  assert.deepEqual(n[1].barn.map((x) => [x.type, x.label, x.description]), [["ikkeLevert", "Papir", `${t.vscNotSubmittedThread()} · B`]]);
  assert.equal(n[1].label, t.vscNotSubmittedGroup(1));
});

test("0.4.0 G3 beskrivelser (O6 revidert): faste ord og karakterverdien; «· fritatt» på leverte og ikke-leverte; aldri kommentartekst eller verifier", () => {
  const VAKT = "TRAD-TEKST-VAKT verifier=V https://x";
  const kom = [k(true, 1, { tekst: VAKT })];
  const ikke = (over) => ({ ...sub("I", { state: "unsubmitted", submittedAt: null }), ...over });
  assert.equal(innleveringsbeskrivelse(ikke({}), t), t.vscNotSubmittedThread());
  assert.equal(innleveringsbeskrivelse(ikke({ currentGrade: "B" }), t), `${t.vscNotSubmittedThread()} · B`);
  assert.equal(innleveringsbeskrivelse(ikke({ excused: true }), t), `${t.vscNotSubmittedThread()} · ${t.vscExcused()}`);
  assert.equal(innleveringsbeskrivelse(ikke({ excused: true, currentGrade: "B" }), t), `${t.vscNotSubmittedThread()} · ${t.vscExcused()}`, "fritatt foran karakter");
  assert.equal(innleveringsbeskrivelse(ikke({ currentGrade: "" }), t), t.vscNotSubmittedThread());
  assert.equal(innleveringsbeskrivelse(medTrad(ikke({ currentGrade: "B" }), kom), t), `${t.vscNotSubmittedThread()} · B · ${t.vscCommentsCount(1)} · ${t.vscCommentsNew()}`);
  const levert = sub("L", { repo: "l/x", submittedAt: LEVERT });
  assert.equal(innleveringsbeskrivelse({ ...levert, excused: true }, t), `${t.filterNeedsGrading()} · ${t.vscExcused()}`);
  assert.equal(
    innleveringsbeskrivelse(medTrad({ ...levert, workflowState: "graded", currentGrade: "A", excused: true }, kom), t),
    `${t.vscGraded()} (${t.currentGradeLabel("A")}) · ${t.vscExcused()} · ${t.vscCommentsCount(1)} · ${t.vscCommentsNew()}`,
  );
  assert.equal(innleveringsbeskrivelse({ ...levert, excused: false }, t), t.filterNeedsGrading());
  const en = createStrings(true);
  assert.equal(innleveringsbeskrivelse(ikke({ excused: true }), en), "not submitted · excused");
  for (const s of [ikke({ currentGrade: "B" }), ikke({ excused: true }), { ...levert, excused: true }]) {
    const d = innleveringsbeskrivelse(medTrad(s, kom), t);
    assert.ok(!d.includes("TRAD-TEKST-VAKT") && !d.includes("verifier") && !d.includes("https://"), d);
  }
});

test("0.4.0 G3: ingen reserveregel via workflowState: levert er bare submittedAt", () => {
  // «unsubmitted» med tid regnes som levert, «submitted»/«graded» uten tid som ikke levert.
  const n = innleveringsnoder(
    kurs,
    kurs.assignments[0],
    [sub("Med Tid", { state: "unsubmitted", submittedAt: LEVERT }), sub("Uten Tid", { state: "submitted", submittedAt: null }), sub("Tom", { state: "graded", submittedAt: "" })],
    t,
  );
  assert.deepEqual(n.map((x) => [x.type, x.label]), [["innlevering", "Med Tid"], ["ikkeLevertGruppe", t.vscNotSubmittedGroup(2)]]);
  assert.deepEqual(n[1].barn.map((x) => x.label), ["Uten Tid", "Tom"]);
});

test("0.4.0 G3: ingen gruppe når alle har levert, og ingen gruppe på quiz eller external_tool (O11)", () => {
  assert.deepEqual(QUIZ_LIGNENDE, ["online_quiz", "external_tool"]);
  assert.deepEqual(innleveringsnoder(kurs, kurs.assignments[0], [sub("Ola", { submittedAt: LEVERT })], t).map((x) => x.type), ["innlevering"]);
  const ikke = sub("Ikke", { state: "unsubmitted", submittedAt: null });
  for (const typer of [["online_quiz"], ["external_tool"], ["online_url", "external_tool"]]) {
    const a = { ...kurs.assignments[0], submissionTypes: typer };
    assert.equal(erQuizLignende(a), true, typer.join());
    assert.deepEqual(innleveringsnoder(kurs, a, [sub("Ola", { submittedAt: LEVERT }), ikke], t).map((x) => x.type), ["innlevering"], typer.join());
  }
  for (const typer of [["online_url"], ["on_paper"], ["none"], ["online_text_entry", "online_upload"], [], undefined]) {
    const a = { ...kurs.assignments[0], submissionTypes: typer };
    assert.equal(erQuizLignende(a), false, String(typer));
    assert.deepEqual(innleveringsnoder(kurs, a, [sub("Ola", { submittedAt: LEVERT }), ikke], t).map((x) => x.type), ["innlevering", "ikkeLevertGruppe"], String(typer));
  }
});

test("0.4.0 G3: glemt { levertOgFritak: true } gir synlig feil i treet (erLevert kaster), ikke stille «ikke levert»", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify([{ user: { name: "Ola" }, user_id: 1, workflow_state: "submitted", submitted_at: LEVERT, url: "https://github.com/ola/x" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const config = { canvasUrl: "https://canvas.test.invalid", canvasToken: "x" };
    const uten = await listSubmissions(config, 1, 10);
    assert.throws(() => innleveringsnoder(kurs, kurs.assignments[0], uten, t), /submittedAt/);
    const med = await listSubmissions(config, 1, 10, { levertOgFritak: true });
    assert.deepEqual(innleveringsnoder(kurs, kurs.assignments[0], med, t).map((x) => x.type), ["innlevering"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("0.4.0 G5: fiksturhjelperen sub() kaster uten submittedAt (ingen stille standard)", () => {
  assert.throws(() => sub("Ola"), /submittedAt/);
  assert.throws(() => sub("Ola", { repo: "ola/x" }), /submittedAt/);
  assert.equal(sub("Ola", { submittedAt: null }).submittedAt, null);
});
