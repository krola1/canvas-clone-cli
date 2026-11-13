// 0.4.0 (plan G5): vurderingsmatrisen (vscode/src/vurderingsregler.mjs) og vurderingen i
// panelet (vscode/src/panel.mjs: vurderFerskVurdering, bekreftVurdering,
// vurderingArgumenter, hintet i oppgavetekstModell, validering av «vurdering»).
// Tilsynets O4 revidert, O5 utvidet, O11; Lars 1a/2a/3a/11b/12a/«a»; plan v2 rettelse 1, 2 og 5.
// Ingen VS Code, ingen nettverk (fetch byttes ut i PUT-body-testene).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStrings } from "../src/strings.js";
import { gradeSubmission } from "../src/canvas.js";
import {
  GRUPPE_FRITAK_SPERRET,
  VALG,
  HANDLINGER,
  regel,
  handlingerFor,
  tillatteHandlinger,
  vurderHandling,
  oppgaveEndret,
  kjentType,
} from "../vscode/src/vurderingsregler.mjs";
import { QUIZ_LIGNENDE, medNyKarakter } from "../vscode/src/bla.mjs";
import {
  lagPanel,
  validerMelding,
  vurderFerskVurdering,
  bekreftVurdering,
  bekreftelse,
  vurderingArgumenter,
  sendArgumenter,
  svarArgumenter,
  valgNavn,
  etterSending,
  oppgavetekstModell,
  feilmelding,
  MELDINGSFELT,
} from "../vscode/src/panel.mjs";

const t = createStrings(false);
const en = createStrings(true);
const LEVERT = "2026-11-01T08:00:00Z";

// --- Oppgaver (som hentOppgave gir dem) --------------------------------------------

const oppg = (gradingType, over = {}) => ({ gradingType, submissionTypes: ["online_url"], gruppeSamlet: false, gruppeoppgave: false, tekst: { status: "tom" }, ...over });
const O = {
  pf: oppg("pass_fail"),
  poeng: oppg("points"),
  bokstav: oppg("letter_grade"),
  quiz: oppg("points", { submissionTypes: ["online_quiz"] }),
  ekstern: oppg("points", { submissionTypes: ["external_tool"] }),
  eksternPf: oppg("pass_fail", { submissionTypes: ["external_tool"] }),
  samletPf: oppg("pass_fail", { gruppeSamlet: true, gruppeoppgave: true }),
  samletPoeng: oppg("points", { gruppeSamlet: true, gruppeoppgave: true }),
  indivPf: oppg("pass_fail", { gruppeoppgave: true }),
  indivPoeng: oppg("points", { gruppeoppgave: true }),
  ukjent: oppg(null),
};

// Hver celle: [oppgave, levert, fritatt, tillatte handlinger, grunnene for de avviste].
// c = complete, i = incomplete, f = fritatt, t = fritekst, k = kommentar.
const KORT = { c: "complete", i: "incomplete", f: "fritatt", t: "fritekst", k: "kommentar" };
const CELLER = [
  ["pf", true, false, "cifk", { t: "pass_fail" }],
  ["pf", true, true, "cik", { f: "allerede_fritatt", t: "pass_fail" }],
  ["pf", false, false, "cifk", { t: "pass_fail" }],
  ["pf", false, true, "cik", { f: "allerede_fritatt", t: "pass_fail" }],
  ["poeng", true, false, "tk", { c: "ikke_pass_fail", i: "ikke_pass_fail", f: "levert" }],
  ["poeng", true, true, "tk", { c: "ikke_pass_fail", i: "ikke_pass_fail", f: "levert" }],
  ["poeng", false, false, "fk", { c: "ikke_pass_fail", i: "ikke_pass_fail", t: "ikke_levert" }],
  ["poeng", false, true, "k", { c: "ikke_pass_fail", i: "ikke_pass_fail", f: "allerede_fritatt", t: "ikke_levert" }],
  ["bokstav", true, false, "tk", { c: "ikke_pass_fail", i: "ikke_pass_fail", f: "levert" }],
  ["bokstav", false, false, "fk", { c: "ikke_pass_fail", i: "ikke_pass_fail", t: "ikke_levert" }],
  ["quiz", true, false, "tk", { c: "quiz", i: "quiz", f: "quiz" }],
  ["quiz", false, false, "k", { c: "quiz", i: "quiz", f: "quiz", t: "quiz" }],
  ["ekstern", true, false, "tk", { c: "quiz", i: "quiz", f: "quiz" }],
  ["ekstern", false, false, "k", { c: "quiz", i: "quiz", f: "quiz", t: "quiz" }],
  ["ekstern", false, true, "k", { c: "quiz", i: "quiz", f: "quiz", t: "quiz" }],
  ["eksternPf", true, false, "tk", { c: "quiz", i: "quiz", f: "quiz" }],
  ["eksternPf", false, false, "k", { c: "quiz", i: "quiz", f: "quiz", t: "quiz" }],
  ["samletPf", true, false, "k", { c: "gruppe", i: "gruppe", f: "gruppe", t: "gruppe" }],
  ["samletPf", false, false, "k", { c: "gruppe", i: "gruppe", f: "gruppe", t: "gruppe" }],
  ["samletPoeng", true, false, "tk", { c: "gruppe", i: "gruppe", f: "gruppe" }],
  ["samletPoeng", false, false, "k", { c: "gruppe", i: "gruppe", f: "gruppe", t: "gruppe" }],
  ["indivPf", true, false, "cik", { f: "gruppe_d8", t: "pass_fail" }],
  ["indivPf", false, false, "cik", { f: "gruppe_d8", t: "pass_fail" }],
  ["indivPoeng", true, false, "tk", { c: "ikke_pass_fail", i: "ikke_pass_fail", f: "levert" }],
  ["indivPoeng", false, false, "k", { c: "ikke_pass_fail", i: "ikke_pass_fail", f: "gruppe_d8", t: "ikke_levert" }],
  ["ukjent", true, false, "", { c: "type_ukjent", i: "type_ukjent", f: "type_ukjent", t: "type_ukjent", k: "type_ukjent" }],
  ["ukjent", false, false, "", { c: "type_ukjent", i: "type_ukjent", f: "type_ukjent", t: "type_ukjent", k: "type_ukjent" }],
];

