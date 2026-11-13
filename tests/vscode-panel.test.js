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
  etterSending,
  sendefeil,
  feilmelding,
  MELDINGSFELT,
  TRADFELT,
  TRADMELDINGSFELT,
  SENDTFELT,
  TRAD_MAKS,
  VIS_SVAR,
  tradModell,
  sendtModell,
  vurderFerskSvar,
  bekreftSvar,
  svarArgumenter,
  formaterTid,
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
  assert.deepEqual(m.grenser, { karakter: GRENSER.karakter, kommentar: GRENSER.kommentar, svar: GRENSER.svar });
  assert.equal(m.kanSetteKarakter, true);
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
  assert.deepEqual(Object.keys(b).sort(), [
    "canvasNavn",
    "generasjon",
    "github",
    "karakter",
    "kommentarer",
    "kursId",
    "kursnavn",
    "levert",
    "oppgaveId",
    "oppgavenavn",
    "repo",
    "status",
    "userId",
  ]);
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

test("validerMelding: usynlige tegn i karakteren avvises (modalen skal vise nøyaktig det som sendes)", () => {
  const { b } = bundet();
  const usynlige = [
    0x061c,
    ...Array.from({ length: 0x200f - 0x200b + 1 }, (_, i) => 0x200b + i),
    ...Array.from({ length: 0x202f - 0x2028 + 1 }, (_, i) => 0x2028 + i),
    ...Array.from({ length: 0x206f - 0x2060 + 1 }, (_, i) => 0x2060 + i),
    0xfeff,
  ];
  for (const kode of usynlige) {
    const karakter = `A${String.fromCharCode(kode)}`;
    assert.deepEqual(validerMelding({ type: "send", generasjon: 1, karakter, kommentar: "" }, b), { ok: false, grunn: "ugyldig" }, kode.toString(16));
  }
  // Vanlige tegn i en karakter er fortsatt lov, også utenfor ASCII.
  for (const karakter of ["A", "85%", "4,5", "bestått", "pass", "B+"]) {
    assert.equal(validerMelding({ type: "send", generasjon: 1, karakter, kommentar: "" }, b).ok, true, karakter);
  }
  // Tilbakemeldingen har sin egen regel (uendret): nullbredde-tegn der er ikke avvist.
  assert.equal(validerMelding({ type: "send", generasjon: 1, karakter: "A", kommentar: "x\u200by" }, b).ok, true);
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

test("vurderFersk: endret karakter gir advar", () => {
  const { b } = bundet({ currentGrade: null });
  const v = vurderFersk(b, [sub({ currentGrade: "A", workflowState: "graded" })]);
  assert.equal(v.utfall, "advar");
  assert.deepEqual(v.advarsler, [{ type: "karakter", da: null, na: "A" }]);
});

test("vurderFersk: ny GitHub-lenke eller eier siden visningen gir avbryt (Lars 2026-10-30)", () => {
  const { b } = bundet({ currentGrade: "B" });
  const avbryt = { utfall: "avbryt", grunn: "endret_lenke" };
  // Ny eier.
  assert.deepEqual(vurderFersk(b, [sub({ owner: "noen-andre", repo: "noen-andre/x", currentGrade: "B" })]), avbryt);
  // Samme eier, nytt repo.
  assert.deepEqual(vurderFersk(b, [sub({ repo: "ola/y", currentGrade: "B" })]), avbryt);
  // Lenken er fjernet, eller kommet til der det ikke var noen.
  assert.deepEqual(vurderFersk(b, [sub({ owner: null, repo: null, currentGrade: "B" })]), avbryt);
  const { b: utenLenke } = bundet({ owner: null, repo: null });
  assert.deepEqual(vurderFersk(utenLenke, [sub()]), avbryt);
  assert.equal(vurderFersk(utenLenke, [sub({ owner: null, repo: null })]).utfall, "send");
  // Avbrudd går foran advarsel om karakter.
  assert.deepEqual(vurderFersk(b, [sub({ owner: "annen", repo: "annen/x", currentGrade: "C" })]), avbryt);
  // Bare store/små bokstaver i eier eller repo er ikke en endring.
  assert.equal(vurderFersk(b, [sub({ owner: "Ola", repo: "Ola/X", currentGrade: "B" })]).utfall, "send");
  assert.equal(feilmelding("endret_lenke", t), t.vscPanelSubmissionChanged());
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
  const v = vurderFersk(b, [sub({ currentGrade: "C" })]);
  const lang = "z".repeat(VIS_KOMMENTAR + 10);
  const k = bekreftelse(b, { karakter: "", kommentar: lang }, v, en);
  assert.equal(k.melding, en.vscPanelConfirmWarning());
  assert.ok(k.detalj.includes(en.vscPanelGradeChanged("B", "C")));
  assert.ok(!k.detalj.includes(en.vscPanelRepoChanged()), "ny lenke er avbrudd, ikke advarsel");
  assert.ok(k.detalj.includes("(no change)"));
  assert.ok(k.detalj.includes(en.vscPanelCommentTruncated(VIS_KOMMENTAR, VIS_KOMMENTAR + 10)));
  assert.ok(!k.detalj.includes(lang));
});

test("bekreftelse (D8-GUI): «Nåværende karakter» øverst fra den ferske innleveringen; ingen karakter gir ingen linje", () => {
  // Har karakter i Canvas, uendret siden visningen: linjen øverst, ingen advarsel.
  const { b } = bundet({ currentGrade: "C" });
  const skjema = { karakter: "A", kommentar: "Bra" };
  const k = bekreftelse(b, skjema, vurderFersk(b, [sub({ currentGrade: "C", workflowState: "graded" })]), t);
  assert.equal(k.melding, t.confirmGradeMessage());
  assert.equal(
    k.detalj,
    `Nåværende karakter: C\n\n${t.gradeConfirmSummaryHeader()}\n${t.gradeConfirmSummary("Ola Nordmann (GitHub: ola)", "Frontend modul 1: HTML", "Kurs A", "A", "Bra")}`
  );
  const kEn = bekreftelse(b, skjema, vurderFersk(b, [sub({ currentGrade: "C" })]), en);
  assert.ok(kEn.detalj.startsWith("Current grade: C\n\n"), kEn.detalj);
  // Ingen karakter i Canvas: ingen linje, verken på norsk eller engelsk.
  const { b: uten } = bundet({ currentGrade: null });
  for (const s of [t, en]) {
    const k0 = bekreftelse(uten, skjema, vurderFersk(uten, [sub()]), s);
    assert.ok(!k0.detalj.includes(s.vscPanelConfirmCurrentGrade("")), k0.detalj);
    assert.ok(k0.detalj.startsWith(s.gradeConfirmSummaryHeader()));
  }
  // Tom streng fra Canvas regnes som ingen karakter (karakterVerdi).
  const k1 = bekreftelse(uten, skjema, vurderFersk(uten, [sub({ currentGrade: "" })]), t);
  assert.ok(!k1.detalj.includes("Nåværende karakter"));
});

test("bekreftelse (D8-GUI): ved endret karakter viser linjen og advarselen samme ferske verdi", () => {
  // Visst B, nå C: «Nåværende karakter: C» øverst og advarselen (da: B, nå: C) nederst, som før.
  const { b } = bundet({ currentGrade: "B" });
  const k = bekreftelse(b, { karakter: "A", kommentar: "" }, vurderFersk(b, [sub({ currentGrade: "C" })]), t);
  assert.equal(k.melding, t.vscPanelConfirmWarning());
  assert.ok(k.detalj.startsWith("Nåværende karakter: C\n"));
  assert.ok(k.detalj.endsWith(`\n\n${t.vscPanelGradeChanged("B", "C")}`));
  assert.ok(!k.detalj.includes("Nåværende karakter: B"));
  // Karakteren er fjernet i Canvas siden visningen: ingen linje, bare advarselen (nå: ingen).
  const k0 = bekreftelse(b, { karakter: "A", kommentar: "" }, vurderFersk(b, [sub({ currentGrade: null })]), t);
  assert.ok(!k0.detalj.includes("Nåværende karakter"));
  assert.ok(k0.detalj.includes(t.vscPanelGradeChanged("B", null)));
});

test("sendArgumenter: ID-ene kommer bare fra bindingen", () => {
  const { b } = bundet();
  assert.deepEqual(sendArgumenter(b, { karakter: "A", kommentar: "" }), [7, 70, 1001, { grade: "A", comment: "" }]);
});

// --- 6. Etter sending (D6c) ---------------------------------------------------

test("etterSending: karakter og status fra Canvas sitt svar, ellers det som ble sendt", () => {
  const { b } = bundet({ currentGrade: "C" });
  // Canvas normaliserer karakteren; svaret har også body, som ikke leses.
  assert.deepEqual(etterSending(b, { karakter: "a", kommentar: "" }, { grade: "A", workflow_state: "graded", body: SENTINEL }), {
    karakter: "A",
    status: "graded",
    kommentarer: null,
  });
  assert.deepEqual(etterSending(b, { karakter: "", kommentar: "Bra" }, { grade: null }), { karakter: null, status: "submitted", kommentarer: null });
  // Uten grade i svaret: det som ble sendt, eller bindingens karakter hvis bare tilbakemelding.
  assert.deepEqual(etterSending(b, { karakter: "B", kommentar: "" }, {}), { karakter: "B", status: "submitted", kommentarer: null });
  assert.deepEqual(etterSending(b, { karakter: "", kommentar: "Bra" }, undefined), { karakter: "C", status: "submitted", kommentarer: null });
  // 0.3.0: tråden fra PUT-svaret (allerede snevret inn i canvas.js) når den er en liste.
  const trad = [{ id: 1, fraEleven: true, forfatternavn: "Ola", tekst: "Hei", tid: null, forsok: 1, vedlegg: [], media: null }];
  assert.deepEqual(etterSending(b, { karakter: "" }, { kommentarer: trad }).kommentarer, trad);
});

test("lagPanel.etterSending: samme binding og generasjon får ny karakter; en gammel binding endrer ingenting", () => {
  const { panel, b } = bundet({ currentGrade: null });
  const ny = panel.etterSending(b, { karakter: "A", status: "graded" });
  assert.equal(panel.gjeldende, ny);
  assert.ok(Object.isFrozen(ny));
  assert.equal(ny.generasjon, b.generasjon);
  assert.equal(ny.userId, b.userId);
  assert.equal(ny.karakter, "A");
  assert.equal(visningsmodell(ny, t).karakter, t.currentGradeDisplay("A"));
  // 0.3.0: samme generasjon er samme elev, også om bindingsobjektet er byttet ut
  // (ny karakter, eller tråden glemt av «Oppdater» mens PUT pågikk).
  assert.equal(panel.etterSending(b, { karakter: "F", status: "graded" }).karakter, "F");
  const ny2 = panel.etterSending(b, { karakter: "A", status: "graded" });
  panel.bind(node({ userId: 1002 }));
  assert.equal(panel.etterSending(ny, { karakter: "F", status: "graded" }), null);
  assert.equal(panel.etterSending(ny2, { karakter: "F", status: "graded" }), null);
  assert.equal(panel.gjeldende.userId, 1002);
  assert.equal(panel.gjeldende.karakter, null);
});

test("sendefeil: bare «HTTP nnn» eller nettverksfeilen, tokenet vasket bort, annet blir «?»", () => {
  assert.equal(sendefeil({ ok: false, reason: "other", detail: "HTTP 500" }, t, "tok"), t.gradeFailed("other", "HTTP 500"));
  assert.equal(sendefeil({ ok: false, reason: "invalid_token", detail: "HTTP 401" }, en, "tok"), en.gradeFailed("invalid_token", "HTTP 401"));
  const nett = sendefeil({ ok: false, reason: "network", detail: "fetch failed hemmelig-token" }, t, "hemmelig-token");
  assert.ok(!nett.includes("hemmelig-token"));
  assert.ok(nett.includes("***"));
  // En JSON-feil kan sitere svaret fra Canvas (og dermed body): vises ikke.
  const json = sendefeil({ ok: false, reason: "other", detail: `Unexpected token 'B', "${SENTINEL}" is not valid JSON` }, t, "tok");
  assert.equal(json, t.gradeFailed("other", "?"));
  assert.equal(feilmelding("opptatt", t), t.vscPanelSendBusy());
});

// --- Tekster ------------------------------------------------------------------

test("feilmelding: fast tekst for hver grunn, på begge språk, ukjent grunn gir «ugyldig»", () => {
  const grunner = ["quiz", "ikke_levert", "ingen_binding", "ugyldig_innlevering", "gammel_generasjon", "tomt", "borte", "tvetydig", "endret_lenke", "opptatt", "ugyldig"];
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
      etter: etterSending(b, skjema, { grade: "A", workflow_state: "graded", body: SENTINEL }),
      sendefeil: sendefeil({ ok: false, reason: "other", detail: SENTINEL }, t, "x"),
      feil: ["quiz", "ikke_levert", "ingen_binding", "ugyldig_innlevering", "gammel_generasjon", "tomt", "borte", "tvetydig", "endret_lenke", "opptatt", "ugyldig", SENTINEL].flatMap((g) => [
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

// --- 0.3.0: kommentartråden, ikke-leverte, «Svar» og «Åpne i Canvas» -----------

const kommentar = (over = {}) => ({
  id: 1,
  fraEleven: true,
  forfatternavn: "Ola Nordmann",
  tekst: "Jeg har rettet nå",
  tid: "2026-11-05T13:04:00Z",
  forsok: 2,
  vedlegg: [{ filnavn: "skjerm.png", type: "image/png" }],
  media: null,
  ...over,
});
const ikkeLevertNode = (over = {}, a = assignment) => ({
  type: "ikkeLevert",
  course,
  assignment: a,
  sub: sub({ workflowState: "unsubmitted", repo: null, owner: null, kommentarer: [kommentar({ fraEleven: false, forfatternavn: "Lærer" })], ...over }),
});

test("0.3.0 binding: ikkeLevert bindes med levert:false og frosset trådkopi; samme elev uten typen avvises fortsatt; quiz avvises", () => {
  const panel = lagPanel();
  const r = panel.bind(ikkeLevertNode({ kommentarer: [kommentar({ ekstra: "X-UKJENT", url: "https://x/?verifier=V" })] }));
  assert.ok(r.ok);
  assert.equal(r.binding.levert, false);
  assert.ok(Object.isFrozen(r.binding.kommentarer) && Object.isFrozen(r.binding.kommentarer[0]) && Object.isFrozen(r.binding.kommentarer[0].vedlegg));
  assert.deepEqual(Object.keys(r.binding.kommentarer[0]).sort(), ["forfatternavn", "forsok", "fraEleven", "id", "media", "tekst", "tid", "vedlegg"]);
  assert.ok(!JSON.stringify(r.binding).includes("X-UKJENT") && !JSON.stringify(r.binding).includes("verifier"));
  const m = visningsmodell(r.binding, t);
  assert.equal(m.kanSetteKarakter, false);
  assert.equal(m.status, t.vscNotSubmittedThread());
  assert.equal(m.tekster.laast, t.vscNotSubmittedLocked());
  // Uten typen `ikkeLevert` (f.eks. «Sett karakter»): som før.
  const { type: _type, ...utenType } = ikkeLevertNode();
  assert.equal(panel.bind(utenType).grunn, "ikke_levert");
  assert.equal(panel.bind({ ...ikkeLevertNode(), type: "innlevering" }).grunn, "ikke_levert");
  assert.equal(panel.bind(ikkeLevertNode({}, { ...assignment, submissionTypes: ["online_quiz"] })).grunn, "quiz");
  // En levert innlevering har levert:true og kommentarer null når tråden ikke er hentet.
  const { b } = bundet();
  assert.equal(b.levert, true);
  assert.equal(b.kommentarer, null);
});

test("0.3.0 ikkeLevert: karakter avvises (ikke_levert); svar godtas", () => {
  const panel = lagPanel();
  const b = panel.bind(ikkeLevertNode()).binding;
  assert.deepEqual(validerMelding({ type: "send", generasjon: b.generasjon, karakter: "A", kommentar: "" }, b), { ok: false, grunn: "ikke_levert" });
  assert.deepEqual(validerMelding({ type: "send", generasjon: b.generasjon, karakter: "", kommentar: "Bra" }, b), { ok: false, grunn: "ikke_levert" });
  assert.deepEqual(validerMelding({ type: "svar", generasjon: b.generasjon, tekst: "Hei" }, b), { ok: true, type: "svar", tekst: "Hei" });
});

test("0.3.0 validerMelding: svar og apneCanvas har nøyaktige felt; ID-er, URL-er, gammel generasjon, lengde og kontrolltegn avvises", () => {
  assert.deepEqual(MELDINGSFELT.svar, ["type", "generasjon", "tekst"]);
  assert.deepEqual(MELDINGSFELT.apneCanvas, ["type", "generasjon"]);
  const { panel, b } = bundet();
  const g = b.generasjon;
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: "Linje 1\n\tLinje 2" }, b), { ok: true, type: "svar", tekst: "Linje 1\n\tLinje 2" });
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: " \n " }, b), { ok: false, grunn: "tomt" });
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: "x".repeat(GRENSER.svar + 1) }, b), { ok: false, grunn: "ugyldig" });
  assert.equal(validerMelding({ type: "svar", generasjon: g, tekst: "x".repeat(GRENSER.svar) }, b).ok, true);
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: "a\u0000b" }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: 5 }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: "Hei", userId: 1002 }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "apneCanvas", generasjon: g }, b), { ok: true, type: "apneCanvas" });
  assert.deepEqual(validerMelding({ type: "apneCanvas", generasjon: g, url: "https://ond.example/" }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "apneCanvas", generasjon: g, nr: 0 }, b), { ok: false, grunn: "ugyldig" });
  const b2 = panel.bind(node({ userId: 1002 })).binding;
  assert.deepEqual(validerMelding({ type: "svar", generasjon: g, tekst: "Hei" }, b2), { ok: false, grunn: "gammel_generasjon" });
  assert.deepEqual(validerMelding({ type: "apneCanvas", generasjon: g }, b2), { ok: false, grunn: "gammel_generasjon" });
  assert.deepEqual(validerMelding({ type: "apneCanvas", generasjon: g }, null), { ok: false, grunn: "ingen_binding" });
});

