// Ren logikk for bla og kloning i VS Code-utvidelsen (D5). Ingen import av
// `vscode` her, slik at alt kan testes med `node --test`
// (tests/vscode-bla.test.js; .mjs fordi vscode/package.json ikke har
// "type": "module"). VS Code-delen (trevisning, QuickPick, fremdrift) ligger i
// ./bla-vindu.js.
//
// Samme kjerne som CLI-et: kategorisering (src/categories.js), bulk-filter,
// merking og uten_lenke.txt-format (src/workflow.js), mappenavn per
// innlevering (src/storage.js) og visningsnavn (src/grading.js).
//
// Tilsynets krav som gjelder her:
// - T-A: innleveringens `body` finnes aldri i dataene vi får (listSubmissions
//   tar den ikke med), og ingen funksjon her bygger tekst av den.
// - T9a: direkte undermapper av økten navngis med oktUndermappenavn (aldri
//   punktum først).
// - T11: oppsummeringen (til OutputChannel) inneholder bare antall, aldri navn,
//   repo eller git sin feilmelding.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCategoryTree } from "../../src/categories.js";
import { sortByGrading, isNeedsGrading, isQuizAssignment, formatSkippedLog, assignmentKey } from "../../src/workflow.js";
import { repoFolderName } from "../../src/storage.js";
import { displayName, labelWithDuplicates } from "../../src/grading.js";
import { mapWithConcurrency } from "../../src/concurrency.js";
import { oktUndermappenavn } from "./okter.mjs";
import { erLevert } from "./levert.mjs";

// Kurslisten caches like lenge som CLI-ets standard (cacheTtlMinutes: 15).
// Utvidelsen har ingen innstillinger (T8) og leser ikke CLI-ets config (T13).
export const CACHE_MINUTTER = 15;

// T16: så mange repoer eller flere krever en ekstra, modal bekreftelse med
// antallet før kloningen starter. Én oppgave for én klasse ligger som regel
// under; bulk over en modul, en fagretning, et kurs eller flere kurs går fort over.
export const STOR_BULK = 20;

// Samtidige kall: Canvas som i CLI-et (6), git-kloner litt færre (nett og disk).
export const CANVAS_SAMTIDIGHET = 6;
export const KLONE_SAMTIDIGHET = 4;

// Visningsnavn som CLI-ets standard (displayName: "github"); utvidelsen har
// ingen innstilling for dette (T8).
export const VISNING = Object.freeze({ displayName: "github" });

// ---------------------------------------------------------------------------
// Trevisningen: kurs -> fagretning -> modul -> oppgave -> innleveringer.
// Nodene er rene objekter. `type` styrer contextValue og hva «Klon» gjør.
// Ingen id her: bla-vindu.js gir hver node en ugjennomsiktig id (T11).
// ---------------------------------------------------------------------------

export function kursnoder(courses, t) {
  return sortByGrading(courses).map((course) => ({
    type: "kurs",
    label: course.name,
    description: t.gradingLabel(course.needsGrading),
    course,
    pool: course.assignments,
  }));
}

// Fagretningene i et kurs, som CLI-ets pickCategory (uten «Vis alle oppgaver»:
// det tilsvarer kursnoden selv).
export function fagretningsnoder(course, t) {
  const { categories, uncategorized } = buildCategoryTree(course.assignments);
  const noder = sortByGrading(categories).map((category) => ({
    type: "fagretning",
    label: category.fagretning,
    description: `${t.gradingLabel(category.needsGrading)} (${category.all.length})`,
    course,
    category,
    pool: category.all,
  }));
  if (uncategorized.length > 0) {
    const needsGrading = uncategorized.reduce((sum, a) => sum + a.needsGrading, 0);
    noder.push({
      type: "fagretning",
      label: t.uncategorized(),
      description: `${t.gradingLabel(needsGrading)} (${uncategorized.length})`,
      course,
      category: { fagretning: t.uncategorized(), all: uncategorized, needsGrading, hasSubmodules: false },
      pool: uncategorized,
    });
  }
  return noder;
}

