// Ren logikk for karakterpanelet i VS Code-utvidelsen (vscode/src/panel.mjs, D6a):
// binding med generasjon og quiz-avvisning (T1-V, B4), hviteliste til webviewen
// (T10/T11), skjemavalidering av meldinger, sammenligning med fersk innlevering
// før sending, bekreftelsestekst med navn fra bundet user_id, og T-A-vaktposten.
// Ingen VS Code, ingen filer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStrings } from "../src/strings.js";
import { listSubmissions } from "../src/canvas.js";
import {
  GRENSER,
  VIS_KOMMENTAR,
  VISNINGSFELT,
  bindInnlevering,
  lagPanel,
  visningsmodell,
  validerMelding,
  vurderFersk,
  bekreftelse,
  sendArgumenter,
  feilmelding,
} from "../vscode/src/panel.mjs";

const t = createStrings(false);
const en = createStrings(true);
const SENTINEL = "BODY-VAKTPOST-d6a-3f9b21";

const course = { id: 7, name: "Kurs A" };
const assignment = { id: 70, name: "Frontend modul 1: HTML", submissionTypes: ["online_url"] };
const sub = (over = {}) => ({
  studentName: "Ola Nordmann",
  workflowState: "submitted",
  repo: "ola/x",
  owner: "ola",
  userId: 1001,
  currentGrade: null,
  currentScore: null,
  ...over,
});
const node = (over = {}, a = assignment) => ({ course, assignment: a, sub: sub(over) });

function bundet(over = {}) {
  const panel = lagPanel();
  const r = panel.bind(node(over));
  assert.ok(r.ok);
  return { panel, b: r.binding };
}

// --- 1. Binding ---------------------------------------------------------------

test("binding: kurs, oppgave, user_id og generasjon som øker ved hver nybinding", () => {
  const panel = lagPanel();
  const r1 = panel.bind(node());
  assert.equal(r1.binding.kursId, 7);
  assert.equal(r1.binding.oppgaveId, 70);
  assert.equal(r1.binding.userId, 1001);
  assert.equal(r1.binding.generasjon, 1);
  assert.ok(Object.isFrozen(r1.binding));
  const r2 = panel.bind(node({ userId: 1002, studentName: "Kari" }));
  assert.equal(r2.binding.generasjon, 2);
  assert.equal(panel.gjeldende, r2.binding);
  // Samme elev på nytt gir også ny generasjon.
  assert.equal(panel.bind(node({ userId: 1002 })).binding.generasjon, 3);
});

test("binding: på tvers av kurs brukes oppgavens ekte kurs (courseId/courseName)", () => {
  const r = bindInnlevering({ course: { id: 0, name: "På tvers" }, assignment: { ...assignment, courseId: 9, courseName: "Kurs B" }, sub: sub() }, 1);
  assert.equal(r.binding.kursId, 9);
  assert.equal(r.binding.kursnavn, "Kurs B");
});

test("binding: quiz avvises (samme regel som CLI-et), og den forrige bindingen fjernes", () => {
  const panel = lagPanel();
  panel.bind(node());
  const r = panel.bind(node({}, { ...assignment, submissionTypes: ["online_quiz"] }));
  assert.deepEqual(r, { ok: false, grunn: "quiz", generasjon: 2 });
  assert.equal(panel.gjeldende, null);
  assert.equal(feilmelding("quiz", t), t.quizGradingNotSupported());
  // Et skjema fra generasjon 1 kan ikke sendes nå.
  assert.equal(validerMelding({ type: "send", generasjon: 1, karakter: "A", kommentar: "" }, panel.gjeldende).grunn, "ingen_binding");
});

test("binding: ikke levert og manglende ID-er avvises; losne gir ny generasjon", () => {
  const panel = lagPanel();
  assert.equal(panel.bind(node({ workflowState: "unsubmitted" })).grunn, "ikke_levert");
  assert.equal(panel.bind(node({ userId: "1001" })).grunn, "ugyldig_innlevering");
  assert.equal(panel.bind(node({ userId: 0 })).grunn, "ugyldig_innlevering");
  assert.equal(panel.bind({ course, assignment }).grunn, "ugyldig_innlevering");
  assert.equal(bindInnlevering(node(), 0).ok, false);
  panel.bind(node());
  assert.equal(panel.generasjon, 5);
  panel.losne();
  assert.equal(panel.generasjon, 6);
  assert.equal(panel.gjeldende, null);
});