// 0.4.0 (tilsynets O3): «Åpne oppgaven i Canvas» fra panelet har bare type og
// generasjon; ID-er, URL-er og gammel generasjon avvises, også for ikke-leverte.
test("0.4.0 validerMelding: apneOppgave har nøyaktig type og generasjon; ID-er, URL-er, gammel generasjon og ingen binding avvises", () => {
  assert.deepEqual(MELDINGSFELT.apneOppgave, ["type", "generasjon"]);
  const { panel, b } = bundet();
  const g = b.generasjon;
  assert.deepEqual(validerMelding({ type: "apneOppgave", generasjon: g }, b), { ok: true, type: "apneOppgave" });
  for (const ekstra of [
    { url: "https://ond.example/" },
    { html_url: "https://skole.instructure.com/courses/1/assignments/2" },
    { kursId: 1 },
    { oppgaveId: 2 },
    { nr: 0 },
  ]) {
    assert.deepEqual(validerMelding({ type: "apneOppgave", generasjon: g, ...ekstra }, b), { ok: false, grunn: "ugyldig" }, JSON.stringify(ekstra));
  }
  for (const generasjon of ["1", 0, -1, 1.5, null]) {
    assert.deepEqual(validerMelding({ type: "apneOppgave", generasjon }, b), { ok: false, grunn: "ugyldig" }, String(generasjon));
  }
  assert.deepEqual(validerMelding({ type: "apneOppgave" }, b), { ok: false, grunn: "ugyldig" });
  const b2 = panel.bind(node({ userId: 1002 })).binding;
  assert.deepEqual(validerMelding({ type: "apneOppgave", generasjon: g }, b2), { ok: false, grunn: "gammel_generasjon" });
  assert.deepEqual(validerMelding({ type: "apneOppgave", generasjon: g }, null), { ok: false, grunn: "ingen_binding" });
  const ikke = lagPanel().bind(ikkeLevertNode()).binding;
  assert.deepEqual(validerMelding({ type: "apneOppgave", generasjon: ikke.generasjon }, ikke), { ok: true, type: "apneOppgave" });
});