test("G5 matrisen: hver celle (oppgavetype × levert × fritatt) gir nøyaktig de tillatte handlingene og fast grunn for resten", () => {
  for (const [navn, levert, fritatt, lov, grunner] of CELLER) {
    const h = handlingerFor(O[navn], { levert, fritatt });
    const tillatt = HANDLINGER.filter((x) => h.tillatt[x]);
    const forventet = [...lov].map((k) => KORT[k]);
    assert.deepEqual(tillatt, HANDLINGER.filter((x) => forventet.includes(x)), `${navn} levert=${levert} fritatt=${fritatt}`);
    const forventedeGrunner = Object.fromEntries(Object.entries(grunner).map(([k, g]) => [KORT[k], g]));
    assert.deepEqual(h.grunner, forventedeGrunner, `${navn} levert=${levert} fritatt=${fritatt}`);
    assert.deepEqual(h.valg, VALG.filter((v) => h.tillatt[v]));
    assert.equal(h.fritekst, h.tillatt.fritekst);
    assert.equal(h.sperre, grunner.f === "gruppe" ? "gruppe" : null);
    // Fritekst og menyvalg er aldri lov samtidig (ett skjema i webviewen).
    assert.ok(!(h.fritekst && h.valg.length > 0), navn);
  }
});

test("G5 matrisen: tilsynets O4-liste (revidert) i klartekst", () => {
  const ikke = { levert: false, fritatt: false };
  const levert = { levert: true, fritatt: false };
  assert.deepEqual(regel(O.poeng, levert, "fritatt"), { ok: false, grunn: "levert" }, "fritatt på levert poengoppgave avvises (2a)");
  assert.deepEqual(regel(O.poeng, ikke, "fritekst"), { ok: false, grunn: "ikke_levert" }, "fritekst på ikke-levert poengoppgave avvises");
  assert.deepEqual(regel(O.poeng, ikke, "complete"), { ok: false, grunn: "ikke_pass_fail" }, "complete på ikke-levert poengoppgave avvises");
  assert.deepEqual(regel(O.pf, levert, "fritekst"), { ok: false, grunn: "pass_fail" }, "fritekst på pass_fail avvises");
  assert.deepEqual(regel(O.poeng, ikke, "fritatt"), { ok: true });
  assert.deepEqual(regel(O.pf, ikke, "incomplete"), { ok: true });
  assert.deepEqual(regel(O.pf, levert, "fritatt"), { ok: true });
  for (const h of ["bestått", "", "__proto__", undefined]) assert.deepEqual(regel(O.pf, levert, h), { ok: false, grunn: "ugyldig" }, String(h));
});

test("G5 matrisen: et manglende gruppefelt regnes som gruppe (tilsynet, tillegg 2)", () => {
  const { gruppeoppgave, ...utenGruppe } = O.pf;
  const { gruppeSamlet, ...utenSamlet } = O.pf;
  assert.deepEqual(regel(utenGruppe, { levert: false, fritatt: false }, "fritatt"), { ok: false, grunn: "gruppe_d8" });
  assert.deepEqual(regel(utenGruppe, { levert: false, fritatt: false }, "complete"), { ok: true });
  for (const h of VALG) assert.deepEqual(regel(utenSamlet, { levert: true, fritatt: false }, h), { ok: false, grunn: "gruppe" }, h);
});

