// Ren logikk for karakterpanelet i VS Code-utvidelsen (D6a). Ingen import av
// `vscode` her, slik at alt kan testes med `node --test`
// (tests/vscode-panel.test.js; .mjs fordi vscode/package.json ikke har
// "type": "module"). Webview-panelet (D6b) og sendingen (D6c) ligger i
// ./panel-vindu.js og bruker bare funksjonene her.
//
// Flyten (D6b/D6c):
//   1. Læreren velger en innlevering i trevisningen -> `panel.bind(node)`.
//      Hvert forsøk gir en ny generasjon, også når bindingen avvises (quiz,
//      ikke levert), slik at et skjema fra forrige elev aldri kan sendes.
//   2. Webviewen får bare `visningsmodell(binding, t)` (hviteliste, T10/T11).
//      Ny generasjon i modellen betyr nytt, tomt skjema (`skjema` er alltid tomt).
//   3. Hver melding fra webviewen går gjennom `validerMelding(melding, panel.gjeldende)`.
//   4. Før sending: hent innleveringene på nytt (`listSubmissions` med
//      `binding.kursId`/`binding.oppgaveId`) og kjør `vurderFersk(binding, ferske)`.
//      «avbryt» -> vis `feilmelding(grunn, t)`, send ingenting. Ny GitHub-lenke
//      eller eier siden visningen er også «avbryt» (Lars 2026-10-30).
//   5. «send» eller «advar» -> modal med `bekreftelse(binding, skjema, vurdering, t)`
//      (navnet slått opp fra den bundne user_id i den ferske lista, T10).
//      Sjekk at `panel.gjeldende` fortsatt er samme binding etter modalen.
//   6. `gradeSubmission(config, ...sendArgumenter(binding, skjema))`. Én sending om
//      gangen. Suksess -> `panel.etterSending(binding, etterSending(...))`, ny
//      visningsmodell (tomt skjema). Feil -> `sendefeil(resultat, t, token)`.
//
// Tilsynets krav som gjelder her:
// - T-A: `body` leses aldri. Bindingen plukker bare navngitte felt fra
//   innleveringen, og ingen tekst her bygges av noe annet enn dem.
// - T1-V / kritikers B4: bundet til kurs, oppgave og user_id, med
//   generasjonsnummer; webviewen sender aldri ID-er; skjemaet nullstilles.
// - T10: hviteliste til webviewen, skjemavalidering av postMessage, navnet i den
//   endelige bekreftelsen slås opp fra den bundne user_id.
// - T11: visningsmodellen inneholder ingen Canvas-ID-er; feilmeldingene er faste
//   tekster uten innhold fra webviewen eller Canvas.
import { isQuizAssignment, isNeedsGrading } from "../../src/workflow.js";
import { tryggDetalj } from "./oppsett.mjs";

// Lengdegrenser for skjemaet (Lars kan justere, se DECISIONS 2026-10-30 D6a).
// Karakter: Canvas sin posted_grade er et tall, en prosent, en bokstav eller
// «pass/complete»; 50 tegn er god margin. Tilbakemelding: 8000 tegn.
export const GRENSER = Object.freeze({ karakter: 50, kommentar: 8000 });

// Så mange tegn av tilbakemeldingen vises i den modale bekreftelsen.
export const VIS_KOMMENTAR = 500;

// Feltene webviewen får, og ingen andre (T10). Testene sjekker nøyaktig dette settet.
export const VISNINGSFELT = Object.freeze(["type", "generasjon", "kurs", "oppgave", "elev", "karakter", "status", "skjema", "grenser", "tekster"]);

// Meldinger webviewen kan sende, med nøyaktig disse feltene (ingen ID-er).
export const MELDINGSFELT = Object.freeze({
  klar: Object.freeze(["type"]),
  send: Object.freeze(["type", "generasjon", "karakter", "kommentar"]),
});

const erId = (v) => Number.isSafeInteger(v) && v > 0;
const tekst = (v) => (v == null ? "" : String(v));
const karakterVerdi = (v) => (v == null || v === "" ? null : String(v));

// ---------------------------------------------------------------------------
// 1. Binding
// ---------------------------------------------------------------------------