// --- 2. Visningsmodell --------------------------------------------------------

test("visningsmodell: bare hvitelistede felt, ingen ID-er, tomt skjema", () => {
  const { b } = bundet({ currentGrade: "B", workflowState: "graded" });
  const m = visningsmodell(b, t);
  assert.deepEqual(Object.keys(m).sort(), [...VISNINGSFELT].sort());
  assert.equal(m.type, "vis");
  assert.equal(m.generasjon, 1);
  assert.equal(m.kurs, "Kurs A");
  assert.equal(m.oppgave, "Frontend modul 1: HTML");
  assert.equal(m.elev, "Ola Nordmann (GitHub: ola)");
  assert.equal(m.karakter, t.currentGradeDisplay("B"));
  assert.equal(m.status, t.vscGraded());
  assert.deepEqual(m.skjema, { karakter: "", kommentar: "" });
  assert.deepEqual(m.grenser, { karakter: GRENSER.karakter, kommentar: GRENSER.kommentar });
  // Ingen tall i modellen utenom generasjon og grenser (ingen Canvas-ID-er eller user_id).
  const json = JSON.stringify(m);
  for (const id of ["1001", "70", '"7"', ":7,", ":7}"]) assert.ok(!json.includes(id), `fant ${id}`);
  assert.equal(visningsmodell(null, t), null);
});

test("visningsmodell: uten GitHub-lenke vises bare Canvas-navnet; status trenger retting", () => {
  const { b } = bundet({ owner: null, repo: null });
  const m = visningsmodell(b, t);
  assert.equal(m.elev, "Ola Nordmann");
  assert.equal(m.status, t.filterNeedsGrading());
  assert.equal(m.karakter, t.currentGradeDisplay(null));
});

test("visningsmodell: ukjente felt på innleveringen følger ikke med", () => {
  const { b } = bundet({ hemmelig: "X-UKJENT", user: { id: 1001, login_id: "X-LOGIN" } });
  assert.deepEqual(Object.keys(b).sort(), ["canvasNavn", "generasjon", "github", "karakter", "kursId", "kursnavn", "oppgaveId", "oppgavenavn", "status", "userId"]);
  const json = JSON.stringify(visningsmodell(b, t));
  assert.ok(!json.includes("X-UKJENT") && !json.includes("X-LOGIN"));
});

// --- 3. Skjemavalidering ------------------------------------------------------

test("validerMelding: klar og gyldig send godtas; karakter trimmes", () => {
  const { b } = bundet();
  assert.deepEqual(validerMelding({ type: "klar" }, null), { ok: true, type: "klar" });
  assert.deepEqual(validerMelding({ type: "send", generasjon: 1, karakter: " A ", kommentar: "Bra!\nFortsett." }, b), {
    ok: true,
    type: "send",
    karakter: "A",
    kommentar: "Bra!\nFortsett.",
  });
  assert.deepEqual(validerMelding({ type: "send", generasjon: 1, karakter: "", kommentar: "Bare kommentar" }, b).karakter, "");
});

test("validerMelding: ukjente typer, ekstra felt, ID-er og feil typer avvises", () => {
  const { b } = bundet();
  const gyldig = { type: "send", generasjon: 1, karakter: "A", kommentar: "" };
  const ugyldige = [
    null,
    "send",
    [gyldig],
    { type: "slett" },
    { type: "toString" },
    { type: "__proto__" },
    { type: "klar", generasjon: 1 },
    { ...gyldig, userId: 1002 },
    { ...gyldig, user_id: 1002 },
    { ...gyldig, kursId: 7 },
    { ...gyldig, assignmentId: 70 },
    JSON.parse('{"type":"send","generasjon":1,"karakter":"A","kommentar":"","__proto__":{"userId":2}}'),
    { type: "send", generasjon: 1, karakter: "A" },
    { type: "send", generasjon: "1", karakter: "A", kommentar: "" },
    { type: "send", generasjon: 1.5, karakter: "A", kommentar: "" },
    { type: "send", generasjon: 1, karakter: 5, kommentar: "" },
    { type: "send", generasjon: 1, karakter: "A", kommentar: null },
    { ...gyldig, karakter: "x".repeat(GRENSER.karakter + 1) },
    { ...gyldig, kommentar: "x".repeat(GRENSER.kommentar + 1) },
    { ...gyldig, karakter: "A\nB" },
    { ...gyldig, karakter: "A\u202eB" },
    { ...gyldig, kommentar: "a\u0000b" },
    { ...gyldig, generasjon: 2 },
    Object.assign(Object.create({ arvet: 1 }), gyldig),
  ];
  for (const m of ugyldige) {
    assert.deepEqual(validerMelding(m, b), { ok: false, grunn: "ugyldig" }, JSON.stringify(m));
  }
  // Grensene selv er lov.
  assert.ok(validerMelding({ ...gyldig, karakter: "x".repeat(GRENSER.karakter), kommentar: "y".repeat(GRENSER.kommentar) }, b).ok);
});