test("G5 GRUPPE_FRITAK_SPERRET: sann til D8 har bekreftet submitted_at for gruppemedlemmer (O5 utvidet); bare fritatt på individuelt vurdert gruppe påvirkes", () => {
  assert.equal(GRUPPE_FRITAK_SPERRET, true);
  // Cellene konstanten styrer: fritatt på individuelt vurdert gruppeoppgave, ikke levert
  // (pass_fail og poeng) og levert pass_fail. Alt annet er likt med og uten gruppe.
  assert.deepEqual(regel(O.indivPf, { levert: false, fritatt: false }, "fritatt"), { ok: false, grunn: "gruppe_d8" });
  assert.deepEqual(regel(O.indivPf, { levert: true, fritatt: false }, "fritatt"), { ok: false, grunn: "gruppe_d8" });
  assert.deepEqual(regel(O.indivPoeng, { levert: false, fritatt: false }, "fritatt"), { ok: false, grunn: "gruppe_d8" });
  assert.deepEqual(regel(O.pf, { levert: false, fritatt: false }, "fritatt"), { ok: true }, "uten gruppe: lov");
  // Levert poeng/bokstav avvises uansett (2a), før gruppe-regelen.
  assert.deepEqual(regel(O.indivPoeng, { levert: true, fritatt: false }, "fritatt"), { ok: false, grunn: "levert" });
  // Dokumentert i kilden ved konstanten.
  const kilde = readFileSync(new URL("../vscode/src/vurderingsregler.mjs", import.meta.url), "utf8");
  assert.match(kilde, /export const GRUPPE_FRITAK_SPERRET = true;/);
  assert.match(kilde, /D8/);
});

test("G5 O11: quiz-lignende kommer fra QUIZ_LIGNENDE i bla.mjs (ingen egen liste)", () => {
  const kilde = readFileSync(new URL("../vscode/src/vurderingsregler.mjs", import.meta.url), "utf8");
  assert.match(kilde, /import \{ QUIZ_LIGNENDE \} from "\.\/bla\.mjs";/);
  assert.ok(!/"online_quiz"|"external_tool"/.test(kilde), "egen liste over quiz-typer");
  for (const type of QUIZ_LIGNENDE) {
    const o = oppg("pass_fail", { submissionTypes: ["online_url", type] });
    for (const h of VALG) assert.deepEqual(regel(o, { levert: false, fritatt: false }, h), { ok: false, grunn: "quiz" }, `${type} ${h}`);
  }
});

test("G5 rettelse 2: tillatteHandlinger/vurderHandling kaster når submittedAt mangler (aldri en gjetning); null = ikke levert", () => {
  assert.throws(() => tillatteHandlinger(O.poeng, { excused: false }), /submittedAt/);
  assert.throws(() => vurderHandling(O.poeng, { excused: false }, "fritatt"), /submittedAt/);
  assert.deepEqual(tillatteHandlinger(O.poeng, { submittedAt: null, excused: false }).valg, ["fritatt"]);
  assert.equal(tillatteHandlinger(O.poeng, { submittedAt: LEVERT, excused: false }).fritekst, true);
  assert.deepEqual(vurderHandling(O.poeng, { submittedAt: null, excused: true }, "fritatt"), { ok: false, grunn: "allerede_fritatt" });
});

test("G5 oppgaveEndret: type, quiz-status og gruppe-status; tekst og annet teller ikke", () => {
  assert.equal(oppgaveEndret(O.pf, { ...O.pf, tekst: { status: "for_stor" } }), false);
  assert.equal(oppgaveEndret(O.pf, O.poeng), true);
  assert.equal(oppgaveEndret(O.poeng, O.ekstern), true);
  assert.equal(oppgaveEndret(O.pf, O.samletPf), true);
  assert.equal(oppgaveEndret(O.pf, O.indivPf), true);
  assert.equal(oppgaveEndret(O.poeng, { ...O.poeng, submissionTypes: ["online_upload"] }), false);
  assert.equal(kjentType(O.ukjent), false);
  assert.equal(kjentType(null), false);
  assert.equal(kjentType(O.pf), true);
});

// G6 (leveranse-kritiker G5, småting 2): overgangen `samlet(vist) !== samlet(fersk)` er den
// eneste som skiller individuelt vurdert gruppe fra gruppe vurdert samlet; `gruppe()` er sann
// for begge. Uten denne regelen ville et skifte mellom dem ikke avbryte sendingen.
test("G6 oppgaveEndret: individuelt vurdert gruppe ↔ gruppe vurdert samlet er endret (samme gruppe-status)", () => {
  assert.equal(oppgaveEndret(O.indivPf, O.samletPf), true);
  assert.equal(oppgaveEndret(O.samletPf, O.indivPf), true);
  assert.equal(oppgaveEndret(O.indivPoeng, O.samletPoeng), true);
  assert.equal(oppgaveEndret(O.samletPoeng, O.indivPoeng), true);
  // Manglende gruppeSamlet regnes som samlet (tilsynet, tillegg 2).
  assert.equal(oppgaveEndret(O.indivPoeng, { ...O.indivPoeng, gruppeSamlet: undefined }), true);
  assert.equal(oppgaveEndret(O.samletPoeng, { ...O.samletPoeng, gruppeSamlet: undefined }), false);
  // Også gjennom vurderFerskVurdering: vist individuelt vurdert, fersk samlet → avbrudd.
  const b = bundet(sub({ submittedAt: LEVERT }));
  assert.deepEqual(
    vurderFerskVurdering(b, [sub({ submittedAt: LEVERT })], O.samletPoeng, "fritekst", O.indivPoeng),
    { utfall: "avbryt", grunn: "type_endret" }
  );
});