// Lager en binding for én innlevering. `generasjon` gis av kalleren (se
// lagPanel). Gir { ok: true, binding } eller { ok: false, grunn } der grunn er
// "quiz" (samme regel som CLI-ets isQuizAssignment), "ikke_levert" (som
// runGradeFromFlags) eller "ugyldig_innlevering" (mangler gyldige ID-er).
export function bindInnlevering({ course, assignment, sub } = {}, generasjon) {
  if (!course || !assignment || !sub) return { ok: false, grunn: "ugyldig_innlevering" };
  if (isQuizAssignment(assignment)) return { ok: false, grunn: "quiz" };
  const kursId = assignment.courseId ?? course.id;
  const oppgaveId = assignment.id;
  const userId = sub.userId;
  if (!erId(kursId) || !erId(oppgaveId) || !erId(userId) || !erId(generasjon)) {
    return { ok: false, grunn: "ugyldig_innlevering" };
  }
  if (sub.workflowState === "unsubmitted") return { ok: false, grunn: "ikke_levert" };
  // Bare navngitte felt; aldri `...sub` (T-A: body skal aldri følge med).
  const binding = Object.freeze({
    generasjon,
    kursId,
    oppgaveId,
    userId,
    kursnavn: tekst(assignment.courseName ?? course.name),
    oppgavenavn: tekst(assignment.name),
    canvasNavn: tekst(sub.studentName),
    github: sub.owner ? String(sub.owner) : null,
    // «eier/repo» som extractRepo fant (ikke body). Brukes bare av vurderFersk.
    repo: sub.repo ? String(sub.repo) : null,
    karakter: karakterVerdi(sub.currentGrade),
    status: tekst(sub.workflowState),
  });
  return { ok: true, binding };
}

