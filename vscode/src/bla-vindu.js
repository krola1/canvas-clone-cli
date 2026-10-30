// VS Code-delen av bla og klone (D5), bare i hovedvinduet. Den rene logikken
// (noder, valg, plan, kloning, oppsummering) ligger i ./bla.mjs.
//
// - Trevisning «Canvas Clone» i Utforskeren: kurs -> fagretning -> modul ->
//   oppgave -> innleveringer. TreeView fordi læreren blar fram og tilbake og
//   ser antall «klare til retting» på hvert nivå samtidig; QuickPick (./velg.js)
//   brukes for valg som skjer én gang per kloning (bulk-filter, omfang, «Velg
//   selv», kurs på tvers).
// - «Klon» på en node: kurs/fagretning/modul = bulk (T16-filter), oppgave =
//   omfang som i CLI-et, innlevering = bare den.
// - Kloning skjer inn i en ny økt fra D4 (`hoved.nyOkt`, som holder den uten
//   utløp til den åpnes eller slippes), med cloneRepoAsync (T18) og
//   mapWithConcurrency, under withProgress med Avbryt. Etterpå åpnes økten med
//   D4s åpningsflyt (`hoved.apneOkt`: T9b/T9c, forceNewWindow, noRecentEntry).
//
// Tilsynets krav: T-A (aldri `body`: dataene har den ikke), T11 (TreeItem.id
// er en teller per vindu, ingen elevdata i globalState/workspaceState/
// OutputChannel, git sin stderr vises aldri), T15 (nettkall bare til
// Canvas-URL-en og `git clone`).
import * as vscode from "vscode";
import { listTeacherCoursesWithAssignments, listSubmissions } from "../../src/canvas.js";
import { loadCourseCache, saveCourseCache, isFresh, ageMinutes } from "../../src/cache.js";
import { mapWithConcurrency } from "../../src/concurrency.js";
import { cloneRepoAsync } from "../../src/github.js";
import { sortByGrading, splitSubmissions, selectForBulk, itemsForAssignment, buildCrossCourseCourse } from "../../src/workflow.js";
import { hentPalogging, utenToken } from "./oppsett.mjs";
import { slettOkt } from "./okter.mjs";
import { finnGit } from "./git-sti.mjs";
import { velg } from "./velg.js";
import {
  CACHE_MINUTTER,
  CANVAS_SAMTIDIGHET,
  kursnoder,
  fagretningsnoder,
  fagretningsbarn,
  oppgavenoder,
  innleveringsnoder,
  bulkfilterValg,
  omfangValg,
  velgSelvValg,
  trengerBekreftelse,
  omfangPaTvers,
  planleggKloning,
  kjorKloning,
  skrivUtenLenke,
  oppsummer,
  nodeFraArg,
} from "./bla.mjs";

export const VIEW_ID = "canvasClone.tre";

const IKON = {
  kurs: "book",
  fagretning: "folder",
  modul: "folder-library",
  oppgave: "checklist",
  innlevering: "account",
  oppsett: "gear",
  info: "info",
};

// Feil fra Canvas (nettverk, HTTP, Link til annen vert) merkes, så de kan skilles
// fra lokale feil (disk, git) i meldingen til læreren.
async function fraCanvas(fn) {
  try {
    return await fn();
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { fraCanvas: true });
  }
}