// --- Bindinger og ferske data ------------------------------------------------------

const course = { id: 7, name: "Kurs A" };
const assignment = { id: 70, name: "Oppgave 1", submissionTypes: ["online_url"] };
const sub = (over = {}) => {
  if (over.submittedAt === undefined) throw new Error("fikstur uten submittedAt");
  return { studentName: "Ola Nordmann", workflowState: "submitted", repo: "ola/x", owner: "ola", userId: 1001, currentGrade: null, currentScore: null, excused: false, ...over };
};
const ikkeLevertSub = (over = {}) => sub({ submittedAt: null, workflowState: "unsubmitted", repo: null, owner: null, ...over });
function bundet(s, type) {
  const r = lagPanel().bind({ type: type ?? (s.submittedAt ? "innlevering" : "ikkeLevert"), course, assignment, sub: s });
  assert.ok(r.ok, JSON.stringify(r));
  return r.binding;
}

test("G5 vurderFerskVurdering: avbrudd ved ukjent eller endret type (hint pass_fail, fersk points), tvetydig og borte", () => {
  const b = bundet(sub({ submittedAt: LEVERT }));
  const ferske = [sub({ submittedAt: LEVERT })];
  assert.deepEqual(vurderFerskVurdering(b, ferske, O.ukjent, "fritekst", O.poeng), { utfall: "avbryt", grunn: "type_ukjent" });
  assert.deepEqual(vurderFerskVurdering(b, ferske, O.poeng, "fritekst", null), { utfall: "avbryt", grunn: "type_ukjent" }, "typen aldri vist");
  assert.deepEqual(vurderFerskVurdering(b, ferske, O.poeng, "complete", O.pf), { utfall: "avbryt", grunn: "type_endret" }, "hint pass_fail, fersk points");
  assert.deepEqual(vurderFerskVurdering(b, ferske, O.samletPoeng, "fritekst", O.poeng), { utfall: "avbryt", grunn: "type_endret" });
  assert.deepEqual(vurderFerskVurdering(b, [...ferske, ...ferske], O.poeng, "fritekst", O.poeng), { utfall: "avbryt", grunn: "tvetydig" });
  assert.deepEqual(vurderFerskVurdering(b, [], O.poeng, "fritekst", O.poeng), { utfall: "avbryt", grunn: "borte" });
  assert.deepEqual(vurderFerskVurdering(b, [ikkeLevertSub()], O.poeng, "fritekst", O.poeng), { utfall: "avbryt", grunn: "borte" }, "binding levert, fersk ikke levert");
  assert.throws(() => vurderFerskVurdering(b, ferske, O.poeng, "bestått", O.poeng), /ukjent handling/);
  assert.throws(() => vurderFerskVurdering(b, [{ userId: 1001 }], O.poeng, "fritekst", O.poeng), /submittedAt/, "rettelse 2");
});

test("G5 vurderFerskVurdering: matrisen på FERSK data (fritatt på levert poeng, fritekst/complete på ikke-levert poeng)", () => {
  const levert = bundet(sub({ submittedAt: LEVERT }));
  assert.deepEqual(vurderFerskVurdering(levert, [sub({ submittedAt: LEVERT })], O.poeng, "fritatt", O.poeng), { utfall: "avbryt", grunn: "levert" });
  const ikke = bundet(ikkeLevertSub());
  assert.deepEqual(vurderFerskVurdering(ikke, [ikkeLevertSub()], O.poeng, "complete", O.poeng), { utfall: "avbryt", grunn: "ikke_pass_fail" });
  assert.deepEqual(vurderFerskVurdering(ikke, [ikkeLevertSub()], O.poeng, "fritekst", O.poeng), { utfall: "avbryt", grunn: "ikke_levert" });
  assert.deepEqual(vurderFerskVurdering(ikke, [ikkeLevertSub({ excused: true })], O.poeng, "fritatt", O.poeng), { utfall: "avbryt", grunn: "allerede_fritatt" });
  assert.deepEqual(vurderFerskVurdering(ikke, [ikkeLevertSub()], O.samletPoeng, "fritatt", O.samletPoeng), { utfall: "avbryt", grunn: "gruppe" });
  assert.deepEqual(vurderFerskVurdering(ikke, [ikkeLevertSub()], O.ekstern, "fritatt", O.ekstern), { utfall: "avbryt", grunn: "quiz" });
  const ok = vurderFerskVurdering(ikke, [ikkeLevertSub()], O.poeng, "fritatt", O.poeng);
  assert.equal(ok.utfall, "send");
  assert.deepEqual(ok.oppgave, { passFail: false, gruppeSamlet: false });
  assert.deepEqual(ok.fersk, { canvasNavn: "Ola Nordmann", github: null, karakter: null, score: null, fritatt: false, levert: false });
});

