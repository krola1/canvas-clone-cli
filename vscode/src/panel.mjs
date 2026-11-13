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
//      (navnet slått opp fra den bundne user_id i den ferske lista, T10; D8-GUI:
//      «Nåværende karakter» fra den samme ferske innleveringen, når den har en).
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
// - 0.2.0, GitHub Pages (P3/P9): webviewen sender bare `{ type: "apnePages",
//   generasjon }`; eier/repo slås opp fra bindingen ved klikk. `pagesModell` gir
//   bare en knappetekst (ingen URL) og sendes som egen melding etter `vis`.
// - 0.3.0, kommentartråden (tilsynets K2–K5, K9, K10): bindingen har en frosset
//   kopi av trådens hviteliste fra canvas.js (`kommentarer`, eller null = ikke
//   hentet). `tradModell` er det eneste webviewen får av tråden (egen melding etter
//   `vis`, med generasjon, uten ID-er eller URL-er). Elever som ikke har levert,
//   men har en tråd (nodetype `ikkeLevert`), bindes med `levert: false`: bare lese
//   og svare, aldri karakter. «Svar» (`{ type: "svar", generasjon, tekst }`) går
//   gjennom `vurderFerskSvar` og `bekreftSvar`; «Åpne i Canvas»
//   (`{ type: "apneCanvas", generasjon }`) slår opp ID-ene fra bindingen.
//   `vurderFersk` (karakter) er uendret.
// - 0.4.0, oppgavesiden (tilsynets O3): «Åpne oppgaven i Canvas» sender bare
//   `{ type: "apneOppgave", generasjon }`; kurs- og oppgave-ID slås opp fra bindingen.
// - 0.4.0 (plan G3, tilsynets O4 revidert): «levert» er `erLevert` (./levert.mjs) i
//   bindInnlevering, vurderFersk (bare predikatet, B4), vurderFerskSvar og statustekst.
//   Innleveringene må være hentet med `{ levertOgFritak: true }` (ellers kaster erLevert).
//   `ikkeLevert`-rader (alle i «Ikke levert (N)») kan fortsatt bare lese og svare.
// - 0.4.0 (plan G4, tilsynets O1/O2/O7): oppgaveteksten kommer som egen melding
//   `oppgavetekst` (`oppgavetekstModell`, felthviteliste OPPGAVETEKSTFELT) etter `vis`.
//   Modellen fra hentOppgave (src/canvas.js) valideres på nytt her: bare blokktypene og
//   feltene fra den faste lista, ukjente typer og felt faller bort. Ingen URL-er, ingen
//   HTML, ingen ID-er. `typeKjent` sier om oppgavetypen er hentet (skjemaet låses ellers).
// - 0.4.0 (plan G5, tilsynets O4 revidert, O5, O11; Lars 1a/2a/3a/11b/12a/«a»): vurdering
//   etter matrisen i ./vurderingsregler.mjs. Bindingen får `fritatt` (fra treet). Webviewen
//   får et hint (`handlinger` i `oppgavetekst`: fritekst og/eller menyvalg) regnet ut fra
//   oppgaven den viste; ny melding `{ type: "vurdering", generasjon, valg, kommentar }` med
//   `valg` fra den faste lista VALG. Før modalen avgjør `vurderFerskVurdering` på FERSK
//   oppgave og innlevering (begge hentet direkte fra Canvas i panel-vindu.js): avbryt ved
//   endret oppgavetype/quiz/gruppe siden visningen, ukjent type, tvetydig/borte, levert
//   siden visningen på poeng/bokstav (Lars «a»), og når matrisen avviser handlingen;
//   advarsel (12a) ved endret karakter, endret fritak og (pass_fail) levert siden visningen.
//   `bekreftVurdering` er samme modal som i dag (11b) med handlingen i klartekst.
//   `vurderingArgumenter`: fritatt = bare `excuse: true` (+ kommentar), complete/incomplete =
//   `posted_grade` + `excuse: false`; aldri `excuse` ved gruppe vurdert samlet. Fritekst
//   (`sendArgumenter`, plan O5 [endret] og rettelse 1): med karakter `posted_grade` +
//   `excuse: false`; bare kommentar sender ingen `excuse` (fritaket står); gruppe vurdert
//   samlet aldri `excuse` (rettelse 5). T17 gjelder CLI-et, som er uendret.
import { isQuizAssignment, isNeedsGrading } from "../../src/workflow.js";
import { createStrings } from "../../src/strings.js";
import { tryggDetalj, canvasFeil } from "./oppsett.mjs";
import { erLevert } from "./levert.mjs";
import { lenkeFor } from "./pages.mjs";
import { VALG, handlingerFor, kjentType, vurderHandling, oppgaveEndret } from "./vurderingsregler.mjs";

// Lengdegrenser for skjemaet (Lars kan justere, se DECISIONS 2026-10-30 D6a).
// Karakter: Canvas sin posted_grade er et tall, en prosent, en bokstav eller
// «pass/complete»; 50 tegn er god margin. Tilbakemelding: 8000 tegn.
export const GRENSER = Object.freeze({ karakter: 50, kommentar: 8000, svar: 8000 });

// Så mange tegn av tilbakemeldingen vises i den modale bekreftelsen.
export const VIS_KOMMENTAR = 500;

// 0.3.0: så mange tegn av et svar vises i den modale bekreftelsen.
export const VIS_SVAR = 300;

// 0.3.0 (K3): så mange meldinger og tegn per melding sendes til webviewen.
export const TRAD_MAKS = Object.freeze({ meldinger: 100, tegn: 4000 });

// Feltene webviewen får, og ingen andre (T10). Testene sjekker nøyaktig dette settet.
export const VISNINGSFELT = Object.freeze(["type", "generasjon", "kurs", "oppgave", "elev", "karakter", "status", "kanSetteKarakter", "skjema", "grenser", "tekster"]);