// `logg(tekst)` skriver til OutputChannel. Bare antall og øktnavn (T11).
// `testmodus`: «Klon» godtar en node-id som tekst bare i testene (ExtensionMode.Test).
export function startBla(context, t, { hoved, root, lager, engelsk, logg, testmodus = false }) {
  // --- Pålogging og kurs ----------------------------------------------------
  async function palogging() {
    const p = await hentPalogging(lager);
    return p.mangler ? null : { canvasUrl: p.canvasUrl, canvasToken: p.canvasToken, joeMode: engelsk };
  }

  async function krevPalogging() {
    const config = await palogging();
    if (config) return config;
    vscode.window.showWarningMessage(t.vscNeedsSetup(), t.vscRunSetup()).then((valg) => {
      if (valg === t.vscRunSetup()) vscode.commands.executeCommand("canvasClone.setup");
    });
    return null;
  }

  // Tokenet vaskes bort fra alt som vises (det skal aldri stå i en feilmelding, men likevel).
  const vask = (tekst, config) => utenToken(String(tekst ?? ""), config?.canvasToken);
  const feiltekst = (err, config) =>
    err?.fraCanvas ? t.vscCanvasError(vask(err.message, config)) : t.vscUnexpectedError(vask(err?.code ?? err?.message, config));

  // Kurslisten for dette vinduet. Samme cache som CLI-et (src/cache.js,
  // nøkkelsatt på Canvas-URL-en, bare kurs og oppgaver), med CLI-ets standard-TTL.
  let kurs = null; // { canvasUrl, courses, alderMin }
  let tvingNeste = false; // satt av «Oppdater», nullstilles først etter vellykket henting
  async function hentKurs(config, { lokasjon = vscode.ProgressLocation.Notification } = {}) {
    const tving = tvingNeste;
    if (!tving && kurs && kurs.canvasUrl === config.canvasUrl) return kurs;
    const cached = tving ? null : loadCourseCache({ canvasUrl: config.canvasUrl });
    if (isFresh(cached, CACHE_MINUTTER)) {
      kurs = { canvasUrl: config.canvasUrl, courses: cached.courses, alderMin: ageMinutes(cached) };
      return kurs;
    }
    const courses = await vscode.window.withProgress({ location: lokasjon, title: t.fetchingCourses() }, (progress) =>
      fraCanvas(() =>
        listTeacherCoursesWithAssignments(config, (done, total) =>
          progress.report({ message: t.fetchingCoursesProgress(done, total) }),
        ),
      ),
    );
    saveCourseCache({ canvasUrl: config.canvasUrl }, courses);
    kurs = { canvasUrl: config.canvasUrl, courses, alderMin: null };
    tvingNeste = false;
    return kurs;
  }

  // Innleveringene til én oppgave, bare i minnet. `fersk`: hent på nytt (kloning).
  let innleveringer = new Map(); // "<kurs>:<oppgave>" -> innleveringer
  async function hentInnleveringer(config, course, assignment, { lokasjon = vscode.ProgressLocation.Notification, fersk = false } = {}) {
    const kursId = assignment.courseId ?? course.id;
    const nokkel = `${kursId}:${assignment.id}`;
    if (fersk || !innleveringer.has(nokkel)) {
      const subs = await vscode.window.withProgress({ location: lokasjon, title: t.fetchingSubmissionsFor(assignment.name) }, () =>
        fraCanvas(() => listSubmissions(config, kursId, assignment.id)),
      );
      innleveringer.set(nokkel, subs);
    }
    return innleveringer.get(nokkel);
  }

  // --- Trevisningen ---------------------------------------------------------
  const endret = new vscode.EventEmitter();
  let teller = 0;
  let noder = new Map(); // id -> node (for interne kommandoer og testene)
  let barnCache = new Map(); // id (eller "") -> barn, så id-ene er stabile til «Oppdater»
  let visning = null;

  // T11: ugjennomsiktig id, en teller per vindu. Aldri navn eller ID fra Canvas.
  function ny(node) {
    node.id = `cc${++teller}`;
    noder.set(node.id, node);
    return node;
  }

  function settMelding(tekst) {
    if (visning) visning.message = tekst;
  }

  // Gir { barn, lagre }. Feil og «ikke satt opp» lagres ikke i barnCache, så neste
  // utviding prøver igjen.
  async function lagBarn(node) {
    if (!node) {
      const config = await palogging();
      if (!config) {
        settMelding(t.vscNeedsSetup());
        return { barn: [{ type: "oppsett", label: t.vscRunSetup() }], lagre: false };
      }
      let k;
      try {
        k = await hentKurs(config, { lokasjon: { viewId: VIEW_ID } });
      } catch (err) {
        settMelding(feiltekst(err, config));
        return { barn: [], lagre: false };
      }
      if (k.courses.length === 0) {
        settMelding(t.noCoursesFound());
        return { barn: [], lagre: false };
      }
      settMelding(k.alderMin === null ? undefined : t.vscCacheNote(k.alderMin));
      return { barn: kursnoder(k.courses, t), lagre: true };
    }
    if (node.type === "kurs") return { barn: fagretningsnoder(node.course, t), lagre: true };
    if (node.type === "fagretning") return { barn: fagretningsbarn(node, t), lagre: true };
    if (node.type === "modul") return { barn: oppgavenoder(node.course, node.pool, t), lagre: true };
    if (node.type === "oppgave") {
      const config = await krevPalogging();
      if (!config) return { barn: [], lagre: false };
      let subs;
      try {
        subs = await hentInnleveringer(config, node.course, node.assignment, { lokasjon: { viewId: VIEW_ID } });
      } catch (err) {
        return { barn: [{ type: "info", label: feiltekst(err, config) }], lagre: false };
      }
      const barn = innleveringsnoder(node.course, node.assignment, subs, t);
      return { barn: barn.length > 0 ? barn : [{ type: "info", label: t.vscNoSubmissions() }], lagre: true };
    }
    return { barn: [], lagre: true };
  }

  async function barn(node) {
    const nokkel = node?.id ?? "";
    if (barnCache.has(nokkel)) return barnCache.get(nokkel);
    const { barn: liste, lagre } = await lagBarn(node);
    const medId = liste.map(ny);
    if (lagre) barnCache.set(nokkel, medId);
    return medId;
  }

  function treItem(node) {
    const kanApnes = ["kurs", "fagretning", "modul", "oppgave"].includes(node.type);
    const item = new vscode.TreeItem(
      node.label,
      kanApnes ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.description = node.description;
    if (node.tooltip) item.tooltip = node.tooltip;
    item.contextValue = node.type;
    item.iconPath = new vscode.ThemeIcon(IKON[node.type] ?? "circle-outline");
    if (node.type === "oppsett") item.command = { command: "canvasClone.setup", title: node.label };
    return item;
  }

  const provider = {
    onDidChangeTreeData: endret.event,
    getTreeItem: treItem,
    getChildren: (node) => barn(node),
  };
  visning = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(visning, endret);

  // «Oppdater» henter ferske data fra Canvas neste gang (som --refresh i CLI-et).
  // Telleren fortsetter, så en gammel id aldri peker på en ny node.
  function oppdater() {
    kurs = null;
    tvingNeste = true;
    noder = new Map();
    barnCache = new Map();
    innleveringer = new Map();
    endret.fire(undefined);
  }

  // --- Kloning --------------------------------------------------------------
  let kloner = false;

  // Sletter økten (etter avbrudd, «ingenting klonet» eller avbrutt åpning) og sier
  // fra om utfallet: `okTekst` bare hvis slettingen faktisk lyktes. Feiler den
  // (f.eks. EBUSY på Windows), prøver den vanlige ryddingen igjen senere.
  function slettOgMeld(okt, okTekst) {
    hoved.slipp(okt.navn);
    const res = slettOkt(root, okt.sti);
    // Finnes den ikke lenger (f.eks. slettet mens en dialog sto åpen), er målet nådd.
    const ok = res.ok || res.code === "finnes_ikke";
    if (ok) {
      if (okTekst) vscode.window.showInformationMessage(okTekst);
    } else {
      logg(t.vscLogDeleteFailed(okt.navn));
      vscode.window.showWarningMessage(t.vscDeleteFailed());
    }
    return ok;
  }

  async function klonItems(items, { crossCourse }) {
    if (items.length === 0) {
      vscode.window.showInformationMessage(t.nothingSelected());
      return { status: "ingenting" };
    }
    const gitPath = finnGit();
    if (!gitPath) {
      vscode.window.showErrorMessage(t.vscGitMissing());
      return { status: "ingen_git" };
    }
    const okt = hoved.nyOkt();
    try {
      return await klonInnIOkt(okt, items, { crossCourse, gitPath });
    } catch (err) {
      // Uventet feil: økten slettes, som når CLI-et feiler.
      slettOgMeld(okt, null);
      throw err;
    }
  }

  async function klonInnIOkt(okt, items, { crossCourse, gitPath }) {
    const plan = planleggKloning(items, okt.sti, crossCourse);
    const resultater = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.vscCloningTitle(plan.length), cancellable: true },
      async (progress, token) => {
        const ac = new AbortController();
        const lytter = token.onCancellationRequested(() => ac.abort());
        try {
          return await kjorKloning(plan, {
            signal: ac.signal,
            klon: (repo, dest) => cloneRepoAsync(repo, dest, okt.sti, { signal: ac.signal, gitPath }),
            underveis: (ferdige, totalt) =>
              progress.report({ message: t.vscCloneProgress(ferdige, totalt), increment: 100 / totalt }),
          });
        } finally {
          lytter.dispose();
        }
      },
    );
    const o = oppsummer(resultater);

    // Avbrutt: som Ctrl-C i CLI-et slettes hele økten.
    if (o.avbrutt > 0) {
      logg(t.vscLogCancelled(okt.navn, o));
      const slettet = slettOgMeld(okt, t.vscCloneCancelled());
      return { status: "avbrutt", okt: okt.navn, oppsummering: o, slettet };
    }

    skrivUtenLenke(resultater, t);
    logg(t.vscLogSummary(okt.navn, o));
    const tekst = t.vscCloneSummary(o);

    if (o.klonet === 0) {
      // Modal, så kloningen (og «én om gangen») ikke henger på en melding som ikke er lukket.
      const valg = await vscode.window.showWarningMessage(tekst, { modal: true }, t.vscOpenSessionAnyway());
      if (valg !== t.vscOpenSessionAnyway()) {
        const slettet = slettOgMeld(okt, null);
        return { status: "ingen_klonet", okt: okt.navn, oppsummering: o, slettet };
      }
    } else {
      vscode.window.showInformationMessage(tekst);
    }
    let apnet;
    try {
      apnet = await hoved.apneOkt(okt.sti);
    } catch {
      apnet = { status: "feil" };
    }
    if (apnet.status === "apnet") return { status: "apnet", okt: okt.navn, oppsummering: o };
    // Ikke åpnet: T9b/T9c avbrutt, økten forsvant under dialogene, eller en feil.
    // Økten slettes med en gang (finnes den ikke lenger, er det også i orden).
    const melding =
      apnet.status === "avbrutt"
        ? t.vscSessionDiscarded()
        : apnet.status === "borte"
          ? t.vscSessionGone()
          : t.vscSessionOpenFailed();
    const slettet = slettOgMeld(okt, melding);
    return { status: apnet.status, okt: okt.navn, oppsummering: o, slettet };
  }

  // Én kloning om gangen per vindu, så to økter ikke lages ved dobbeltklikk.
  // Feil fra Canvas og lokale feil (disk, git) får hver sin melding, uten token.
  async function enOmGangen(config, fn) {
    if (kloner) {
      vscode.window.showInformationMessage(t.vscCloneBusy());
      return { status: "opptatt" };
    }
    kloner = true;
    try {
      return await fn();
    } catch (err) {
      vscode.window.showErrorMessage(feiltekst(err, config));
      return { status: "feil", fraCanvas: Boolean(err?.fraCanvas) };
    } finally {
      kloner = false;
    }
  }

  // Bulk over en liste oppgaver (kurs, fagretning, modul, eller på tvers av kurs).
  async function klonBulk(config, course, pool, { crossCourse }) {
    const filter = await velg(bulkfilterValg(t), {
      title: t.vscBulkFilterTitle(pool.length),
      placeHolder: t.vscBulkFilterPlaceholder(),
    });
    if (!filter) return { status: "avbrutt" };

    const hentet = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.fetchingBulkSubmissions(0, pool.length), cancellable: true },
      async (progress, token) => {
        let done = 0;
        const perAssignment = await mapWithConcurrency(pool, CANVAS_SAMTIDIGHET, async (a) => {
          if (token.isCancellationRequested) return null;
          const subs = await fraCanvas(() => listSubmissions(config, a.courseId ?? course.id, a.id));
          done++;
          progress.report({ message: t.fetchingBulkSubmissions(done, pool.length) });
          return { assignment: a, subs };
        });
        return token.isCancellationRequested ? null : perAssignment;
      },
    );
    if (!hentet) return { status: "avbrutt" };

    const toClone = selectForBulk(hentet, course, filter.filter);
    if (toClone.length === 0) {
      vscode.window.showInformationMessage(t.vscNothingToClone(filter.label, pool.length));
      return { status: "ingenting" };
    }
    if (!(await bekreft(toClone.length, filter.label, pool.length))) return { status: "avbrutt" };
    return klonItems(toClone, { crossCourse });
  }

  // T16: antallet vises og må bekreftes før store kloninger.
  async function bekreft(antall, filterLabel, oppgaver) {
    if (!trengerBekreftelse(antall)) return true;
    const knapp = t.vscCloneButton(antall);
    const valg = await vscode.window.showWarningMessage(
      t.vscConfirmLargeClone(antall, filterLabel, oppgaver),
      { modal: true },
      knapp,
    );
    return valg === knapp;
  }

  // Én oppgave: omfang som CLI-ets pickCloneScope. Innleveringene hentes på nytt
  // (som CLI-et og bulk-veien), ikke fra da noden ble åpnet.
  async function klonOppgave(config, course, assignment, { crossCourse, node = null }) {
    const subs = await hentInnleveringer(config, course, assignment, { fersk: true });
    // Trevisningen viser de ferske innleveringene også (oppgavens eget tall «klare til
    // retting» kommer fra kurslisten og oppdateres først ved «Oppdater»).
    if (node && barnCache.has(node.id)) {
      for (const b of barnCache.get(node.id)) noder.delete(b.id);
      barnCache.delete(node.id);
      endret.fire(node);
    }
    const { submitted, needsGrading } = splitSubmissions(subs);
    if (submitted.length === 0) {
      vscode.window.showInformationMessage(t.vscNoSubmissions());
      return { status: "ingenting" };
    }
    const omfang = await velg(omfangValg(submitted, needsGrading, t), {
      title: t.vscCloneScopeTitle(assignment.name),
      placeHolder: t.submissionSummary(subs.length, submitted.length, needsGrading.length),
    });
    if (!omfang) return { status: "avbrutt" };
    let valgt;
    let filterLabel;
    if (omfang.omfang === "needs_grading") {
      valgt = needsGrading;
      filterLabel = t.filterNeedsGrading();
    } else if (omfang.omfang === "all") {
      valgt = submitted;
      filterLabel = t.filterAll();
    } else {
      const rader = await velg(velgSelvValg(submitted, t), { title: t.pickSpecificMessage(), canPickMany: true });
      if (!rader) return { status: "avbrutt" };
      valgt = rader.map((r) => r.sub);
      filterLabel = t.chooseYourself();
    }
    if (!(await bekreft(valgt.length, filterLabel, 1))) return { status: "avbrutt" };
    return klonItems(itemsForAssignment(valgt, course, assignment), { crossCourse });
  }

  // `arg` er noden fra trevisningen. En id som tekst godtas bare i testene; en
  // ukjent id gjør ingenting.
  async function klon(arg) {
    const node = nodeFraArg(arg, noder, testmodus);
    if (!node) return { status: "ugyldig" };
    const config = await krevPalogging();
    if (!config) return { status: "ikke_satt_opp" };
    return enOmGangen(config, () => {
      if (node.type === "innlevering") {
        return klonItems(itemsForAssignment([node.sub], node.course, node.assignment), { crossCourse: false });
      }
      if (node.type === "oppgave") return klonOppgave(config, node.course, node.assignment, { crossCourse: false, node });
      return klonBulk(config, node.course, node.pool, { crossCourse: false });
    });
  }

  // På tvers av kurs: velg kurs (flere), så omfang (alle, fagretning eller
  // modul), så «alle i listen» (bulk) eller én oppgave. Mappestrukturen blir
  // <økt>/<kurs>/<assignment_id>/ uansett, som i CLI-et.
  async function klonPaTvers() {
    const config = await krevPalogging();
    if (!config) return { status: "ikke_satt_opp" };
    return enOmGangen(config, async () => {
      const k = await hentKurs(config);
      if (k.courses.length === 0) {
        vscode.window.showInformationMessage(t.noCoursesFound());
        return { status: "ingenting" };
      }
      const valgteKurs = await velg(
        sortByGrading(k.courses).map((c) => ({ label: c.name, description: t.gradingLabel(c.needsGrading), course: c })),
        { title: t.crossCourseHeader(), placeHolder: t.pickCoursesForCrossCourseMessage(), canPickMany: true },
      );
      if (!valgteKurs || valgteKurs.length === 0) return { status: "avbrutt" };
      const course = buildCrossCourseCourse(
        valgteKurs.map((v) => v.course),
        t,
      );
      const omfang = await velg(omfangPaTvers(course, t), { title: course.name, placeHolder: t.pickCategoryMessage() });
      if (!omfang) return { status: "avbrutt" };
      const alle = { label: t.vscCloneAllInList(omfang.pool.length), alle: true };
      const oppgaver = oppgavenoder(course, omfang.pool, t).map((n) => ({
        label: n.label,
        description: `${n.assignment.courseName} · ${n.description}`,
        assignment: n.assignment,
      }));
      const valg = await velg([alle, ...oppgaver], {
        title: `${course.name} › ${omfang.label}`,
        placeHolder: t.searchAssignmentMessage(),
        matchOnDescription: true,
      });
      if (!valg) return { status: "avbrutt" };
      if (valg.alle) return klonBulk(config, course, omfang.pool, { crossCourse: true });
      return klonOppgave(config, course, valg.assignment, { crossCourse: true });
    });
  }

  // For testene og prøveriggen (aldri registrert i en vanlig installasjon, se
  // extension.js): barna til en node (eller roten) slik trevisningen ser dem.
  async function treBarn(id) {
    const node = id ? noder.get(id) : undefined;
    if (id && !node) return null;
    const liste = await barn(node);
    return liste.map((n) => {
      const item = treItem(n);
      return {
        id: item.id,
        label: item.label,
        description: item.description,
        tooltip: item.tooltip,
        contextValue: item.contextValue,
        kanApnes: item.collapsibleState !== vscode.TreeItemCollapsibleState.None,
      };
    });
  }

  // For testene og riggen: «Klon» på en id (som om læreren trykket på noden).
  const klonId = (id) => klon(noder.get(id) ?? null);

  return { oppdater, klon, klonPaTvers, treBarn, klonId, melding: () => visning?.message };
}