test("G5 Lars «a» / 12a: levert siden visningen: avbrudd på poeng/bokstav, advarsel med ny lenke på pass_fail", () => {
  const ikke = bundet(ikkeLevertSub());
  const naLevert = sub({ submittedAt: LEVERT, repo: "ola/ny", owner: "ola" });
  assert.deepEqual(vurderFerskVurdering(ikke, [naLevert], O.poeng, "fritatt", O.poeng), { utfall: "avbryt", grunn: "levert_siden" });
  assert.deepEqual(vurderFerskVurdering(ikke, [naLevert], O.bokstav, "fritatt", O.bokstav), { utfall: "avbryt", grunn: "levert_siden" });
  const v = vurderFerskVurdering(ikke, [naLevert], O.pf, "complete", O.pf);
  assert.equal(v.utfall, "advar");
  assert.deepEqual(v.advarsler, [{ type: "levert", na: "ola/ny" }]);
  const k = bekreftVurdering(ikke, "complete", "", v, t);
  assert.equal(k.melding, t.vscPanelConfirmWarning());
  assert.match(k.detalj, /levert siden panelet ble vist \(ny GitHub-lenke: ola\/ny\)/);
});

test("G5 12a: advarsel ved endret karakter og endret fritak; endret lenke avbryter for leverte", () => {
  const b = bundet(sub({ submittedAt: LEVERT }));
  const v = vurderFerskVurdering(b, [sub({ submittedAt: LEVERT, currentGrade: "complete", excused: true })], O.pf, "incomplete", O.pf);
  assert.equal(v.utfall, "advar");
  assert.deepEqual(v.advarsler, [
    { type: "karakter", da: null, na: "complete" },
    { type: "fritak", da: false, na: true },
  ]);
  const k = bekreftVurdering(b, "incomplete", "", v, t);
  assert.match(k.detalj, /fritaket er endret i Canvas siden panelet ble vist \(da: ikke fritatt, nå: fritatt\)/);
  assert.match(k.detalj, /^Incomplete — fjerner fritaket\.$/m);
  assert.deepEqual(vurderFerskVurdering(b, [sub({ submittedAt: LEVERT, repo: "ola/annet" })], O.pf, "complete", O.pf), { utfall: "avbryt", grunn: "endret_lenke" });
  // Fritekst: vurderFersk (uendret) + fritak-advarselen.
  const f = vurderFerskVurdering(b, [sub({ submittedAt: LEVERT, excused: true })], O.poeng, "fritekst", O.poeng);
  assert.equal(f.utfall, "advar");
  assert.deepEqual(f.advarsler, [{ type: "fritak", da: false, na: true }]);
  assert.equal(f.fersk.fritatt, true);
});

test("G5 bekreftVurdering: fritatt på ikke-levert poeng med karakter/score («graded» uten submittedAt): viser den, sier at fritatt fjerner den, og «kan bare angres i Canvas»", () => {
  const papir = ikkeLevertSub({ workflowState: "graded", currentGrade: "B", currentScore: 8 });
  const b = bundet(papir);
  assert.equal(b.levert, false);
  const v = vurderFerskVurdering(b, [papir], O.poeng, "fritatt", O.poeng);
  assert.equal(v.utfall, "send");
  for (const [s, engelsk] of [[t, false], [en, true]]) {
    const k = bekreftVurdering(b, "fritatt", "", v, s);
    assert.equal(k.melding, s.confirmGradeMessage());
    assert.equal(k.knapp, s.vscPanelConfirmButton());
    const linjer = k.detalj.split("\n");
    assert.equal(linjer[0], s.vscPanelConfirmCurrentGrade("B / 8"));
    for (const l of [s.vscReplyConfirmNotSubmitted(), s.vscConfirmExcused(), s.vscConfirmRemovesGrade("B / 8"), s.vscConfirmUndoOnlyInCanvas()]) {
      assert.ok(linjer.includes(l), `${engelsk}: mangler «${l}» i ${k.detalj}`);
    }
    assert.match(k.detalj, /Ola Nordmann/);
  }
  // pass_fail: kan angres i utvidelsen, så ingen «kan bare angres i Canvas».
  const pf = vurderFerskVurdering(b, [papir], O.pf, "fritatt", O.pf);
  assert.ok(!bekreftVurdering(b, "fritatt", "", pf, t).detalj.includes(t.vscConfirmUndoOnlyInCanvas()));
  // Uten karakter eller score: ingen «Nåværende» og ingen «Fjerner».
  const tom = ikkeLevertSub();
  const k = bekreftVurdering(bundet(tom), "fritatt", "", vurderFerskVurdering(bundet(tom), [tom], O.poeng, "fritatt", O.poeng), t);
  assert.ok(!/Nåværende karakter|Fjerner nåværende/.test(k.detalj), k.detalj);
  assert.throws(() => bekreftVurdering(b, "fritatt", "", { utfall: "avbryt", grunn: "borte" }, t));
});