test("0.3.0 tradModell: nøyaktige felt, ingen ID-er eller URL-er, ferdig formaterte tekster", () => {
  const panel = lagPanel();
  const b = panel.bind(
    node({
      kommentarer: [
        kommentar({ id: 9001, fraEleven: false, forfatternavn: "Lærer Lise", tekst: "Rett lenken", forsok: null, vedlegg: [], media: { type: "audio" } }),
        kommentar({ id: 9002 }),
        kommentar({ id: 9003, forfatternavn: "", media: { type: "video" }, vedlegg: [] }),
      ],
    }),
  ).binding;
  const m = tradModell(b, t);
  assert.deepEqual(Object.keys(m).sort(), [...TRADFELT].sort());
  assert.equal(m.type, "trad");
  assert.equal(m.generasjon, b.generasjon);
  assert.equal(m.status, "ok");
  assert.equal(m.skjulte, 0);
  for (const k of m.meldinger) assert.deepEqual(Object.keys(k).sort(), [...TRADMELDINGSFELT].sort());
  assert.deepEqual(m.meldinger[0], {
    fraEleven: false,
    forfatter: "Lærer Lise",
    tekst: "Rett lenken",
    tid: formaterTid("2026-11-05T13:04:00Z"),
    forsok: "",
    vedlegg: [],
    media: t.vscCommentsAudio(),
  });
  assert.deepEqual(m.meldinger[1].vedlegg, [t.vscCommentsAttachment("skjerm.png")]);
  assert.equal(m.meldinger[1].forsok, t.vscCommentsAttempt(2));
  assert.equal(m.meldinger[2].forfatter, t.vscCommentsUnknownAuthor());
  assert.equal(m.meldinger[2].media, t.vscCommentsVideo());
  assert.equal(m.tekster.eldre, "");
  const json = JSON.stringify(m);
  for (const id of ["9001", "9002", "1001", "70", "https://", "image/png"]) assert.ok(!json.includes(id), `fant ${id}`);
  assert.match(formaterTid("2026-11-05T13:04:00Z"), /^2026-11-0[56] \d{2}:\d{2}$/);
  assert.equal(formaterTid("ikke en tid"), "");
  assert.equal(formaterTid(null), "");
  assert.equal(tradModell(null, t), null);
});