// 0.3.0: tråden til webviewen (egen melding etter `vis`), én melding i den, og
// meldingen etter en vellykket sending. Testene sjekker nøyaktig disse settene.
export const TRADFELT = Object.freeze(["type", "generasjon", "status", "meldinger", "skjulte", "tekster"]);
export const TRADMELDINGSFELT = Object.freeze(["fraEleven", "forfatter", "tekst", "tid", "forsok", "vedlegg", "media"]);
export const SENDTFELT = Object.freeze(["type", "generasjon", "felt", "karakter", "status"]);
// 0.4.0 (G4): oppgaveteksten til webviewen. Testene sjekker nøyaktig dette settet.
// 0.4.0 (G5): `handlinger` er hintet til webviewen ({ fritekst, valg }); host avgjør på fersk data.
export const OPPGAVETEKSTFELT = Object.freeze(["type", "generasjon", "sammeOppgave", "status", "typeKjent", "handlinger", "blokker", "tekster"]);

// Meldinger webviewen kan sende, med nøyaktig disse feltene (ingen ID-er).
export const MELDINGSFELT = Object.freeze({
  klar: Object.freeze(["type"]),
  send: Object.freeze(["type", "generasjon", "karakter", "kommentar"]),
  apnePages: Object.freeze(["type", "generasjon"]),
  svar: Object.freeze(["type", "generasjon", "tekst"]),
  apneCanvas: Object.freeze(["type", "generasjon"]),
  apneOppgave: Object.freeze(["type", "generasjon"]),
  // 0.4.0 (G5): menyvalget (complete/incomplete/fritatt) med valgfri kommentar.
  vurdering: Object.freeze(["type", "generasjon", "valg", "kommentar"]),
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
// 0.3.0: en node av typen `ikkeLevert` bindes med `levert: false` (bare lese og
// svare). 0.4.0: andre noder som ikke er levert (erLevert) avvises som før. Quiz
// avvises uansett (ingen tråd i panelet, Lars 2026-11-06).
export function bindInnlevering({ type, course, assignment, sub } = {}, generasjon) {
  if (!course || !assignment || !sub) return { ok: false, grunn: "ugyldig_innlevering" };
  if (isQuizAssignment(assignment)) return { ok: false, grunn: "quiz" };
  const kursId = assignment.courseId ?? course.id;
  const oppgaveId = assignment.id;
  const userId = sub.userId;
  if (!erId(kursId) || !erId(oppgaveId) || !erId(userId) || !erId(generasjon)) {
    return { ok: false, grunn: "ugyldig_innlevering" };
  }
  const levert = erLevert(sub);
  const ikkeLevert = type === "ikkeLevert";
  if (!ikkeLevert && !levert) return { ok: false, grunn: "ikke_levert" };
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
    // 0.3.0: false = ikke levert (aldri fritekst-karakter; 0.4.0 G5: menyen etter matrisen).
    levert: !ikkeLevert,
    // 0.4.0 (G5): fritatt da panelet ble vist (treet henter med { levertOgFritak: true }).
    // Brukes til hintet og til advarselen «fritaket er endret» (12a).
    fritatt: sub.excused === true,
    kommentarer: frysKommentarer(sub.kommentarer),
  });
  return { ok: true, binding };
}

// Frosset kopi av tråden med bare hvitelistens felt (K2), eller null (ikke hentet).
export function frysKommentarer(liste) {
  if (!Array.isArray(liste)) return null;
  return Object.freeze(
    liste
      .filter((k) => k && typeof k === "object")
      .map((k) =>
        Object.freeze({
          id: Number.isSafeInteger(k.id) ? k.id : null,
          fraEleven: k.fraEleven === true,
          forfatternavn: tekst(k.forfatternavn),
          tekst: tekst(k.tekst),
          tid: typeof k.tid === "string" ? k.tid : null,
          forsok: Number.isSafeInteger(k.forsok) ? k.forsok : null,
          vedlegg: Object.freeze(
            (Array.isArray(k.vedlegg) ? k.vedlegg : [])
              .filter((v) => v && typeof v === "object")
              .map((v) => Object.freeze({ filnavn: tekst(v.filnavn), type: tekst(v.type) })),
          ),
          media: k.media && typeof k.media === "object" ? Object.freeze({ type: tekst(k.media.type) }) : null,
        }),
      ),
  );
}