export function modulnoder(course, category, t) {
  const entries = [...category.modulMap.entries()].map(([modul, list]) => ({
    modul,
    list,
    needsGrading: list.reduce((sum, a) => sum + a.needsGrading, 0),
  }));
  return sortByGrading(entries).map((e) => ({
    type: "modul",
    label: e.modul,
    description: `${t.gradingLabel(e.needsGrading)} (${e.list.length})`,
    course,
    category,
    modul: e.modul,
    pool: e.list,
  }));
}

export function oppgavenoder(course, pool, t) {
  return sortByGrading(pool).map((assignment) => ({
    type: "oppgave",
    label: assignment.name,
    description: t.gradingLabel(assignment.needsGrading),
    course,
    assignment,
  }));
}

// Barna til en fagretning: moduler hvis den har det, ellers oppgavene direkte.
export function fagretningsbarn(node, t) {
  return node.category.hasSubmodules
    ? modulnoder(node.course, node.category, t)
    : oppgavenoder(node.course, node.pool, t);
}

// Innleveringene til én oppgave. Navnet er GitHub-eieren (eller Canvas-navnet uten
// lenke), med et skillende navn i parentes ved duplikater (T1a). Aldri `body` (T-A).
// Levert (erLevert, ./levert.mjs): status, og nåværende karakter når den finnes
// («vurdert (nåværende: A)»), og «· fritatt» når innleveringen er fritatt.
// 0.4.0 (tilsynets O6 revidert, Lars 2a): ikke levert gir bare faste ord og
// karakterverdien: «ikke levert», «ikke levert · fritatt» eller «ikke levert · <karakter>».
// 0.3.0: kommentartråden gir et merke: «· N kommentarer», og «· nytt» når siste
// melding er fra eleven. `kommentarer: null` (ikke hentet) eller quiz gir intet
// merke. Bare tall og faste ord, aldri kommentartekst (K10).
export function innleveringsbeskrivelse(sub, t, { quiz = false } = {}) {
  const harKarakter = sub.currentGrade != null && sub.currentGrade !== "";
  const fritatt = sub.excused === true;
  let tekst;
  if (!erLevert(sub)) {
    const tillegg = fritatt ? t.vscExcused() : harKarakter ? String(sub.currentGrade) : "";
    tekst = tillegg ? `${t.vscNotSubmittedThread()} · ${tillegg}` : t.vscNotSubmittedThread();
  } else {
    const status = isNeedsGrading(sub)
      ? t.filterNeedsGrading()
      : sub.workflowState === "graded"
        ? t.vscGraded()
        : String(sub.workflowState ?? "");
    tekst = harKarakter ? `${status} (${t.currentGradeLabel(sub.currentGrade)})` : status;
    if (fritatt) tekst = `${tekst} · ${t.vscExcused()}`;
  }
  const merke = quiz ? "" : kommentarmerke(sub.kommentarer, t);
  return merke ? `${tekst} · ${merke}` : tekst;
}

// «nytt» (Lars 2026-11-05, svar 1 og 2): den siste meldingen i tråden (sortert på
// tid og id av tilKommentarer, før noen avkorting) er fra eleven. Et svar fra en
// annen lærer regnes som besvart. Ingen liste (ikke hentet) eller tom liste: nei.
export function harNytt(kommentarer) {
  return Array.isArray(kommentarer) && kommentarer.length > 0 && kommentarer[kommentarer.length - 1]?.fraEleven === true;
}

export function kommentarmerke(kommentarer, t) {
  if (!Array.isArray(kommentarer) || kommentarer.length === 0) return "";
  const deler = [t.vscCommentsCount(kommentarer.length)];
  if (harNytt(kommentarer)) deler.push(t.vscCommentsNew());
  return deler.join(" · ");
}