test("0.3.0 tradModell: «ikke hentet» ved null; tom tråd; de siste 100 meldingene, 4000 tegn med fast merke", () => {
  const { b } = bundet();
  const ikke = tradModell(b, t);
  assert.equal(ikke.status, "ikke_hentet");
  assert.deepEqual(ikke.meldinger, []);
  assert.equal(ikke.tekster.ikkeHentet, t.vscCommentsNotLoaded());
  const tom = tradModell(lagPanel().bind(node({ kommentarer: [] })).binding, t);
  assert.equal(tom.status, "ok");
  assert.deepEqual(tom.meldinger, []);
  const mange = Array.from({ length: 105 }, (_, i) => kommentar({ id: i + 1, tekst: i === 104 ? "y".repeat(TRAD_MAKS.tegn + 10) : `melding ${i + 1}` }));
  const m = tradModell(lagPanel().bind(node({ kommentarer: mange })).binding, en);
  assert.equal(m.meldinger.length, TRAD_MAKS.meldinger);
  assert.equal(m.skjulte, 5);
  assert.equal(m.meldinger[0].tekst, "melding 6");
  assert.equal(m.tekster.eldre, en.vscCommentsOlderHidden(5));
  assert.equal(m.meldinger.at(-1).tekst, `${"y".repeat(TRAD_MAKS.tegn)} ${en.vscCommentsTruncated()}`);
});