// Ett panel, én gjeldende binding. Generasjonen øker ved hvert bind-forsøk og
// ved `losne()`, også når bindingen avvises; en avvist binding fjerner den
// forrige (panelet skal aldri vise én elev og sende til en annen).
export function lagPanel() {
  let generasjon = 0;
  let gjeldende = null;
  // Samme generasjon = samme bundne elev (ID-ene endres aldri innenfor en generasjon).
  const erSamme = (binding) => Boolean(binding && gjeldende && gjeldende.generasjon === binding.generasjon);
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
    // status. Bare hvis `binding` fortsatt er den gjeldende (samme generasjon); gir
    // den nye bindingen eller null. 0.3.0: tråden fra PUT-svaret erstatter den gamle
    // bare når den er en liste (null = svaret hadde ingen gyldig tråd, behold den gamle).
    // 0.4.0 (G5): `fritatt` byttes bare når svaret hadde `excused` (boolean).
    etterSending(binding, { karakter, status, kommentarer, excused }) {
      if (!erSamme(binding)) return null;
      gjeldende = Object.freeze({
        ...gjeldende,
        karakter,
        status,
        kommentarer: Array.isArray(kommentarer) ? frysKommentarer(kommentarer) : gjeldende.kommentarer,
        ...(typeof excused === "boolean" ? { fritatt: excused } : {}),
      });
      return gjeldende;
    },
    // 0.3.0 (K9): «Oppdater fra Canvas» glemmer tråden; bindingen (og generasjonen)
    // står, men tråden vises som «ikke hentet». Gir den nye bindingen eller null.
    glemKommentarer() {
      if (!gjeldende) return null;
      gjeldende = Object.freeze({ ...gjeldende, kommentarer: null });
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

// 0.4.0 (G3): «ikke levert» kommer fra bindingens `levert` (erLevert), ikke fra
// Canvas sin tilstand, så «graded» uten innlevering også vises som ikke levert.
export function statusTekst(status, t, { levert = true } = {}) {
  if (!levert) return t.vscNotSubmittedThread();
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
    status: statusTekst(binding.status, t, { levert: binding.levert !== false }),
    // 0.3.0: false for ikke-leverte: karakter- og kommentarfeltet låses med fast tekst.
    kanSetteKarakter: binding.levert !== false,
    skjema: { karakter: "", kommentar: "" },
    grenser: { karakter: GRENSER.karakter, kommentar: GRENSER.kommentar, svar: GRENSER.svar },
    tekster: {
      tittel: t.vscPanelTitle(),
      kurs: t.vscPanelCourse(),
      oppgave: t.vscPanelAssignment(),
      elev: t.vscPanelStudent(),
      status: t.vscPanelStatus(),
      karakterFelt: t.vscPanelGradeField(),
      kommentarFelt: t.vscPanelCommentField(),
      send: t.vscPanelSend(),
      laast: t.vscNotSubmittedLocked(),
      svarFelt: t.vscReplyField(),
      svar: t.vscReplyButton(),
      apneCanvas: t.vscOpenInCanvas(),
      apneOppgave: t.vscOpenAssignment(),
      // 0.4.0 (G5): nedtrekksmenyen (valgene vises bare når hintet tillater dem).
      valgFelt: t.vscGradeChoiceField(),
      valgVelg: t.vscGradeChoicePick(),
      complete: valgNavn("complete", t),
      incomplete: valgNavn("incomplete", t),
      fritatt: valgNavn("fritatt", t),
    },
  };
}

// 0.4.0 (G5): menyvalget i klartekst (webview og modal).
export function valgNavn(valg, t) {
  if (valg === "complete") return t.vscChoiceComplete();
  if (valg === "incomplete") return t.vscChoiceIncomplete();
  if (valg === "fritatt") return t.vscChoiceExcused();
  throw new Error("ukjent valg");
}

// ---------------------------------------------------------------------------
// 2b. Kommentartråden til webviewen (0.3.0, K3/K10)
// ---------------------------------------------------------------------------

const to = (n) => String(n).padStart(2, "0");
// «ÅÅÅÅ-MM-DD TT:MM» i lokal tid, eller "" for en tid som ikke kan leses.
export function formaterTid(iso) {
  const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${to(d.getMonth() + 1)}-${to(d.getDate())} ${to(d.getHours())}:${to(d.getMinutes())}`;
}

function mediatekst(media, t) {
  if (!media) return "";
  if (media.type === "audio") return t.vscCommentsAudio();
  if (media.type === "video") return t.vscCommentsVideo();
  return t.vscCommentsMedia();
}

// Tråden for den gjeldende bindingen: { type: "trad", generasjon, status:
// "ok" | "ikke_hentet", meldinger, skjulte, tekster }. Ingen ID-er, ingen URL-er,
// vedlegg bare med filnavn. De siste TRAD_MAKS.meldinger meldingene, hver kortet
// til TRAD_MAKS.tegn tegn med fast merke; `skjulte` er antallet eldre som ikke
// vises. Alle tekster er ferdig formatert her (webviewen setter dem med textContent).
export function tradModell(binding, t) {
  if (!binding) return null;
  const liste = Array.isArray(binding.kommentarer) ? binding.kommentarer : null;
  const skjulte = liste ? Math.max(0, liste.length - TRAD_MAKS.meldinger) : 0;
  const meldinger = (liste ?? []).slice(skjulte).map((k) => ({
    fraEleven: k.fraEleven === true,
    forfatter: tekst(k.forfatternavn) || t.vscCommentsUnknownAuthor(),
    tekst: k.tekst.length > TRAD_MAKS.tegn ? `${k.tekst.slice(0, TRAD_MAKS.tegn)} ${t.vscCommentsTruncated()}` : k.tekst,
    tid: formaterTid(k.tid),
    forsok: Number.isSafeInteger(k.forsok) ? t.vscCommentsAttempt(k.forsok) : "",
    vedlegg: k.vedlegg.map((v) => t.vscCommentsAttachment(v.filnavn)),
    media: mediatekst(k.media, t),
  }));
  return {
    type: "trad",
    generasjon: binding.generasjon,
    status: liste ? "ok" : "ikke_hentet",
    meldinger,
    skjulte,
    tekster: {
      tittel: t.vscCommentsTitle(),
      ingen: t.vscCommentsNone(),
      ikkeHentet: t.vscCommentsNotLoaded(),
      eldre: skjulte > 0 ? t.vscCommentsOlderHidden(skjulte) : "",
      fraEleven: t.vscCommentsFromStudent(),
    },
  };
}

// 0.3.0 (kritiker B5): etter en vellykket sending. Webviewen tømmer bare feltet som
// ble sendt (`felt`: "svar" eller "skjema"), så et utkast i det andre feltet står.
// `karakter` og `status` er ferdig formaterte tekster. Bare for gjeldende generasjon.
export function sendtModell(binding, felt, t) {
  if (!binding || (felt !== "svar" && felt !== "skjema")) return null;
  return {
    type: "sendt",
    generasjon: binding.generasjon,
    felt,
    karakter: t.currentGradeDisplay(binding.karakter),
    status: statusTekst(binding.status, t, { levert: binding.levert !== false }),
  };
}

// ---------------------------------------------------------------------------
// 2c. Oppgaveteksten til webviewen (0.4.0, plan G4; tilsynets O1, O2, O7)
// ---------------------------------------------------------------------------

// Nøkkelen i vinduets minne-Map (panel-vindu.js): «kurs:oppgave» fra bindingen.
export const oppgaveNokkel = (binding) => `${binding.kursId}:${binding.oppgaveId}`;

const heltall = (v, min, max) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : min);

// Tekstbitene: bare ikke-tomme strenger med fet/kursiv-flagg; alt annet faller bort.
function rensBiter(liste) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((b) => b && typeof b === "object" && typeof b.tekst === "string" && b.tekst !== "")
    .map((b) => ({ tekst: b.tekst, fet: b.fet === true, kursiv: b.kursiv === true }));
}

// Blokkene fra modellen (src/oppgavetekst.js), validert på nytt mot den faste lista.
// Bare navngitte felt kopieres; ukjente blokktyper ignoreres (O1).
export function oppgavetekstBlokker(blokker) {
  const ut = [];
  for (const b of Array.isArray(blokker) ? blokker : []) {
    if (!b || typeof b !== "object") continue;
    switch (b.type) {
      case "overskrift":
        ut.push({ type: "overskrift", niva: heltall(b.niva, 1, 6), biter: rensBiter(b.biter) });
        break;
      case "avsnitt":
      case "kode":
        ut.push({ type: b.type, biter: rensBiter(b.biter) });
        break;
      case "sitat":
        ut.push({ type: "sitat", dybde: heltall(b.dybde, 1, 10), biter: rensBiter(b.biter) });
        break;
      case "liste":
        ut.push({
          type: "liste",
          nummerert: b.nummerert === true,
          start: heltall(b.start, 1, Number.MAX_SAFE_INTEGER),
          dybde: heltall(b.dybde, 1, 10),
          punkter: (Array.isArray(b.punkter) ? b.punkter : []).map(rensBiter),
        });
        break;
      default:
        break;
    }
  }
  return ut;
}

// Feilen fra hentOppgave som kort, trygg tekst: «HTTP nnn», nettverksfeilen (uten
// token), ellers «?» (canvasFeil). I tillegg blir apiGetEn sin faste melding «ugyldig
// svar fra Canvas (HTTP nnn)» (begge språk) til «HTTP nnn»; aldri annen feiltekst.
export function oppgaveFeilDetalj(err, token) {
  const detalj = canvasFeil(err, token);
  if (detalj !== "?") return detalj;
  const melding = err?.message == null ? "" : String(err.message);
  const m = /\(HTTP (\d{3})\)$/.exec(melding);
  if (!m) return "?";
  const kjent = [false, true].some((engelsk) => createStrings(engelsk).errInvalidCanvasResponse(m[1]) === melding);
  return kjent ? `HTTP ${m[1]}` : "?";
}

// `tilstand` er { henter: true }, { glemt: true } (etter «Oppdater»), { oppgave } (fra hentOppgave, via minne-Map-en) eller
// { feil: detalj } (fra oppgaveFeilDetalj). `sammeOppgave`: forrige oppgavetekst i dette
// panelet var for samme «kurs:oppgave» (webviewen beholder da <details>-tilstanden).
// Status: "henter", "ikke_hentet", "ok", "tom", "for_stor", "tekstfeil" (konverteringen feilet; samme
// faste tekst som for_stor) eller "hentefeil". `typeKjent` er sann bare når oppgaven er
// hentet med en oppgavetype; ellers låses skjemaet med `tekster.laast`.
export function oppgavetekstModell(binding, tilstand, t, { sammeOppgave = false } = {}) {
  if (!binding || !tilstand || typeof tilstand !== "object") return null;
  let status;
  let info = "";
  let blokker = [];
  let typeKjent = false;
  if (tilstand.oppgave && typeof tilstand.oppgave === "object") {
    const o = tilstand.oppgave;
    typeKjent = typeof o.gradingType === "string" && o.gradingType !== "";
    const tekst = o.tekst && typeof o.tekst === "object" ? o.tekst : {};
    if (tekst.status === "ok") {
      blokker = oppgavetekstBlokker(tekst.blokker);
      status = blokker.length > 0 ? "ok" : "tom";
    } else if (tekst.status === "tom") status = "tom";
    else if (tekst.status === "for_stor") status = "for_stor";
    else status = "tekstfeil";
    if (status === "tom") info = t.vscAssignmentTextEmpty();
    else if (status !== "ok") info = t.vscAssignmentTextTooLarge();
  } else if (Object.prototype.hasOwnProperty.call(tilstand, "feil")) {
    status = "hentefeil";
    info = t.vscAssignmentTextFailed(tekst(tilstand.feil) || "?");
  } else if (tilstand.henter === true) {
    status = "henter";
    info = t.vscAssignmentTextLoading();
  } else if (tilstand.glemt === true) {
    // «Oppdater fra Canvas» (som tråden, K9): teksten er glemt til neste visning.
    status = "ikke_hentet";
    info = t.vscAssignmentTextNotLoaded();
  } else return null;
  // 0.4.0 (G5): hintet til webviewen, regnet ut med matrisen fra oppgaven som vises og
  // bindingens tilstand. Avgjør ingenting: host sjekker på nytt med fersk data.
  const h = typeKjent ? handlingerFor(tilstand.oppgave, { levert: binding.levert !== false, fritatt: binding.fritatt === true }) : null;
  const handlinger = { fritekst: Boolean(h?.fritekst) && binding.levert !== false, valg: h ? [...h.valg] : [] };
  return {
    type: "oppgavetekst",
    generasjon: binding.generasjon,
    sammeOppgave: sammeOppgave === true,
    status,
    typeKjent,
    handlinger,
    blokker,
    tekster: {
      tittel: t.vscAssignmentTextTitle(),
      info,
      laast: typeKjent
        ? skjemaLaas(h, handlinger, binding, t)
        : status === "henter" || status === "ikke_hentet"
          ? t.vscGradeLockedLoading()
          : t.vscGradeLockedFailed(),
    },
  };
}

// 0.4.0 (G5): fast tekst over skjemaet når typen er kjent. Gruppe-sperren (Lars 3a, O5
// utvidet) vises alltid når den gjelder; ellers bare når ingen handling er mulig.
function skjemaLaas(h, handlinger, binding, t) {
  if (h.sperre === "gruppe") return t.vscGroupGradedTogether();
  if (handlinger.fritekst || handlinger.valg.length > 0) return "";
  // G6: bare fritatt sperret til D8 (individuelt vurdert gruppe) gir tekst bare når ingenting
  // annet er mulig; ellers står menyen uten låsetekst.
  if (h.grunner.fritatt === "gruppe_d8") return t.vscGroupExcuseBlockedD8();
  if (h.grunner.fritatt === "allerede_fritatt") return t.vscAlreadyExcusedLocked();
  if (binding.levert === false) return t.vscNotSubmittedLocked();
  return t.quizGradingNotSupported();
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

// Generasjonen i en melding mot den gjeldende bindingen: null hvis den stemmer,
// ellers et avslag.
function sjekkGenerasjon(generasjon, binding) {
  if (!binding) return { ok: false, grunn: "ingen_binding" };
  if (generasjon < binding.generasjon) return { ok: false, grunn: "gammel_generasjon" };
  if (generasjon !== binding.generasjon) return ugyldig;
  return null;
}

function validerSend({ generasjon, karakter, kommentar }, binding) {
  if (!erId(generasjon) || typeof karakter !== "string" || typeof kommentar !== "string") return ugyldig;
  if (karakter.length > GRENSER.karakter || kommentar.length > GRENSER.kommentar) return ugyldig;
  if (ULOVLIG_KARAKTER.test(karakter) || ULOVLIG_KOMMENTAR.test(kommentar)) return ugyldig;
  const feil = sjekkGenerasjon(generasjon, binding);
  if (feil) return feil;
  // 0.3.0: ikke-leverte (Lars 2026-11-06): aldri karakter eller tilbakemelding her.
  if (binding.levert === false) return { ok: false, grunn: "ikke_levert" };

  const k = karakter.trim();
  const c = kommentar.trim() === "" ? "" : kommentar;
  if (!k && !c) return { ok: false, grunn: "tomt" };
  return { ok: true, type: "send", karakter: k, kommentar: c };
}

// 0.4.0 (G5): menyvalget. `valg` må være en av VALG (fast liste, O4); kommentaren har
// samme regler som tilbakemeldingen. Gjelder også ikke-leverte (matrisen avgjør i host).
function validerVurdering({ generasjon, valg, kommentar }, binding) {
  if (!erId(generasjon) || typeof valg !== "string" || typeof kommentar !== "string") return ugyldig;
  if (!VALG.includes(valg)) return ugyldig;
  if (kommentar.length > GRENSER.kommentar || ULOVLIG_KOMMENTAR.test(kommentar)) return ugyldig;
  const feil = sjekkGenerasjon(generasjon, binding);
  if (feil) return feil;
  return { ok: true, type: "vurdering", valg, kommentar: kommentar.trim() === "" ? "" : kommentar };
}

// «Åpne GitHub Pages» (0.2.0): bare generasjonen; eier/repo kommer fra bindingen.
function validerApnePages({ generasjon }, binding) {
  if (!erId(generasjon)) return ugyldig;
  return sjekkGenerasjon(generasjon, binding) ?? { ok: true, type: "apnePages" };
}

// 0.3.0 «Svar» (K5): samme regler som tilbakemeldingen (lengde, kontrolltegn); en
// tekst med bare mellomrom er tom. Gjelder også ikke-leverte.
function validerSvar({ generasjon, tekst: svar }, binding) {
  if (!erId(generasjon) || typeof svar !== "string") return ugyldig;
  if (svar.length > GRENSER.svar || ULOVLIG_KOMMENTAR.test(svar)) return ugyldig;
  const feil = sjekkGenerasjon(generasjon, binding);
  if (feil) return feil;
  if (svar.trim() === "") return { ok: false, grunn: "tomt" };
  return { ok: true, type: "svar", tekst: svar };
}

// 0.3.0 «Åpne i Canvas» (K4 revidert): bare generasjonen; ID-ene kommer fra bindingen.
function validerApneCanvas({ generasjon }, binding) {
  if (!erId(generasjon)) return ugyldig;
  return sjekkGenerasjon(generasjon, binding) ?? { ok: true, type: "apneCanvas" };
}

// 0.4.0 «Åpne oppgaven i Canvas» (O3): bare generasjonen; ID-ene kommer fra bindingen.
function validerApneOppgave({ generasjon }, binding) {
  if (!erId(generasjon)) return ugyldig;
  return sjekkGenerasjon(generasjon, binding) ?? { ok: true, type: "apneOppgave" };
}

// Gir { ok: true, type: "klar" }, { ok: true, type: "send", karakter, kommentar },
// { ok: true, type: "apnePages" } eller { ok: false, grunn } der grunn er
// "ugyldig", "ingen_binding", "gammel_generasjon" eller "tomt". Karakteren
// trimmes; en tilbakemelding med bare mellomrom regnes som tom.
export function validerMelding(melding, binding) {
  if (!vanligObjekt(melding)) return ugyldig;
  const felt = Object.prototype.hasOwnProperty.call(MELDINGSFELT, melding.type) ? MELDINGSFELT[melding.type] : null;
  if (typeof melding.type !== "string" || !felt || !noyaktigeFelt(melding, felt)) return ugyldig;
  switch (melding.type) {
    case "klar":
      return { ok: true, type: "klar" };
    case "send":
      return validerSend(melding, binding);
    case "apnePages":
      return validerApnePages(melding, binding);
    case "svar":
      return validerSvar(melding, binding);
    case "apneCanvas":
      return validerApneCanvas(melding, binding);
    case "apneOppgave":
      return validerApneOppgave(melding, binding);
    case "vurdering":
      return validerVurdering(melding, binding);
    default:
      return ugyldig;
  }
}

// ---------------------------------------------------------------------------
// 3b. GitHub Pages-knappen (0.2.0)
// ---------------------------------------------------------------------------

// Meldingen til webviewen om Pages-knappen for den gjeldende bindingen. `status`
// er sjekkens status for bindingens eier/repo. `tekst` er knappeteksten, eller ""
// når det ikke er noen lenke (knappen skjules). null uten binding. Ingen URL og
// ingen eier/repo i meldingen: lenken slås opp fra bindingen ved klikk (P3/P9).
export function pagesModell(binding, status, t) {
  if (!binding) return null;
  const lenke = lenkeFor({ repo: binding.repo }, status);
  const tekst = !lenke ? "" : lenke.tilstand === "bekreftet" ? t.vscPagesOpen() : t.vscPagesOpenUnchecked();
  return { type: "pages", generasjon: binding.generasjon, tekst };
}

// ---------------------------------------------------------------------------
// 4. Før sending: sammenlign med fersk innlevering fra Canvas
// ---------------------------------------------------------------------------

// `ferske` er resultatet av listSubmissions(config, binding.kursId, binding.oppgaveId).
// Utfall:
//   avbryt / borte      - ingen innlevering med samme user_id, eller den er
//                         ikke levert (erLevert, 0.4.0): ingenting å rette.
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
  if (!s || !erLevert(s)) return { utfall: "avbryt", grunn: "borte" };
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

// 0.3.0 «Svar» (Lars 3b, K5): som vurderFersk, men et svar sendes også når eleven
// ikke har levert (eller har trukket tilbake), og når GitHub-lenken er endret
// (advarsel i bekreftelsen). Bare flere treff (tvetydig) eller ingen innlevering
// med den bundne user_id (borte) avbryter. `fersk` har bare navngitte felt.
export function vurderFerskSvar(binding, ferske) {
  const treff = (Array.isArray(ferske) ? ferske : []).filter((s) => s && s.userId === binding.userId);
  if (treff.length > 1) return { utfall: "avbryt", grunn: "tvetydig" };
  const s = treff[0];
  if (!s) return { utfall: "avbryt", grunn: "borte" };
  const fersk = {
    canvasNavn: tekst(s.studentName),
    github: s.owner ? String(s.owner) : null,
    levert: erLevert(s),
  };
  const repo = s.repo ? String(s.repo) : null;
  const advarsler = [];
  if ((repo ?? "").toLowerCase() !== (binding.repo ?? "").toLowerCase()) advarsler.push({ type: "lenke", da: binding.repo, na: repo });
  return { utfall: advarsler.length > 0 ? "advar" : "send", fersk, advarsler };
}

// 0.4.0 (plan G5; tilsynets O4 revidert, Lars «a»/12a): før modalen for fritekst
// («send», handling "fritekst") og menyvalg («vurdering», complete/incomplete/fritatt).
// `ferske` og `ferskOppgave` er hentet direkte fra Canvas rett før (listSubmissions med
// { levertOgFritak: true } og hentOppgave), aldri fra Map/cache. `vistOppgave` er oppgaven
// webviewen fikk for denne generasjonen (hintet); null = typen ble aldri vist -> avbryt.
// Utfall som vurderFersk, med disse i tillegg:
//   avbryt / type_ukjent   - fersk eller vist oppgave uten grading_type
//   avbryt / type_endret   - oppgavetype, quiz- eller gruppestatus endret siden visningen
//   avbryt / levert_siden  - binding levert:false, fersk levert, poeng/bokstav (Lars «a»)
//   avbryt / <matrise>     - matrisen avviser handlingen på fersk data (quiz, gruppe,
//                            levert, ikke_levert, pass_fail, ikke_pass_fail, allerede_fritatt)
//   advar                  - endret karakter, endret fritak, levert siden visningen (pass_fail)
// Fritekst bruker vurderFersk (uendret, B4) for lenke- og karaktersjekken.
// `fersk` har bare navngitte felt; `oppgave` sier om fersk type er pass_fail og om gruppen
// vurderes samlet (til modalteksten og argumentene).
export function vurderFerskVurdering(binding, ferske, ferskOppgave, handling, vistOppgave) {
  if (handling !== "fritekst" && !VALG.includes(handling)) throw new Error("vurderFerskVurdering: ukjent handling");
  const avbryt = (grunn) => ({ utfall: "avbryt", grunn });
  if (!kjentType(ferskOppgave) || !kjentType(vistOppgave)) return avbryt("type_ukjent");
  if (oppgaveEndret(vistOppgave, ferskOppgave)) return avbryt("type_endret");
  const treff = (Array.isArray(ferske) ? ferske : []).filter((s) => s && s.userId === binding.userId);
  if (treff.length > 1) return avbryt("tvetydig");
  const s = treff[0];
  if (!s) return avbryt("borte");
  const levertNa = erLevert(s); // kaster ved manglende submittedAt (rettelse 2)
  const passFail = ferskOppgave.gradingType === "pass_fail";
  const bundetLevert = binding.levert !== false;
  if (bundetLevert && !levertNa) return avbryt("borte");
  if (!bundetLevert && levertNa && !passFail) return avbryt("levert_siden");
  const r = vurderHandling(ferskOppgave, s, handling);
  if (!r.ok) return avbryt(r.grunn);
  const oppgave = { passFail, gruppeSamlet: ferskOppgave.gruppeSamlet !== false };
  const fritattNa = s.excused === true;
  const fritakEndret = fritattNa !== (binding.fritatt === true);
  if (handling === "fritekst") {
    const v = vurderFersk(binding, ferske);
    if (v.utfall === "avbryt") return v;
    const advarsler = [...v.advarsler, ...(fritakEndret ? [{ type: "fritak", da: binding.fritatt === true, na: fritattNa }] : [])];
    return {
      utfall: advarsler.length > 0 ? "advar" : "send",
      fersk: { ...v.fersk, score: s.currentScore ?? null, fritatt: fritattNa, levert: levertNa },
      advarsler,
      oppgave,
    };
  }
  const lik = (a, b) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  if (bundetLevert && (!lik(s.owner, binding.github) || !lik(s.repo, binding.repo))) return avbryt("endret_lenke");
  const fersk = {
    canvasNavn: tekst(s.studentName),
    github: s.owner ? String(s.owner) : null,
    karakter: karakterVerdi(s.currentGrade),
    score: s.currentScore ?? null,
    fritatt: fritattNa,
    levert: levertNa,
  };
  const advarsler = [];
  if (fersk.karakter !== binding.karakter) advarsler.push({ type: "karakter", da: binding.karakter, na: fersk.karakter });
  if (fritakEndret) advarsler.push({ type: "fritak", da: binding.fritatt === true, na: fritattNa });
  if (!bundetLevert && levertNa) advarsler.push({ type: "levert", na: s.repo ? String(s.repo) : null });
  return { utfall: advarsler.length > 0 ? "advar" : "send", fersk, advarsler, oppgave };
}

// ---------------------------------------------------------------------------
// 5. Bekreftelsestekst (modal i extension host)
// ---------------------------------------------------------------------------

// 0.4.0 (G5): advarslene (12a) som tekstlinjer.
function advarselLinje(a, t) {
  if (a.type === "fritak") return t.vscPanelExcusedChanged(a.da, a.na);
  if (a.type === "levert") return t.vscPanelSubmittedSince(a.na);
  return t.vscPanelGradeChanged(a.da, a.na);
}

// 0.4.0 (G5): karakteren og/eller scoren eleven har i Canvas nå (fra fersk innlevering),
// eller "" når det ikke finnes noen.
function naavaerende(fersk) {
  const deler = [];
  if (fersk.karakter != null) deler.push(String(fersk.karakter));
  if (fersk.score != null && String(fersk.score) !== String(fersk.karakter)) deler.push(String(fersk.score));
  return deler.join(" / ");
}

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
  // D8-GUI (Lars 2026-10-30): karakteren eleven har i Canvas nå, fra den ferske
  // innleveringen (samme verdi som «nå» i en eventuell advarsel, så de to kan ikke
  // si noe forskjellig). Øverst, så den ikke havner under en lang tilbakemelding.
  // Ingen karakter: ingen linje.
  const naa = fersk.karakter != null ? [t.vscPanelConfirmCurrentGrade(fersk.karakter), ""] : [];
  const linjer = advarsler.map((a) => advarselLinje(a, t));
  // 0.4.0 (G5, rettelse 1): fritatt elev og en karakter i skjemaet: karakteren fjerner
  // fritaket (Canvas). Bare kommentar lar fritaket stå, så da ingen linje.
  const fritak = fersk.fritatt === true && skjema.karakter ? ["", t.vscConfirmGradeRemovesExcuse()] : [];
  return {
    melding: advarsler.length > 0 ? t.vscPanelConfirmWarning() : t.confirmGradeMessage(),
    detalj: [...naa, t.gradeConfirmSummaryHeader(), sammendrag, ...fritak, ...(linjer.length ? ["", ...linjer] : [])].join("\n"),
    knapp: t.vscPanelConfirmButton(),
  };
}

// 0.4.0 (G5, Lars 11b/1a/3a, tilsynets O4): bekreftelsen før et menyvalg. Samme modal og
// samme oppsummering som fritekst, med navnet fra den ferske innleveringen på bundet
// user_id, «ikke levert» når det gjelder, nåværende karakter/score (også «graded» uten
// innlevering) og handlingen i klartekst.
export function bekreftVurdering(binding, valg, kommentar, vurdering, t) {
  if (!vurdering || (vurdering.utfall !== "send" && vurdering.utfall !== "advar")) {
    throw new Error("bekreftVurdering krever utfall send eller advar");
  }
  const { fersk, advarsler, oppgave } = vurdering;
  const navn = valgNavn(valg, t);
  const naa = naavaerende(fersk);
  const sammendrag = t.gradeConfirmSummary(t.gradeStudentLabel(fersk.canvasNavn, fersk.github), binding.oppgavenavn, binding.kursnavn, navn, kortKommentar(kommentar, t));
  const handling = [];
  if (!fersk.levert) handling.push(t.vscReplyConfirmNotSubmitted());
  if (valg === "fritatt") {
    handling.push(t.vscConfirmExcused());
    if (naa) handling.push(t.vscConfirmRemovesGrade(naa));
    if (!oppgave.passFail) handling.push(t.vscConfirmUndoOnlyInCanvas());
  } else if (fersk.fritatt) {
    handling.push(t.vscConfirmRemovesExcuse(navn));
  }
  const linjer = advarsler.map((a) => advarselLinje(a, t));
  return {
    melding: advarsler.length > 0 ? t.vscPanelConfirmWarning() : t.confirmGradeMessage(),
    detalj: [
      ...(naa ? [t.vscPanelConfirmCurrentGrade(naa), ""] : []),
      t.gradeConfirmSummaryHeader(),
      sammendrag,
      "",
      ...handling,
      ...(linjer.length ? ["", ...linjer] : []),
    ].join("\n"),
    knapp: t.vscPanelConfirmButton(),
  };
}

// 0.3.0: bekreftelsen før «Svar» (K5). Navnet og GitHub fra den ferske innleveringen
// med den bundne user_id, «ikke levert» når eleven ikke har levert, oppgave og kurs,
// de første VIS_SVAR tegnene av svaret, en eventuell endret lenke, og en fast linje
// om at svaret blir synlig for eleven og ikke kan slettes herfra.
export function bekreftSvar(binding, svar, vurdering, t) {
  if (!vurdering || (vurdering.utfall !== "send" && vurdering.utfall !== "advar")) {
    throw new Error("bekreftSvar krever utfall send eller advar");
  }
  const { fersk, advarsler } = vurdering;
  const kort = svar.length <= VIS_SVAR ? svar : `${svar.slice(0, VIS_SVAR)}${t.vscReplyTruncated(VIS_SVAR, svar.length)}`;
  const linjer = [
    ...(fersk.levert ? [] : [t.vscReplyConfirmNotSubmitted(), ""]),
    t.vscReplyConfirmSummary(t.gradeStudentLabel(fersk.canvasNavn, fersk.github), binding.oppgavenavn, binding.kursnavn, kort),
    ...advarsler.flatMap((a) => (a.type === "lenke" ? ["", t.vscReplyLinkChanged(a.da, a.na)] : [])),
    "",
    t.vscReplyConfirmFixed(),
  ];
  return { melding: t.vscReplyConfirmMessage(), detalj: linjer.join("\n"), knapp: t.vscReplyConfirmButton() };
}

// Argumentene til gradeSubmission for et svar: ID-ene fra bindingen, bare teksten
// (`comment[text_comment]`), aldri karakter eller `comment[attempt]`.
export function svarArgumenter(binding, svar) {
  return [binding.kursId, binding.oppgaveId, binding.userId, { comment: svar }];
}

// Argumentene til gradeSubmission(config, kursId, oppgaveId, userId, endring).
// ID-ene kommer bare fra bindingen. 0.4.0 (G5, plan O5 [endret], rettelse 1 og 5):
//   karakter, gruppe ikke vurdert samlet -> { grade, comment, excuse: false } (fjerner fritak)
//   bare kommentar                       -> { grade: "", comment } (ingen `excuse`, fritaket står)
//   gruppe vurdert samlet (eller ukjent) -> { grade, comment } (aldri `excuse`, som 0.3.0)
export function sendArgumenter(binding, skjema, { gruppeSamlet } = {}) {
  const endring = { grade: skjema.karakter, comment: skjema.kommentar };
  const harKarakter = typeof skjema.karakter === "string" && skjema.karakter !== "";
  if (harKarakter && gruppeSamlet === false) endring.excuse = false;
  return [binding.kursId, binding.oppgaveId, binding.userId, endring];
}

// 0.4.0 (G5, tilsynets O4/O5, rettelse 1 og 5): argumentene for et menyvalg.
//   fritatt              -> { excuse: true, comment } (aldri karakter)
//   complete/incomplete  -> { grade, excuse: false, comment } (fjerner fritak, Lars 3a)
// Gruppe vurdert samlet: kaster (matrisen avviser menyen der; dette er siste sperre).
export function vurderingArgumenter(binding, valg, kommentar, { gruppeSamlet } = {}) {
  if (gruppeSamlet !== false) throw new Error("vurderingArgumenter: aldri excuse ved gruppe vurdert samlet");
  const ider = [binding.kursId, binding.oppgaveId, binding.userId];
  if (valg === "fritatt") return [...ider, { excuse: true, comment: kommentar }];
  if (valg === "complete" || valg === "incomplete") return [...ider, { grade: valg, excuse: false, comment: kommentar }];
  throw new Error("vurderingArgumenter: ukjent valg");
}

// Karakter og status etter en vellykket gradeSubmission. Canvas svarer med hele
// innleveringen (også `body`); bare `grade` og `workflow_state` leses (T-A).
// Mangler de i svaret: det som ble sendt, ellers det bindingen hadde.
// 0.3.0: `submission` er allerede snevret inn i canvas.js (K2); `kommentarer` er
// tråden fra PUT-svaret (liste), eller null (behold den gamle).
// 0.4.0 (G5): `excused` følger med bare når svaret har det (canvas.js gir det bare når
// `excuse` ble sendt), så treet og bindingen kan vise «fritatt».
export function etterSending(binding, skjema, submission) {
  const s = submission && typeof submission === "object" ? submission : {};
  const harKarakter = Object.prototype.hasOwnProperty.call(s, "grade");
  return {
    karakter: harKarakter ? karakterVerdi(s.grade) : skjema.karakter ? skjema.karakter : binding.karakter,
    status: typeof s.workflow_state === "string" ? s.workflow_state : binding.status,
    kommentarer: Array.isArray(s.kommentarer) ? s.kommentarer : null,
    ...(typeof s.excused === "boolean" ? { excused: s.excused } : {}),
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
    // 0.4.0 (G5): matrisen og den ferske sjekken.
    case "type_ukjent":
      return t.vscGradeTypeUnknown();
    case "type_endret":
      return t.vscGradeTypeChanged();
    case "levert_siden":
      return t.vscSubmittedSinceAbort();
    case "allerede_fritatt":
      return t.vscAlreadyExcused();
    case "gruppe":
      return t.vscGroupGradedTogether();
    case "gruppe_d8":
      return t.vscGroupExcuseBlockedD8();
    case "pass_fail":
      return t.vscGradeUseMenu();
    case "ikke_pass_fail":
      return t.vscGradeChoiceOnlyPassFail();
    case "levert":
      return t.vscExcuseNotAllowedSubmitted();
    default:
      return t.vscPanelInvalidMessage();
  }
}