test("G5 bekreftelse (fritekst, rettelse 1): «Karakteren fjerner fritaket» bare når eleven er fritatt og det sendes en karakter", () => {
  const b = bundet(sub({ submittedAt: LEVERT, excused: true }));
  const v = vurderFerskVurdering(b, [sub({ submittedAt: LEVERT, excused: true })], O.poeng, "fritekst", O.poeng);
  assert.equal(v.utfall, "send");
  assert.ok(bekreftelse(b, { karakter: "8", kommentar: "" }, v, t).detalj.includes(t.vscConfirmGradeRemovesExcuse()));
  assert.ok(!bekreftelse(b, { karakter: "", kommentar: "Hei" }, v, t).detalj.includes(t.vscConfirmGradeRemovesExcuse()));
  const ikkeFritatt = bundet(sub({ submittedAt: LEVERT }));
  const v2 = vurderFerskVurdering(ikkeFritatt, [sub({ submittedAt: LEVERT })], O.poeng, "fritekst", O.poeng);
  assert.ok(!bekreftelse(ikkeFritatt, { karakter: "8", kommentar: "" }, v2, t).detalj.includes(t.vscConfirmGradeRemovesExcuse()));
});

// --- Argumenter og PUT-body ----------------------------------------------------------

test("G5 vurderingArgumenter: fritatt = bare excuse:true; complete/incomplete = grade + excuse:false; gruppe samlet kaster", () => {
  const b = bundet(ikkeLevertSub());
  assert.deepEqual(vurderingArgumenter(b, "fritatt", "", { gruppeSamlet: false }), [7, 70, 1001, { excuse: true, comment: "" }]);
  assert.deepEqual(vurderingArgumenter(b, "complete", "Bra", { gruppeSamlet: false }), [7, 70, 1001, { grade: "complete", excuse: false, comment: "Bra" }]);
  assert.deepEqual(vurderingArgumenter(b, "incomplete", "", { gruppeSamlet: false }), [7, 70, 1001, { grade: "incomplete", excuse: false, comment: "" }]);
  assert.throws(() => vurderingArgumenter(b, "fritatt", "", { gruppeSamlet: true }), /gruppe/);
  assert.throws(() => vurderingArgumenter(b, "fritatt", ""), /gruppe/, "ukjent gruppe-status regnes som samlet");
  assert.throws(() => vurderingArgumenter(b, "bestått", "", { gruppeSamlet: false }));
});

async function putBody(args) {
  const original = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (_url, opts) => {
    body = opts.body;
    return { ok: true, status: 200, json: async () => ({ grade: null, workflow_state: "graded", excused: true }) };
  };
  try {
    await gradeSubmission({ canvasUrl: "https://canvas.test.invalid", canvasToken: "tok" }, ...args);
    return body;
  } finally {
    globalThis.fetch = original;
  }
}

test("G5 PUT-body per valg (gjennom gradeSubmission); excuse og karakter aldri samtidig; excuse=false bare med karakter", async () => {
  const b = bundet(ikkeLevertSub());
  const skjema = (args) => Object.fromEntries(new URLSearchParams(args));
  assert.deepEqual(skjema(await putBody(vurderingArgumenter(b, "fritatt", "", { gruppeSamlet: false }))), { "submission[excuse]": "true" });
  assert.deepEqual(skjema(await putBody(vurderingArgumenter(b, "fritatt", "Avtalt", { gruppeSamlet: false }))), { "submission[excuse]": "true", "comment[text_comment]": "Avtalt" });
  assert.deepEqual(skjema(await putBody(vurderingArgumenter(b, "complete", "", { gruppeSamlet: false }))), { "submission[posted_grade]": "complete", "submission[excuse]": "false" });
  assert.deepEqual(skjema(await putBody(vurderingArgumenter(b, "incomplete", "Mangler", { gruppeSamlet: false }))), {
    "submission[posted_grade]": "incomplete",
    "submission[excuse]": "false",
    "comment[text_comment]": "Mangler",
  });
});

test("G5 rettelse 1 (plan O5 [endret]): fritekst med karakter sender posted_grade + excuse=false; bare kommentar på fritatt elev sender ingen excuse", async () => {
  const b = bundet(sub({ submittedAt: LEVERT, excused: true }));
  const skjemaAv = (body) => Object.fromEntries(new URLSearchParams(body));
  assert.deepEqual(skjemaAv(await putBody(sendArgumenter(b, { karakter: "8", kommentar: "" }, { gruppeSamlet: false }))), {
    "submission[posted_grade]": "8",
    "submission[excuse]": "false",
  });
  assert.deepEqual(skjemaAv(await putBody(sendArgumenter(b, { karakter: "A", kommentar: "Bra\nLinje to" }, { gruppeSamlet: false }))), {
    "submission[posted_grade]": "A",
    "submission[excuse]": "false",
    "comment[text_comment]": "Bra\nLinje to",
  });
  // Bare kommentar: ingen excuse, fritaket står (og gradeSubmission ville kastet på excuse:false).
  const bareKommentar = await putBody(sendArgumenter(b, { karakter: "", kommentar: "Bare kommentar" }, { gruppeSamlet: false }));
  assert.deepEqual(skjemaAv(bareKommentar), { "comment[text_comment]": "Bare kommentar" });
  assert.ok(!bareKommentar.includes("excuse"), bareKommentar);
  // «Svar» sender heller aldri excuse.
  assert.ok(!(await putBody(svarArgumenter(b, "Hei"))).includes("excuse"));
  // Gruppe vurdert samlet eller ukjent (rettelse 5): aldri excuse, samme body som 0.3.0.
  for (const gruppeSamlet of [true, undefined]) {
    for (const skjema of [{ karakter: "9", kommentar: "Bra" }, { karakter: "", kommentar: "Hei" }]) {
      const panelet = await putBody(sendArgumenter(b, skjema, { gruppeSamlet }));
      assert.equal(panelet, await putBody([7, 70, 1001, { grade: skjema.karakter, comment: skjema.kommentar }]), JSON.stringify({ skjema, gruppeSamlet }));
      assert.ok(!panelet.includes("excuse"), panelet);
    }
  }
});