// D6d: etter en vellykket sending fra karakterpanelet. `hendelse` er
// { kursId, oppgaveId, userId, karakter, status, kommentarer } (fra panelets
// etterSending). 0.3.0: gjelder også ikke-leverte (`ikkeLevert`, i 0.4.0 i gruppen).
export const INNLEVERINGSTYPER = Object.freeze(["innlevering", "ikkeLevert"]);
export function gjelderInnlevering(node, { kursId, oppgaveId, userId }) {
  return (
    INNLEVERINGSTYPER.includes(node?.type) &&
    (node.assignment.courseId ?? node.course.id) === kursId &&
    node.assignment.id === oppgaveId &&
    node.sub.userId === userId
  );
}
// `kommentarer` byttes bare når svaret hadde en gyldig tråd (liste); ellers beholdes
// den gamle (PUT-svar uten gyldig tråd skal ikke tømme den). 0.4.0 (G5): `excused` byttes
// bare når svaret hadde det (boolean), så raden viser «fritatt» etter et menyvalg.
export function medNyKarakter(sub, { karakter, status, kommentarer, excused }) {
  return {
    ...sub,
    currentGrade: karakter,
    workflowState: status ?? sub.workflowState,
    ...(Array.isArray(kommentarer) ? { kommentarer } : {}),
    ...(typeof excused === "boolean" ? { excused } : {}),
  };
}

// 0.4.0 (plan G3, tilsynets O11): oppgavetyper som regnes som quiz. Klassisk quiz
// (`online_quiz`, samme som CLI-ets isQuizAssignment) og `external_tool` (New Quizzes
// og andre LTI-verktøy). De får ingen «Ikke levert»-gruppe.
export const QUIZ_LIGNENDE = Object.freeze(["online_quiz", "external_tool"]);
export function erQuizLignende(assignment) {
  return Array.isArray(assignment?.submissionTypes) && assignment.submissionTypes.some((s) => QUIZ_LIGNENDE.includes(s));
}

// Radene under en oppgave: de leverte (erLevert) først, så (0.4.0, plan G3, Lars
// 2b/2a, tilsynets O6 revidert) én sammenfoldet gruppe «Ikke levert (N)» med alle
// som ikke har levert, som barn av typen `ikkeLevert` (også de uten tråd, og
// «graded» uten innlevering). Gruppen finnes på alle oppgavetyper unntatt
// quiz-lignende (erQuizLignende), og bare når N > 0. `ikkeLevert` kan ikke klones,
// får ingen Pages-sjekk og ingen GitHub-kall (K13); den åpnes i karakterpanelet.
// Klassisk quiz: ingen merker (Lars 2026-11-06). Duplikatnavn (T1a) regnes over
// alle radene; to ikke-leverte uten repo med likt Canvas-navn kan ikke skilles
// (samme begrensning som for leverte uten lenke). Gruppen har ingen id her
// (bla-vindu.js gir den en ugjennomsiktig id, som alle andre noder).
export function innleveringsnoder(course, assignment, submissions, t) {
  const quiz = isQuizAssignment(assignment);
  const levert = submissions.filter(erLevert);
  const ikkeLevert = erQuizLignende(assignment) ? [] : submissions.filter((s) => !erLevert(s));
  const alle = [...levert, ...ikkeLevert];
  const labels = labelWithDuplicates(alle, VISNING);
  const noder = alle.map((sub, i) => ({
    type: i < levert.length ? "innlevering" : "ikkeLevert",
    label: labels[i],
    description: innleveringsbeskrivelse(sub, t, { quiz }),
    tooltip: sub.repo ? t.vscSubmissionTooltip(sub.studentName, sub.owner) : t.vscSubmissionTooltipNoLink(sub.studentName),
    course,
    assignment,
    sub,
  }));
  const rader = noder.slice(0, levert.length);
  const barn = noder.slice(levert.length);
  if (barn.length > 0) {
    rader.push({ type: "ikkeLevertGruppe", label: t.vscNotSubmittedGroup(barn.length), course, assignment, barn });
  }
  return rader;
}

// Hvilken node «Klon» gjelder. Fra trevisningen kommer selve node-objektet; en
// id som tekst godtas bare i testmodus (ExtensionMode.Test), så andre utvidelser
// ikke kan starte en kloning med en id. En ukjent eller gammel node (fra før
// «Oppdater») gir null. `typer` begrenser hvilke nodetyper som godtas (standard
// KLONBARE; «Åpne GitHub Pages» godtar bare innleveringer).
export const KLONBARE = Object.freeze(["kurs", "fagretning", "modul", "oppgave", "innlevering"]);
export function nodeFraArg(arg, noder, testmodus, typer = KLONBARE) {
  const node = typeof arg === "string" ? (testmodus ? noder.get(arg) : undefined) : arg;
  if (!node || typeof node !== "object" || noder.get(node.id) !== node) return null;
  return typer.includes(node.type) ? node : null;
}