test("validerMelding: gammel generasjon, tomt skjema og ingen binding", () => {
  const panel = lagPanel();
  panel.bind(node());
  const skjema = { type: "send", generasjon: 1, karakter: "A", kommentar: "" };
  panel.bind(node({ userId: 1002, studentName: "Kari" }));
  assert.deepEqual(validerMelding(skjema, panel.gjeldende), { ok: false, grunn: "gammel_generasjon" });
  assert.deepEqual(validerMelding({ ...skjema, generasjon: 2, karakter: "  ", kommentar: " \n " }, panel.gjeldende), { ok: false, grunn: "tomt" });
  assert.equal(feilmelding("tomt", t), t.gradeNothingToSend());
  assert.deepEqual(validerMelding(skjema, null), { ok: false, grunn: "ingen_binding" });
  // Kommentar med bare mellomrom sendes ikke.
  assert.equal(validerMelding({ ...skjema, generasjon: 2, kommentar: "   " }, panel.gjeldende).kommentar, "");
});

// --- 4. Før sending -----------------------------------------------------------

test("vurderFersk: uendret gir send; borte og trukket tilbake gir avbryt", () => {
  const { b } = bundet({ currentGrade: "C" });
  const andre = sub({ userId: 1002, studentName: "Kari", owner: "kari" });
  const v = vurderFersk(b, [andre, sub({ currentGrade: "C" })]);
  assert.equal(v.utfall, "send");
  assert.deepEqual(v.fersk, { canvasNavn: "Ola Nordmann", github: "ola", karakter: "C" });
  assert.deepEqual(vurderFersk(b, [andre]), { utfall: "avbryt", grunn: "borte" });
  assert.deepEqual(vurderFersk(b, [sub({ workflowState: "unsubmitted" })]), { utfall: "avbryt", grunn: "borte" });
  assert.deepEqual(vurderFersk(b, []), { utfall: "avbryt", grunn: "borte" });
  assert.deepEqual(vurderFersk(b, undefined), { utfall: "avbryt", grunn: "borte" });
  assert.deepEqual(vurderFersk(b, [sub(), sub()]), { utfall: "avbryt", grunn: "tvetydig" });
});

test("vurderFersk: endret karakter eller GitHub-eier gir advar", () => {
  const { b } = bundet({ currentGrade: null });
  const v = vurderFersk(b, [sub({ currentGrade: "A", workflowState: "graded" })]);
  assert.equal(v.utfall, "advar");
  assert.deepEqual(v.advarsler, [{ type: "karakter", da: null, na: "A" }]);
  const r = vurderFersk(b, [sub({ owner: "noen-andre", repo: "noen-andre/x" })]);
  assert.deepEqual(r.advarsler, [{ type: "github" }]);
  // Bare store/små bokstaver i GitHub-navnet er ikke en endring.
  assert.equal(vurderFersk(b, [sub({ owner: "Ola" })]).utfall, "send");
});

// --- 5. Bekreftelse -----------------------------------------------------------

test("bekreftelse: CLI-ets oppsummering, navnet fra den ferske innleveringen med bundet user_id", () => {
  const { b } = bundet();
  const v = vurderFersk(b, [sub({ userId: 1002, studentName: "Kari", owner: "kari" }), sub({ studentName: "Ola Nordmann-Hansen" })]);
  const skjema = { karakter: "A", kommentar: "Bra" };
  const k = bekreftelse(b, skjema, v, t);
  assert.equal(k.melding, t.confirmGradeMessage());
  assert.equal(k.knapp, t.vscPanelConfirmButton());
  assert.equal(
    k.detalj,
    `${t.gradeConfirmSummaryHeader()}\n${t.gradeConfirmSummary("Ola Nordmann-Hansen (GitHub: ola)", "Frontend modul 1: HTML", "Kurs A", "A", "Bra")}`
  );
  assert.ok(!k.detalj.includes("Kari"));
  assert.throws(() => bekreftelse(b, skjema, { utfall: "avbryt", grunn: "borte" }, t));
});