test("G5 rettelse 1 / G1b: gradeSubmission kaster ved excuse:false uten karakter, før noe nettkall", async () => {
  const original = globalThis.fetch;
  let kall = 0;
  globalThis.fetch = async () => {
    kall++;
    throw new Error("skal ikke kalles");
  };
  try {
    for (const endring of [{ excuse: false }, { excuse: false, comment: "Hei" }, { excuse: false, grade: "" }]) {
      await assert.rejects(gradeSubmission({ canvasUrl: "https://canvas.test.invalid", canvasToken: "tok" }, 7, 70, 1001, endring), /excuse:false/);
    }
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(kall, 0);
});

test("G5 «allerede fritatt» gjelder bare valget fritatt: levert fritatt poengelev kan få fritekst-karakter (fjerner fritaket); pass_fail complete/incomplete fjerner fritak", () => {
  const fritattLevert = sub({ submittedAt: LEVERT, excused: true });
  const b = bundet(fritattLevert);
  const v = vurderFerskVurdering(b, [fritattLevert], O.poeng, "fritekst", O.poeng);
  assert.equal(v.utfall, "send");
  assert.ok(bekreftelse(b, { karakter: "8", kommentar: "" }, v, t).detalj.includes(t.vscConfirmGradeRemovesExcuse()));
  assert.deepEqual(vurderHandling(O.poeng, fritattLevert, "fritatt"), { ok: false, grunn: "levert" });
  for (const levert of [fritattLevert, ikkeLevertSub({ excused: true })]) {
    const bp = bundet(levert);
    for (const valg of ["complete", "incomplete"]) {
      const vp = vurderFerskVurdering(bp, [levert], O.pf, valg, O.pf);
      assert.equal(vp.utfall, "send", valg);
      assert.ok(bekreftVurdering(bp, valg, "", vp, t).detalj.includes(t.vscConfirmRemovesExcuse(valgNavn(valg, t))), valg);
      assert.deepEqual(vurderingArgumenter(bp, valg, "", { gruppeSamlet: false })[3], { grade: valg, excuse: false, comment: "" });
    }
    assert.deepEqual(vurderHandling(O.pf, levert, "fritatt"), { ok: false, grunn: "allerede_fritatt" });
  }
});

test("G5 etterSending og bindingen: `excused` fra svaret følger med bare når det finnes; treet (medNyKarakter) likeså", () => {
  const b = bundet(ikkeLevertSub());
  assert.deepEqual(etterSending(b, { karakter: "" }, { grade: null, workflow_state: "graded", excused: true, kommentarer: null }), {
    karakter: null,
    status: "graded",
    kommentarer: null,
    excused: true,
  });
  assert.ok(!("excused" in etterSending(b, { karakter: "A" }, { grade: "A", workflow_state: "graded" })));
  const panel = lagPanel();
  const r = panel.bind({ type: "ikkeLevert", course, assignment, sub: ikkeLevertSub() });
  assert.equal(r.binding.fritatt, false);
  assert.equal(panel.etterSending(r.binding, { karakter: null, status: "graded", kommentarer: null, excused: true }).fritatt, true);
  assert.equal(panel.etterSending(r.binding, { karakter: "complete", status: "graded", kommentarer: null }).fritatt, true, "uten excused: uendret");
  const s = ikkeLevertSub();
  assert.equal(medNyKarakter(s, { karakter: null, status: "graded", excused: true }).excused, true);
  assert.equal(medNyKarakter({ ...s, excused: true }, { karakter: "complete", status: "graded", excused: false }).excused, false);
  assert.equal(medNyKarakter({ ...s, excused: true }, { karakter: "A", status: "graded" }).excused, true, "uten excused i svaret: uendret");
});

// --- Webview-meldingen og hintet -----------------------------------------------------

test("G5 validerMelding «vurdering»: nøyaktige felt, valg fra den faste lista, kommentarregler; gjelder også ikke-leverte", () => {
  assert.deepEqual([...MELDINGSFELT.vurdering], ["type", "generasjon", "valg", "kommentar"]);
  const b = bundet(ikkeLevertSub());
  const g = b.generasjon;
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg: "fritatt", kommentar: "  " }, b), { ok: true, type: "vurdering", valg: "fritatt", kommentar: "" });
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg: "complete", kommentar: "Bra\nto" }, b), { ok: true, type: "vurdering", valg: "complete", kommentar: "Bra\nto" });
  for (const valg of ["bestått", "Complete", "fritatt ", "", 1, null, "fritekst", "kommentar"]) {
    assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg, kommentar: "" }, b), { ok: false, grunn: "ugyldig" }, String(valg));
  }
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg: "fritatt", kommentar: "", userId: 1 }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg: "fritatt", kommentar: "x".repeat(8001) }, b), { ok: false, grunn: "ugyldig" });
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg: "fritatt", kommentar: "\u0000" }, b), { ok: false, grunn: "ugyldig" });
  const panel = lagPanel();
  panel.bind({ type: "ikkeLevert", course, assignment, sub: ikkeLevertSub() });
  const ny = panel.bind({ type: "ikkeLevert", course, assignment, sub: ikkeLevertSub() }).binding;
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: ny.generasjon - 1, valg: "fritatt", kommentar: "" }, ny), { ok: false, grunn: "gammel_generasjon" });
  assert.deepEqual(validerMelding({ type: "vurdering", generasjon: g, valg: "fritatt", kommentar: "" }, null), { ok: false, grunn: "ingen_binding" });
});