test("0.3.0 B4: vurderFersk er uendret: ikke levert gir fortsatt «borte»", () => {
  const b = lagPanel().bind(ikkeLevertNode()).binding;
  const s = sub({ workflowState: "unsubmitted", repo: null, owner: null });
  assert.deepEqual(vurderFersk(b, [s]), { utfall: "avbryt", grunn: "borte" });
});

test("0.3.0 vurderFerskSvar: sendes også når ikke levert og ved endret lenke (advarsel); tvetydig og borte avbryter", () => {
  const ikke = lagPanel().bind(ikkeLevertNode()).binding;
  const ferskIkke = sub({ workflowState: "unsubmitted", repo: null, owner: null });
  assert.deepEqual(vurderFerskSvar(ikke, [ferskIkke]), {
    utfall: "send",
    fersk: { canvasNavn: "Ola Nordmann", github: null, levert: false },
    advarsler: [],
  });
  const { b } = bundet();
  assert.equal(vurderFerskSvar(b, [sub({ repo: "OLA/X", owner: "OLA" })]).utfall, "send", "store/små bokstaver er samme lenke");
  assert.deepEqual(vurderFerskSvar(b, [sub({ repo: "ola/nytt", owner: "ola" })]).advarsler, [{ type: "lenke", da: "ola/x", na: "ola/nytt" }]);
  assert.equal(vurderFerskSvar(b, [sub({ repo: null, owner: null })]).utfall, "advar");
  assert.deepEqual(vurderFerskSvar(b, [sub(), sub()]), { utfall: "avbryt", grunn: "tvetydig" });
  assert.deepEqual(vurderFerskSvar(b, [sub({ userId: 1002 })]), { utfall: "avbryt", grunn: "borte" });
  assert.deepEqual(vurderFerskSvar(b, undefined), { utfall: "avbryt", grunn: "borte" });
});

