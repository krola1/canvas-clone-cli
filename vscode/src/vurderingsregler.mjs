// 0.4.0 (plan G5; tilsynets O4 revidert, O5 utvidet, O11; Lars 1a/2a/3a/«a»):
// valideringsmatrisen for vurdering i karakterpanelet. Ren logikk uten import av
// `vscode`, så den kan testes med `node --test` (tests/vscode-vurderingsregler.test.js).
//
// Extension host avgjør på FERSK data: oppgaven fra hentOppgave (src/canvas.js) og
// innleveringen fra listSubmissions(…, { levertOgFritak: true }), begge hentet rett før
// modalen (panel-vindu.js), aldri fra vinduets Map, cache.json eller treets hint.
// Webviewen får bare et hint regnet ut med de samme reglene (panel.mjs,
// oppgavetekstModell), og det hintet avgjør ingenting.
//
// Handlinger:
//   complete / incomplete - posted_grade (pass_fail); fjerner fritak (Lars 3a)
//   fritatt               - submission[excuse]=true, aldri sammen med karakter
//   fritekst              - fri karakter som i 0.3.0; med karakter + excuse=false (rettelse 1)
//   kommentar             - bare kommentar («Svar», 0.3.0)
//
// Matrisen (plan v2, med tilsynets O4 revidert og O5 utvidet):
//   type ukjent (ingen grading_type)  -> ingenting
//   quiz-lignende (QUIZ_LIGNENDE)     -> bare fritekst på levert (som 0.3.0) og kommentar
//   gruppe vurdert samlet             -> bare fritekst på levert poeng/bokstav (som 0.3.0)
//                                        og kommentar; aldri `excuse` (rettelse 5)
//   pass_fail, levert/ikke levert     -> complete, incomplete, fritatt, kommentar
//   poeng/bokstav, levert             -> fritekst, kommentar (fritatt avvises, Lars 2a)
//   poeng/bokstav, ikke levert        -> fritatt, kommentar (Lars 1a: kan bare angres i Canvas)
//   allerede fritatt                  -> fritatt avvises («allerede fritatt»)
//   individuelt vurdert gruppeoppgave -> fritatt sperret så lenge GRUPPE_FRITAK_SPERRET er sann
//                                        (grunn "gruppe_d8", egen tekst; ikke "gruppe")
// «Poeng/bokstav» er alle grading_type unntatt pass_fail (også on_paper/none med karakter:
// kan bare fritas, kjent begrensning, Lars 1a).
import { erLevert } from "./levert.mjs";
import { QUIZ_LIGNENDE } from "./bla.mjs";

// Tilsynets O5 utvidet (R-O16): at Canvas setter `submitted_at` på alle medlemmer av en
// gruppeinnlevering, er ikke bekreftet. Til D8 har bekreftet det, sperres fritatt også på
// gruppeoppgaver der medlemmene vurderes hver for seg (samme faste tekst som en gruppe
// vurdert samlet). Når D8 har bekreftet det: sett til false (én linje), og testen
// «GRUPPE_FRITAK_SPERRET» i tests/vscode-vurderingsregler.test.js viser hvilke celler som
// da åpnes. Gruppe vurdert samlet er sperret uansett (Lars 3a).
export const GRUPPE_FRITAK_SPERRET = true;

// Valgene i nedtrekksmenyen (fast liste, O4). Webviewen sender bare én av disse.
export const VALG = Object.freeze(["complete", "incomplete", "fritatt"]);
export const HANDLINGER = Object.freeze([...VALG, "fritekst", "kommentar"]);

const ja = Object.freeze({ ok: true });
const nei = (grunn) => Object.freeze({ ok: false, grunn });

// Oppgavetypen er kjent: hentOppgave ga en ikke-tom grading_type.
export function kjentType(oppgave) {
  return Boolean(oppgave && typeof oppgave === "object" && typeof oppgave.gradingType === "string" && oppgave.gradingType !== "");
}

export function erQuizLignendeOppgave(oppgave) {
  return Array.isArray(oppgave?.submissionTypes) && oppgave.submissionTypes.some((s) => QUIZ_LIGNENDE.includes(s));
}