// Ett panel, én gjeldende binding. Generasjonen øker ved hvert bind-forsøk og
// ved `losne()`, også når bindingen avvises; en avvist binding fjerner den
// forrige (panelet skal aldri vise én elev og sende til en annen).
export function lagPanel() {
  let generasjon = 0;
  let gjeldende = null;
  return {
    bind(node) {
      generasjon += 1;
      const r = bindInnlevering(node, generasjon);
      gjeldende = r.ok ? r.binding : null;
      return r.ok ? r : { ...r, generasjon };
    },
    losne() {
      generasjon += 1;
      gjeldende = null;
    },
    // Etter en vellykket sending (D6c): samme binding og generasjon, ny karakter og
    // status. Bare hvis `binding` fortsatt er den gjeldende; gir den nye bindingen
    // eller null.
    etterSending(binding, { karakter, status }) {
      if (!binding || gjeldende !== binding) return null;
      gjeldende = Object.freeze({ ...binding, karakter, status });
      return gjeldende;
    },
    get gjeldende() {
      return gjeldende;
    },
    get generasjon() {
      return generasjon;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Visningsmodell til webviewen (hviteliste)
// ---------------------------------------------------------------------------

export function statusTekst(status, t) {
  if (isNeedsGrading({ workflowState: status })) return t.filterNeedsGrading();
  if (status === "graded") return t.vscGraded();
  return tekst(status);
}

// Alt webviewen får. Ingen Canvas-ID-er, ingen user_id, aldri body. `skjema` er
// alltid tomt: webviewen setter skjemaet fra modellen, så ny generasjon gir
// nullstilt skjema (B4).
export function visningsmodell(binding, t) {
  if (!binding) return null;
  return {
    type: "vis",
    generasjon: binding.generasjon,
    kurs: binding.kursnavn,
    oppgave: binding.oppgavenavn,
    elev: t.gradeStudentLabel(binding.canvasNavn, binding.github),
    karakter: t.currentGradeDisplay(binding.karakter),
    status: statusTekst(binding.status, t),
    skjema: { karakter: "", kommentar: "" },
    grenser: { karakter: GRENSER.karakter, kommentar: GRENSER.kommentar },
    tekster: {
      tittel: t.vscPanelTitle(),
      kurs: t.vscPanelCourse(),
      oppgave: t.vscPanelAssignment(),
      elev: t.vscPanelStudent(),
      status: t.vscPanelStatus(),
      karakterFelt: t.vscPanelGradeField(),
      kommentarFelt: t.vscPanelCommentField(),
      send: t.vscPanelSend(),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Skjemavalidering av meldinger fra webviewen
// ---------------------------------------------------------------------------

// Karakter: ingen kontrolltegn, linjeskift, retningsoverstyring eller usynlige
// tegn som nullbredde, retningsmerker, ordskjøt, BOM og U+061C (bekreftelsen
// skal vise nøyaktig det som sendes).
const ULOVLIG_KARAKTER = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/;
// Tilbakemelding: linjeskift og tab er lov, andre kontrolltegn ikke.
const ULOVLIG_KOMMENTAR = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

const ugyldig = { ok: false, grunn: "ugyldig" };

function vanligObjekt(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function noyaktigeFelt(melding, felt) {
  const egne = Reflect.ownKeys(melding);
  return egne.length === felt.length && felt.every((f) => Object.prototype.hasOwnProperty.call(melding, f));
}

// Gir { ok: true, type: "klar" }, { ok: true, type: "send", karakter, kommentar }
// eller { ok: false, grunn } der grunn er "ugyldig", "ingen_binding",
// "gammel_generasjon" eller "tomt". Karakteren trimmes; en tilbakemelding med
// bare mellomrom regnes som tom.
export function validerMelding(melding, binding) {
  if (!vanligObjekt(melding)) return ugyldig;
  const felt = Object.prototype.hasOwnProperty.call(MELDINGSFELT, melding.type) ? MELDINGSFELT[melding.type] : null;
  if (typeof melding.type !== "string" || !felt || !noyaktigeFelt(melding, felt)) return ugyldig;
  if (melding.type === "klar") return { ok: true, type: "klar" };

  const { generasjon, karakter, kommentar } = melding;
  if (!erId(generasjon) || typeof karakter !== "string" || typeof kommentar !== "string") return ugyldig;
  if (karakter.length > GRENSER.karakter || kommentar.length > GRENSER.kommentar) return ugyldig;
  if (ULOVLIG_KARAKTER.test(karakter) || ULOVLIG_KOMMENTAR.test(kommentar)) return ugyldig;
  if (!binding) return { ok: false, grunn: "ingen_binding" };
  if (generasjon < binding.generasjon) return { ok: false, grunn: "gammel_generasjon" };
  if (generasjon !== binding.generasjon) return ugyldig;

  const k = karakter.trim();
  const c = kommentar.trim() === "" ? "" : kommentar;
  if (!k && !c) return { ok: false, grunn: "tomt" };
  return { ok: true, type: "send", karakter: k, kommentar: c };
}

// ---------------------------------------------------------------------------
// 4. Før sending: sammenlign med fersk innlevering fra Canvas
// ---------------------------------------------------------------------------

// `ferske` er resultatet av listSubmissions(config, binding.kursId, binding.oppgaveId).
// Utfall:
//   avbryt / borte      - ingen innlevering med samme user_id, eller den er
//                         trukket tilbake (unsubmitted): ingenting å rette.
//   avbryt / tvetydig   - flere med samme user_id (skal ikke skje): send aldri på gjetning.
//   avbryt / endret_lenke - ny GitHub-lenke eller eier siden visningen (Lars
//                         2026-10-30): læreren må åpne eleven på nytt fra treet.
//   advar               - karakteren er endret siden visningen: læreren må
//                         bekrefte med advarselen i modalen.
//   send                - uendret; vanlig bekreftelse.
// `fersk` har bare navngitte felt, slått opp på den bundne user_id.
export function vurderFersk(binding, ferske) {
  const treff = (Array.isArray(ferske) ? ferske : []).filter((s) => s && s.userId === binding.userId);
  if (treff.length > 1) return { utfall: "avbryt", grunn: "tvetydig" };
  const s = treff[0];
  if (!s || s.workflowState === "unsubmitted") return { utfall: "avbryt", grunn: "borte" };
  // GitHub skiller ikke mellom store og små bokstaver i eier og repo.
  const lik = (a, b) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  if (!lik(s.owner, binding.github) || !lik(s.repo, binding.repo)) return { utfall: "avbryt", grunn: "endret_lenke" };
  const fersk = {
    canvasNavn: tekst(s.studentName),
    github: s.owner ? String(s.owner) : null,
    karakter: karakterVerdi(s.currentGrade),
  };
  const advarsler = [];
  if (fersk.karakter !== binding.karakter) advarsler.push({ type: "karakter", da: binding.karakter, na: fersk.karakter });
  return { utfall: advarsler.length > 0 ? "advar" : "send", fersk, advarsler };
}

// ---------------------------------------------------------------------------
// 5. Bekreftelsestekst (modal i extension host)
// ---------------------------------------------------------------------------

function kortKommentar(kommentar, t) {
  if (kommentar.length <= VIS_KOMMENTAR) return kommentar;
  return `${kommentar.slice(0, VIS_KOMMENTAR)}${t.vscPanelCommentTruncated(VIS_KOMMENTAR, kommentar.length)}`;
}

// { melding, detalj, knapp } til showWarningMessage(melding, { modal: true, detail: detalj }, knapp).
// `skjema` er det validerMelding ga ({ karakter, kommentar }). Navnet kommer fra
// den ferske innleveringen med den bundne user_id, aldri fra webviewen.
// Oppsummeringen har CLI-ets format (gradeConfirmSummary).
export function bekreftelse(binding, skjema, vurdering, t) {
  if (!vurdering || (vurdering.utfall !== "send" && vurdering.utfall !== "advar")) {
    throw new Error("bekreftelse krever utfall send eller advar");
  }
  const { fersk, advarsler } = vurdering;
  const sammendrag = t.gradeConfirmSummary(
    t.gradeStudentLabel(fersk.canvasNavn, fersk.github),
    binding.oppgavenavn,
    binding.kursnavn,
    skjema.karakter,
    kortKommentar(skjema.kommentar, t)
  );
  const linjer = advarsler.map((a) => t.vscPanelGradeChanged(a.da, a.na));
  return {
    melding: advarsler.length > 0 ? t.vscPanelConfirmWarning() : t.confirmGradeMessage(),
    detalj: [t.gradeConfirmSummaryHeader(), sammendrag, ...(linjer.length ? ["", ...linjer] : [])].join("\n"),
    knapp: t.vscPanelConfirmButton(),
  };
}

// Argumentene til gradeSubmission(config, kursId, oppgaveId, userId, endring).
// ID-ene kommer bare fra bindingen.
export function sendArgumenter(binding, skjema) {
  return [binding.kursId, binding.oppgaveId, binding.userId, { grade: skjema.karakter, comment: skjema.kommentar }];
}

// Karakter og status etter en vellykket gradeSubmission. Canvas svarer med hele
// innleveringen (også `body`); bare `grade` og `workflow_state` leses (T-A).
// Mangler de i svaret: det som ble sendt, ellers det bindingen hadde.
export function etterSending(binding, skjema, submission) {
  const s = submission && typeof submission === "object" ? submission : {};
  const harKarakter = Object.prototype.hasOwnProperty.call(s, "grade");
  return {
    karakter: harKarakter ? karakterVerdi(s.grade) : skjema.karakter ? skjema.karakter : binding.karakter,
    status: typeof s.workflow_state === "string" ? s.workflow_state : binding.status,
  };
}

// Feilmeldingen når gradeSubmission gir { ok: false, reason, detail }. Bare
// «HTTP nnn» eller nettverksfeilens tekst (med tokenet vasket bort) vises; annen
// detalj (f.eks. en JSON-feil som kan sitere svaret fra Canvas) byttes ut med «?»
// (tryggDetalj i ./oppsett.mjs, samme filter som for feil fra listSubmissions).
export function sendefeil(resultat, t, token) {
  return t.gradeFailed(resultat?.reason, tryggDetalj(resultat, token));
}

// ---------------------------------------------------------------------------
// 6. Faste feilmeldinger (ingen innhold fra webviewen eller Canvas)
// ---------------------------------------------------------------------------

export function feilmelding(grunn, t) {
  switch (grunn) {
    case "quiz":
      return t.quizGradingNotSupported();
    case "ikke_levert":
      return t.vscPanelNotSubmitted();
    case "ingen_binding":
    case "ugyldig_innlevering":
      return t.vscPanelNoBinding();
    case "gammel_generasjon":
      return t.vscPanelStale();
    case "tomt":
      return t.gradeNothingToSend();
    case "borte":
      return t.vscPanelSubmissionGone();
    case "tvetydig":
      return t.vscPanelSubmissionAmbiguous();
    case "endret_lenke":
      return t.vscPanelSubmissionChanged();
    case "opptatt":
      return t.vscPanelSendBusy();
    default:
      return t.vscPanelInvalidMessage();
  }
}
