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
import { isQuizAssignment, isNeedsGrading } from "../../src/workflow.js";
import { tryggDetalj } from "./oppsett.mjs";
import { lenkeFor } from "./pages.mjs";

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

// Meldinger webviewen kan sende, med nøyaktig disse feltene (ingen ID-er).
export const MELDINGSFELT = Object.freeze({
  klar: Object.freeze(["type"]),
  send: Object.freeze(["type", "generasjon", "karakter", "kommentar"]),
  apnePages: Object.freeze(["type", "generasjon"]),
  svar: Object.freeze(["type", "generasjon", "tekst"]),
  apneCanvas: Object.freeze(["type", "generasjon"]),
  apneOppgave: Object.freeze(["type", "generasjon"]),
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
// 0.3.0: en node av typen `ikkeLevert` (ikke levert, men med kommentartråd) bindes
// med `levert: false` (bare lese og svare). Alle andre noder med `unsubmitted`
// avvises som før. Quiz avvises uansett (ingen tråd i panelet, Lars 2026-11-06).
export function bindInnlevering({ type, course, assignment, sub } = {}, generasjon) {
  if (!course || !assignment || !sub) return { ok: false, grunn: "ugyldig_innlevering" };
  if (isQuizAssignment(assignment)) return { ok: false, grunn: "quiz" };
  const kursId = assignment.courseId ?? course.id;
  const oppgaveId = assignment.id;
  const userId = sub.userId;
  if (!erId(kursId) || !erId(oppgaveId) || !erId(userId) || !erId(generasjon)) {
    return { ok: false, grunn: "ugyldig_innlevering" };
  }
  const ikkeLevert = type === "ikkeLevert";
  if (!ikkeLevert && sub.workflowState === "unsubmitted") return { ok: false, grunn: "ikke_levert" };
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
    // 0.3.0: false = ikke levert (bare lese og svare, aldri karakter).
    levert: !ikkeLevert,
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
    etterSending(binding, { karakter, status, kommentarer }) {
      if (!erSamme(binding)) return null;
      gjeldende = Object.freeze({
        ...gjeldende,
        karakter,
        status,
        kommentarer: Array.isArray(kommentarer) ? frysKommentarer(kommentarer) : gjeldende.kommentarer,
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

export function statusTekst(status, t) {
  if (isNeedsGrading({ workflowState: status })) return t.filterNeedsGrading();
  if (status === "graded") return t.vscGraded();
  if (status === "unsubmitted") return t.vscNotSubmittedThread();
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
    },
  };
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
    status: statusTekst(binding.status, t),
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
    levert: s.workflowState !== "unsubmitted",
  };
  const repo = s.repo ? String(s.repo) : null;
  const advarsler = [];
  if ((repo ?? "").toLowerCase() !== (binding.repo ?? "").toLowerCase()) advarsler.push({ type: "lenke", da: binding.repo, na: repo });
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
  // D8-GUI (Lars 2026-10-30): karakteren eleven har i Canvas nå, fra den ferske
  // innleveringen (samme verdi som «nå» i en eventuell advarsel, så de to kan ikke
  // si noe forskjellig). Øverst, så den ikke havner under en lang tilbakemelding.
  // Ingen karakter: ingen linje.
  const naa = fersk.karakter != null ? [t.vscPanelConfirmCurrentGrade(fersk.karakter), ""] : [];
  const linjer = advarsler.map((a) => t.vscPanelGradeChanged(a.da, a.na));
  return {
    melding: advarsler.length > 0 ? t.vscPanelConfirmWarning() : t.confirmGradeMessage(),
    detalj: [...naa, t.gradeConfirmSummaryHeader(), sammendrag, ...(linjer.length ? ["", ...linjer] : [])].join("\n"),
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
// ID-ene kommer bare fra bindingen.
export function sendArgumenter(binding, skjema) {
  return [binding.kursId, binding.oppgaveId, binding.userId, { grade: skjema.karakter, comment: skjema.kommentar }];
}

// Karakter og status etter en vellykket gradeSubmission. Canvas svarer med hele
// innleveringen (også `body`); bare `grade` og `workflow_state` leses (T-A).
// Mangler de i svaret: det som ble sendt, ellers det bindingen hadde.
// 0.3.0: `submission` er allerede snevret inn i canvas.js (K2); `kommentarer` er
// tråden fra PUT-svaret (liste), eller null (behold den gamle).
export function etterSending(binding, skjema, submission) {
  const s = submission && typeof submission === "object" ? submission : {};
  const harKarakter = Object.prototype.hasOwnProperty.call(s, "grade");
  return {
    karakter: harKarakter ? karakterVerdi(s.grade) : skjema.karakter ? skjema.karakter : binding.karakter,
    status: typeof s.workflow_state === "string" ? s.workflow_state : binding.status,
    kommentarer: Array.isArray(s.kommentarer) ? s.kommentarer : null,
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