test("G5 hintet i oppgavetekstModell: handlinger etter matrisen med bindingens tilstand; låsetekst for gruppe og «allerede fritatt»", () => {
  const modell = (s, oppgave) => oppgavetekstModell(bundet(s), { oppgave }, t);
  assert.deepEqual(modell(sub({ submittedAt: LEVERT }), O.pf).handlinger, { fritekst: false, valg: ["complete", "incomplete", "fritatt"] });
  assert.deepEqual(modell(sub({ submittedAt: LEVERT }), O.poeng).handlinger, { fritekst: true, valg: [] });
  assert.deepEqual(modell(ikkeLevertSub(), O.poeng).handlinger, { fritekst: false, valg: ["fritatt"] });
  assert.equal(modell(ikkeLevertSub(), O.poeng).tekster.laast, "");
  const fritatt = modell(ikkeLevertSub({ excused: true }), O.poeng);
  assert.deepEqual(fritatt.handlinger, { fritekst: false, valg: [] });
  assert.equal(fritatt.tekster.laast, t.vscAlreadyExcusedLocked());
  const samlet = modell(sub({ submittedAt: LEVERT }), O.samletPf);
  assert.deepEqual(samlet.handlinger, { fritekst: false, valg: [] });
  assert.equal(samlet.tekster.laast, t.vscGroupGradedTogether());
  const indiv = modell(ikkeLevertSub(), O.indivPf);
  assert.deepEqual(indiv.handlinger, { fritekst: false, valg: ["complete", "incomplete"] });
  // G6: bare fritatt sperret til D8 → menyen uten låsetekst; ingenting mulig → egen D8-tekst.
  assert.equal(indiv.tekster.laast, "", "ingen låsetekst når complete/incomplete står");
  const indivPoeng = modell(ikkeLevertSub(), O.indivPoeng);
  assert.deepEqual(indivPoeng.handlinger, { fritekst: false, valg: [] });
  assert.equal(indivPoeng.tekster.laast, t.vscGroupExcuseBlockedD8());
  assert.notEqual(indivPoeng.tekster.laast, t.vscGroupGradedTogether());
  assert.equal(modell(ikkeLevertSub(), O.ekstern).tekster.laast, t.vscNotSubmittedLocked());
  // Ukjent type: ingen handlinger.
  assert.deepEqual(oppgavetekstModell(bundet(sub({ submittedAt: LEVERT })), { henter: true }, t).handlinger, { fritekst: false, valg: [] });
  assert.deepEqual(modell(sub({ submittedAt: LEVERT }), O.ukjent).handlinger, { fritekst: false, valg: [] });
});

test("G5 faste feilmeldinger for hver grunn (ingen standardtekst), på begge språk", () => {
  for (const grunn of ["type_ukjent", "type_endret", "levert_siden", "allerede_fritatt", "gruppe", "gruppe_d8", "pass_fail", "ikke_pass_fail", "levert", "quiz", "ikke_levert"]) {
    for (const s of [t, en]) {
      const tekst = feilmelding(grunn, s);
      assert.ok(tekst && tekst !== s.vscPanelInvalidMessage(), `${grunn}: ${tekst}`);
    }
  }
  assert.equal(feilmelding("gruppe", t), "Gruppen vurderes samlet — sett vurderingen i Canvas.");
  assert.equal(feilmelding("gruppe_d8", t), "Fritatt er sperret på gruppeoppgaver til det er sjekket mot Canvas.");
  assert.equal(feilmelding("gruppe_d8", en), "Excused is blocked on group assignments until it has been checked against Canvas.");
});

test("G5 riggkopien: erTillattPutBody i provekjoring.mjs er lik den i falsk-canvas.js", () => {
  const funksjon = (fil) => {
    const kilde = readFileSync(new URL(fil, import.meta.url), "utf8");
    const start = kilde.indexOf("const PUT_FELT");
    const slutt = kilde.indexOf("const erTillattKall", start);
    assert.ok(start >= 0 && slutt > start, fil);
    return kilde.slice(start, slutt).trim();
  };
  assert.equal(funksjon("../vscode/scripts/provekjoring.mjs"), funksjon("../vscode/vsc-tests/hjelpere/falsk-canvas.js"));
});