test("bekreftelse: advarsler står i detaljen, og lang tilbakemelding kortes ned", () => {
  const { b } = bundet({ currentGrade: "B" });
  const v = vurderFersk(b, [sub({ currentGrade: "C", owner: "annen" })]);
  const lang = "z".repeat(VIS_KOMMENTAR + 10);
  const k = bekreftelse(b, { karakter: "", kommentar: lang }, v, en);
  assert.equal(k.melding, en.vscPanelConfirmWarning());
  assert.ok(k.detalj.includes(en.vscPanelGradeChanged("B", "C")));
  assert.ok(k.detalj.includes(en.vscPanelRepoChanged()));
  assert.ok(k.detalj.includes("(no change)"));
  assert.ok(k.detalj.includes(en.vscPanelCommentTruncated(VIS_KOMMENTAR, VIS_KOMMENTAR + 10)));
  assert.ok(!k.detalj.includes(lang));
});

test("sendArgumenter: ID-ene kommer bare fra bindingen", () => {
  const { b } = bundet();
  assert.deepEqual(sendArgumenter(b, { karakter: "A", kommentar: "" }), [7, 70, 1001, { grade: "A", comment: "" }]);
});

// --- Tekster ------------------------------------------------------------------

test("feilmelding: fast tekst for hver grunn, på begge språk, ukjent grunn gir «ugyldig»", () => {
  const grunner = ["quiz", "ikke_levert", "ingen_binding", "ugyldig_innlevering", "gammel_generasjon", "tomt", "borte", "tvetydig", "ugyldig"];
  for (const s of [t, en]) {
    for (const g of grunner) assert.ok(typeof feilmelding(g, s) === "string" && feilmelding(g, s).length > 0, g);
  }
  assert.equal(feilmelding("<script>", t), t.vscPanelInvalidMessage());
  assert.notEqual(t.vscPanelStale(), en.vscPanelStale());
});

// --- T-A-vaktpost -------------------------------------------------------------

test("T-A: body med unik streng finnes ikke i visningsmodell, bekreftelse eller feilmeldinger", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        { user: { name: "Ola Nordmann" }, user_id: 1001, workflow_state: "submitted", grade: "B", body: `${SENTINEL} https://github.com/ola/x` },
        { user: { name: "Kari" }, user_id: 1002, workflow_state: "unsubmitted", body: SENTINEL },
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  try {
    const subs = await listSubmissions({ canvasUrl: "https://canvas.test.invalid", canvasToken: "x" }, 7, 70);
    const panel = lagPanel();
    // Også en innlevering som (mot formodning) har body med seg, skal ikke lekke.
    const r = panel.bind({ course, assignment, sub: { ...subs[0], body: SENTINEL } });
    assert.ok(r.ok);
    const ikkeLevert = panel.bind({ course, assignment, sub: { ...subs[1], body: SENTINEL } });
    const b = r.binding;
    const modell = visningsmodell(b, t);
    const vSend = vurderFersk(b, subs);
    const vAdvar = vurderFersk(b, [{ ...subs[0], currentGrade: "A", body: SENTINEL }]);
    const vBorte = vurderFersk(b, [{ ...subs[1], body: SENTINEL }]);
    const skjema = validerMelding({ type: "send", generasjon: 1, karakter: "A", kommentar: "ok" }, b);
    const avvist = validerMelding({ type: "send", generasjon: 1, karakter: "A", kommentar: "ok", body: SENTINEL }, b);
    const alt = JSON.stringify({
      b,
      modell,
      ikkeLevert,
      vSend,
      vAdvar,
      vBorte,
      avvist,
      k1: bekreftelse(b, skjema, vSend, t),
      k2: bekreftelse(b, skjema, vAdvar, en),
      feil: ["quiz", "ikke_levert", "ingen_binding", "ugyldig_innlevering", "gammel_generasjon", "tomt", "borte", "tvetydig", "ugyldig", SENTINEL].flatMap((g) => [
        feilmelding(g, t),
        feilmelding(g, en),
      ]),
    });
    assert.ok(alt.includes("Ola Nordmann"), "testen må faktisk se på dataene");
    assert.ok(!alt.includes(SENTINEL), "body lekket ut");
  } finally {
    globalThis.fetch = original;
  }
});