// 0.4.0 «Åpne oppgaven i Canvas» (tilsynets O3): kurs- og oppgave-ID fra en
// oppgavenode som allerede er slått opp med nodeFraArg (samme kursregel som
// panelets binding: `assignment.courseId ?? course.id`). Bare ID-ene, aldri en URL
// (`html_url` leses ikke). Annen nodetype eller manglende felt: null.
export function oppgaveIder(node) {
  if (node?.type !== "oppgave" || !node.assignment || !node.course) return null;
  return { kursId: node.assignment.courseId ?? node.course.id, oppgaveId: node.assignment.id };
}

// ---------------------------------------------------------------------------
// Valg i QuickPick (T16).
// ---------------------------------------------------------------------------

// Bulk-filteret, med «trenger retting» først og som standardvalg (`standard`
// blir QuickPick sin activeItems, se ./velg.js).
export function bulkfilterValg(t) {
  return [
    { label: t.filterNeedsGrading(), filter: "needs_grading", standard: true },
    { label: t.filterAll(), filter: "all" },
  ];
}

// Valgene for én oppgave, som CLI-ets pickCloneScope (uten karaktersetting,
// som kommer i D6): «trenger retting» først når det er et reelt valg.
export function omfangValg(submitted, needsGrading, t) {
  const valg = [];
  if (needsGrading.length > 0 && needsGrading.length < submitted.length) {
    valg.push({ label: t.onlyNeedsGrading(needsGrading.length), omfang: "needs_grading", standard: true });
  }
  valg.push({ label: t.allSubmitted(submitted.length), omfang: "all" });
  valg.push({ label: t.chooseYourself(), omfang: "choose" });
  return valg;
}

// «Velg selv»: én rad per levert innlevering, de som trenger retting forhåndsvalgt.
export function velgSelvValg(submitted, t) {
  const labels = labelWithDuplicates(submitted, VISNING);
  return submitted.map((sub, i) => ({
    label: labels[i],
    description: isNeedsGrading(sub) ? t.filterNeedsGrading() : String(sub.workflowState ?? ""),
    picked: isNeedsGrading(sub),
    sub,
  }));
}

export function trengerBekreftelse(antall) {
  return antall >= STOR_BULK;
}

// Omfangene ved kloning på tvers av kurs: alle oppgaver, hver fagretning, og
// hver modul i en fagretning (samme tre som CLI-ets navigasjon, flatet ut).
export function omfangPaTvers(course, t) {
  const valg = [{ label: t.allAssignments(), description: `(${course.assignments.length})`, pool: course.assignments }];
  for (const f of fagretningsnoder(course, t)) {
    valg.push({ label: f.label, description: f.description, pool: f.pool });
    if (f.category.hasSubmodules) {
      for (const m of modulnoder(course, f.category, t)) {
        valg.push({ label: `${f.label} › ${m.label}`, description: m.description, pool: m.pool });
      }
    }
  }
  return valg;
}

// ---------------------------------------------------------------------------
// Kloning inn i en økt.
// ---------------------------------------------------------------------------

// Oppgavemappen i økten: <økt>/<assignment_id>/, eller
// <økt>/<kurs>/<assignment_id>/ på tvers av kurs. Samme struktur som CLI-ets
// destRootFor, men den direkte undermappen navngis med oktUndermappenavn, så
// den aldri begynner med punktum (T9a: et kurs som heter «.vscode» blir
// «_.vscode»).
export function oktOppgavemappe(oktSti, sub, crossCourse) {
  const id = String(sub.assignmentId);
  return crossCourse
    ? path.join(oktSti, oktUndermappenavn(sub.courseName), oktUndermappenavn(id))
    : path.join(oktSti, oktUndermappenavn(id));
}