test("0.3.0 bekreftSvar: navnet fra fersk innlevering, «ikke levert», første 300 tegn, lenkeendring og fast linje", () => {
  const ikke = lagPanel().bind(ikkeLevertNode()).binding;
  const v = vurderFerskSvar(ikke, [sub({ workflowState: "unsubmitted", repo: null, owner: null, studentName: "Ola Fersk" })]);
  const lang = `${"a".repeat(VIS_SVAR)}HALE-SOM-IKKE-VISES`;
  const k = bekreftSvar(ikke, lang, v, t);
  assert.equal(k.melding, t.vscReplyConfirmMessage());
  assert.equal(k.knapp, t.vscReplyConfirmButton());
  assert.ok(k.detalj.startsWith(t.vscReplyConfirmNotSubmitted()), k.detalj);
  assert.match(k.detalj, /Ola Fersk/);
  assert.ok(!k.detalj.includes("HALE-SOM-IKKE-VISES"));
  assert.ok(k.detalj.includes(t.vscReplyTruncated(VIS_SVAR, lang.length)));
  assert.ok(k.detalj.endsWith(t.vscReplyConfirmFixed()));
  assert.ok(k.detalj.includes("Frontend modul 1: HTML") && k.detalj.includes("Kurs A"));
  const { b } = bundet();
  const endret = bekreftSvar(b, "Hei", vurderFerskSvar(b, [sub({ repo: "ola/nytt" })]), en);
  assert.ok(endret.detalj.includes(en.vscReplyLinkChanged("ola/x", "ola/nytt")));
  assert.ok(!endret.detalj.includes(en.vscReplyConfirmNotSubmitted()));
  assert.throws(() => bekreftSvar(b, "Hei", { utfall: "avbryt", grunn: "borte" }, t));
});