// Et manglende felt regnes som gruppe (tilsynet, tillegg 2): bare `false` er «ikke gruppe».
const samlet = (oppgave) => oppgave.gruppeSamlet !== false;
const gruppe = (oppgave) => oppgave.gruppeoppgave !== false || samlet(oppgave);

// Én handling mot oppgaven og elevens tilstand ({ levert, fritatt }, booleans).
// Gir { ok: true } eller { ok: false, grunn } med fast grunn (feilmelding i panel.mjs).
export function regel(oppgave, { levert, fritatt }, handling) {
  if (!HANDLINGER.includes(handling)) return nei("ugyldig");
  if (!kjentType(oppgave)) return nei("type_ukjent");
  if (handling === "kommentar") return ja;
  const passFail = oppgave.gradingType === "pass_fail";
  if (erQuizLignendeOppgave(oppgave)) {
    // O11: ingen nye handlinger på quiz-lignende; fritekst på levert som i 0.3.0.
    return handling === "fritekst" && levert === true ? ja : nei("quiz");
  }
  if (samlet(oppgave)) {
    // Lars 3a: meny og fritatt sperret; fritekst som 0.3.0 bare på levert poeng/bokstav.
    return handling === "fritekst" && levert === true && !passFail ? ja : nei("gruppe");
  }
  switch (handling) {
    case "complete":
    case "incomplete":
      return passFail ? ja : nei("ikke_pass_fail");
    case "fritekst":
      if (passFail) return nei("pass_fail");
      return levert === true ? ja : nei("ikke_levert");
    case "fritatt":
      if (!passFail && levert === true) return nei("levert"); // Lars 2a
      // O5 utvidet: egen grunn, så panelet ikke sier «vurderes samlet» der menyen ellers står
      // (leveranse-kritiker G6).
      if (gruppe(oppgave) && GRUPPE_FRITAK_SPERRET) return nei("gruppe_d8");
      if (fritatt === true) return nei("allerede_fritatt");
      return ja;
    default:
      return nei("ugyldig");
  }
}

// Alle handlinger for oppgaven og tilstanden: { tillatt: { handling: bool }, grunner:
// { handling: grunn }, valg: [lovlige menyvalg i fast rekkefølge], fritekst: bool,
// sperre: "gruppe" når gruppen vurderes samlet, ellers null; D8-sperren gir ikke sperre }.
export function handlingerFor(oppgave, tilstand) {
  const tillatt = {};
  const grunner = {};
  for (const h of HANDLINGER) {
    const r = regel(oppgave, tilstand, h);
    tillatt[h] = r.ok;
    if (!r.ok) grunner[h] = r.grunn;
  }
  return {
    tillatt,
    grunner,
    valg: VALG.filter((v) => tillatt[v]),
    fritekst: tillatt.fritekst,
    sperre: grunner.fritatt === "gruppe" ? "gruppe" : null,
  };
}

// Tilstanden til en fersk innlevering (listSubmissions med { levertOgFritak: true }).
// erLevert kaster når `submittedAt` mangler (rettelse 2): aldri en gjetning.
export function tilstandFra(sub) {
  return { levert: erLevert(sub), fritatt: sub.excused === true };
}

// Planens navn: lovlige handlinger for fersk oppgave og fersk innlevering.
export function tillatteHandlinger(ferskOppgave, ferskSub) {
  return handlingerFor(ferskOppgave, tilstandFra(ferskSub));
}

// Én handling på fersk data.
export function vurderHandling(ferskOppgave, ferskSub, handling) {
  return regel(ferskOppgave, tilstandFra(ferskSub), handling);
}

// Er oppgaven endret på en måte som endrer matrisen, siden panelet viste den?
// (oppgavetype, quiz-status, gruppe-status). Plan G5: da avbrytes sendingen.
export function oppgaveEndret(vist, fersk) {
  return (
    vist.gradingType !== fersk.gradingType ||
    erQuizLignendeOppgave(vist) !== erQuizLignendeOppgave(fersk) ||
    samlet(vist) !== samlet(fersk) ||
    gruppe(vist) !== gruppe(fersk)
  );
}