// Lager planen: hvor hver innlevering skal, eller at den mangler lenke. Mappenavn
// (<eier>_<repo>, -2 ved kollisjon) bestemmes her, i rekkefølge, før kloningen
// går i parallell. `items` er merket med assignmentId/courseName (selectForBulk
// eller itemsForAssignment).
export function planleggKloning(items, oktSti, crossCourse) {
  const brukt = new Map();
  return items.map((sub) => {
    const destRoot = oktOppgavemappe(oktSti, sub, crossCourse);
    const navn = displayName(sub, VISNING);
    const nokkel = assignmentKey(sub, crossCourse);
    if (!sub.repo) return { sub, navn, nokkel, destRoot, dest: null };
    if (!brukt.has(destRoot)) brukt.set(destRoot, new Set());
    const [owner, repoName] = sub.repo.split("/");
    const dest = path.join(destRoot, repoFolderName(owner, repoName, brukt.get(destRoot)));
    return { sub, navn, nokkel, destRoot, dest };
  });
}

// Kjører planen. `klon(repo, dest)` er cloneRepoAsync med økten som rot og
// signalet bundet inn. Gir ett resultat per jobb, i samme rekkefølge:
// status "klonet" | "uten_lenke" | "uten_tilgang" | "klone_feil" | "avbrutt".
// Etter avbrudd startes ingen nye kloninger.
export async function kjorKloning(plan, { klon, signal, samtidighet = KLONE_SAMTIDIGHET, underveis } = {}) {
  let ferdige = 0;
  const totalt = plan.length;
  return mapWithConcurrency(plan, samtidighet, async (jobb) => {
    let status;
    try {
      if (signal?.aborted) status = "avbrutt";
      else {
        mkdirSync(jobb.destRoot, { recursive: true });
        if (!jobb.dest) status = "uten_lenke";
        else {
          const r = await klon(jobb.sub.repo, jobb.dest);
          if (r.ok) status = "klonet";
          else if (r.aborted || r.interrupted) status = "avbrutt";
          else if (r.reason === "no_access") status = "uten_tilgang";
          else status = "klone_feil";
        }
      }
    } catch {
      status = signal?.aborted ? "avbrutt" : "klone_feil";
    }
    ferdige++;
    underveis?.(ferdige, totalt);
    return { ...jobb, status };
  });
}

// Grunnen i uten_lenke.txt. Samme tekster som CLI-et, men uten git sin
// feilmelding ved klone-feil (rå stderr med repo-URL, DECISIONS 2026-10-29).
export function grunn(resultat, t) {
  if (resultat.status === "uten_lenke") return t.reasonNoLink();
  if (resultat.status === "uten_tilgang") return t.reasonNoAccess(resultat.sub.repo);
  return t.vscReasonCloneFailed(resultat.sub.repo);
}

// Skriver uten_lenke.txt i hver oppgavemappe som har innleveringer uten
// vellykket kloning (samme format som CLI-et: formatSkippedLog). Gir antall filer.
export function skrivUtenLenke(resultater, t) {
  const perOppgave = new Map();
  for (const r of resultater) {
    if (r.status === "klonet" || r.status === "avbrutt") continue;
    if (!perOppgave.has(r.nokkel)) perOppgave.set(r.nokkel, { destRoot: r.destRoot, entries: [] });
    perOppgave.get(r.nokkel).entries.push({ name: r.navn, reason: grunn(r, t) });
  }
  for (const { destRoot, entries } of perOppgave.values()) {
    mkdirSync(destRoot, { recursive: true });
    writeFileSync(path.join(destRoot, "uten_lenke.txt"), formatSkippedLog(entries));
  }
  return perOppgave.size;
}

// Bare antall (T11): trygt for OutputChannel og meldinger.
export function oppsummer(resultater) {
  const o = { klonet: 0, utenLenke: 0, utenTilgang: 0, kloneFeil: 0, avbrutt: 0, totalt: resultater.length };
  for (const r of resultater) {
    if (r.status === "klonet") o.klonet++;
    else if (r.status === "uten_lenke") o.utenLenke++;
    else if (r.status === "uten_tilgang") o.utenTilgang++;
    else if (r.status === "avbrutt") o.avbrutt++;
    else o.kloneFeil++;
  }
  return o;
}