test("0.3.0 svarArgumenter: ID-ene fra bindingen, bare teksten (ingen karakter, ingen forsøk)", () => {
  const { b } = bundet();
  assert.deepEqual(svarArgumenter(b, "Hei"), [7, 70, 1001, { comment: "Hei" }]);
});

test("0.3.0 sendtModell (B5): nøyaktige felt, ferdig formaterte tekster, bare «svar» eller «skjema»", () => {
  const { b } = bundet({ currentGrade: "A", workflowState: "graded" });
  const m = sendtModell(b, "svar", t);
  assert.deepEqual(Object.keys(m).sort(), [...SENDTFELT].sort());
  assert.deepEqual(m, { type: "sendt", generasjon: b.generasjon, felt: "svar", karakter: t.currentGradeDisplay("A"), status: t.vscGraded() });
  assert.equal(sendtModell(b, "skjema", t).felt, "skjema");
  assert.equal(sendtModell(b, "alt", t), null);
  assert.equal(sendtModell(null, "svar", t), null);
});

test("0.3.0 lagPanel: tråden fra PUT-svaret erstatter den gamle bare når den er en liste; «Oppdater» glemmer den (K9)", () => {
  const panel = lagPanel();
  const b = panel.bind(node({ kommentarer: [kommentar()] })).binding;
  const uendret = panel.etterSending(b, { karakter: null, status: "submitted", kommentarer: null });
  assert.equal(uendret.kommentarer.length, 1, "PUT uten gyldig tråd beholder den gamle");
  const ny = panel.etterSending(b, { karakter: null, status: "submitted", kommentarer: [kommentar(), kommentar({ id: 2, fraEleven: false })] });
  assert.equal(ny.kommentarer.length, 2);
  assert.ok(Object.isFrozen(ny.kommentarer));
  const glemt = panel.glemKommentarer();
  assert.equal(glemt.kommentarer, null);
  assert.equal(glemt.generasjon, b.generasjon);
  assert.equal(tradModell(glemt, t).status, "ikke_hentet");
  panel.losne();
  assert.equal(panel.glemKommentarer(), null);
});

test("0.3.0 K2-vaktpost: Canvas-felt utenfor hvitelisten når aldri bindingen, tråden eller bekreftelsen", async () => {
  const VAKT = ["VERIFIER-VAKT", "UUID-VAKT", "THUMB-VAKT", "PREVIEW-VAKT", "AVATAR-VAKT", "HTMLURL-VAKT", "MEDIAURL-VAKT", "ATTID-777", "https://"];
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          user: { name: "Ola Nordmann" },
          user_id: 1001,
          workflow_state: "unsubmitted",
          body: SENTINEL,
          submission_comments: [
            {
              id: 5,
              author_id: 1001,
              author_name: "Ola Nordmann",
              author: { id: 1001, display_name: "Ola", avatar_image_url: "https://c/AVATAR-VAKT", html_url: "https://c/HTMLURL-VAKT" },
              comment: "KOMMENTAR-VAKTPOST-tekst",
              created_at: "2026-11-05T10:00:00Z",
              attempt: null,
              attachments: [
                { id: "ATTID-777", display_name: "rapport.pdf", filename: "rapport.pdf", "content-type": "application/pdf", url: "https://c/files/1/download?verifier=VERIFIER-VAKT", uuid: "UUID-VAKT", thumbnail_url: "https://c/THUMB-VAKT", preview_url: "https://c/PREVIEW-VAKT" },
              ],
              media_comment: { "content-type": "audio/mp4", display_name: "lyd", media_id: "m1", media_type: "audio", url: "https://c/MEDIAURL-VAKT" },
            },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const subs = await listSubmissions({ canvasUrl: "https://canvas.test.invalid", canvasToken: "x" }, 7, 70, { kommentarer: true });
    const panel = lagPanel();
    const b = panel.bind({ type: "ikkeLevert", course, assignment, sub: subs[0] }).binding;
    const v = vurderFerskSvar(b, subs);
    const alt = JSON.stringify({ subs, b, trad: tradModell(b, t), vis: visningsmodell(b, t), k: bekreftSvar(b, "Hei", v, t), sendt: sendtModell(b, "svar", t) });
    assert.ok(alt.includes("KOMMENTAR-VAKTPOST-tekst") && alt.includes("rapport.pdf"), "testen må faktisk se på tråden");
    for (const vakt of [...VAKT, SENTINEL]) assert.ok(!alt.includes(vakt), `«${vakt}» lekket`);
    // Kommentarteksten finnes bare i tråden, ikke i visningsmodellen eller bekreftelsen.
    for (const del of [visningsmodell(b, t), bekreftSvar(b, "Hei", v, t), sendtModell(b, "svar", t)]) assert.ok(!JSON.stringify(del).includes("KOMMENTAR-VAKTPOST"));
  } finally {
    globalThis.fetch = original;
  }
});
