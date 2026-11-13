// VS Code-delen av karakterpanelet (D6b: visning, D6c: sending), bare i
// hovedvinduet. Den rene logikken ligger i ./panel.mjs (binding, visningsmodell,
// validering, feilmeldinger) og ./panel-html.mjs (HTML, CSP og webview-skript).
//
// - «Sett karakter …» på en innleveringsnode i trevisningen -> `settKarakter(node)`.
//   `panel.bind(node)` gir ny generasjon; quiz og ikke levert gir `feilmelding`.
// - Ett webview-panel. Finnes det, gjenbrukes det (reveal) og bindes på nytt;
//   webviewen får ny visningsmodell og dermed tomt skjema (B4). Lukkes det,
//   løsnes bindingen (`losne`).
// - Webviewen sier «klar» når skriptet har lastet (også etter at panelet har
//   vært skjult, siden retainContextWhenHidden er av); da sendes gjeldende modell.
// - Alle meldinger fra webviewen går gjennom `validerMelding`. Avviste meldinger
//   gir en fast feilmelding i panelet og logges aldri.
// - D6c: en gyldig «send» (én om gangen; en ny mens den første pågår avvises):
//   hent innleveringene på nytt med bindingens ID-er, `vurderFersk` («avbryt» ->
//   feilmelding i panelet), modal bekreftelse i extension host med navnet fra den
//   bundne user_id, sjekk at bindingen og generasjonen er de samme etter modalen,
//   så `gradeSubmission` med ID-ene fra bindingen under `withProgress`. Suksess:
//   ny karakter i bindingen og visningsmodellen, tomt skjema. Feil: fast tekst med
//   bare «HTTP nnn» eller nettverksfeilen, tokenet vasket bort; skjemaet beholdes.
//   OutputChannel får bare «karakter sendt», uten elevdata.
//
// Tilsynets krav: T-A (bindingen har ikke body), T1-V (ett panel, generasjon,
// ingen ID-er fra webviewen), T10 (CSP med nonce, hviteliste, skjemavalidering),
// T11 (ingen elevdata i globalState/workspaceState/OutputChannel, ingen
// serializer, ingen setState, retainContextWhenHidden av).
//
// 0.2.0, GitHub Pages (P3/P9): når panelet bindes, sjekkes bindingens eier/repo
// (`sjekk`, felles med trevisningen). Knappen styres av en egen `pages`-melding
// (pagesModell) etter hver `vis` (klar, binding, etter sending) og når statusen
// endres; aldri en ny `vis`, som ville tømt skjemaet. Klikk gir bare
// `{ type: "apnePages", generasjon }`; eier/repo slås opp fra `panel.gjeldende`, og
// ./pages-vindu.js bygger og åpner URL-en.
//
// 0.3.0, kommentartråden (tilsynets K2–K6, K9, K12, K13; Lars 2026-11-05/06):
// - Tråden (`tradModell`) sendes som egen melding etter `vis` (og `pages`), også
//   etter «klar». «Oppdater fra Canvas» (`glemTrad`) viser den som «ikke hentet»;
//   oppsett og sletting av token løser bindingen (`losne`).
// - «Vis kommentarer» (`visKommentarer`) binder bare noder av typen `ikkeLevert`
//   (ikke levert, men med tråd): bare lese og svare. «Sett karakter» binder bare
//   `innlevering`. Ingen Pages-sjekk for `ikkeLevert` (K13: ingen GitHub-kall).
// - «Svar» (`{ type: "svar", generasjon, tekst }`): samme `sender`-flagg som
//   karakteren; fersk henting uten kommentarer, `vurderFerskSvar` (avbryter bare ved
//   tvetydig/borte), modal `bekreftSvar` med navnet fra bundet user_id, generasjonen
//   sjekkes etter modalen, så `gradeSubmission` med bare `comment[text_comment]`.
//   Suksess: `sendt` (tøm bare svarfeltet) og ny tråd fra PUT-svaret. Feil med
//   «HTTP nnn»: ikke sendt. Annen feil (nettverk, ugyldig JSON): «kan være sendt».
// - «Åpne i Canvas» (`{ type: "apneCanvas", generasjon }`): bindingen gis til
//   ./canvaslenke-vindu.js, som bygger, sjekker og åpner innleveringssiden.
// - 0.4.0 «Åpne oppgaven i Canvas» (`{ type: "apneOppgave", generasjon }`, O3): samme
//   vei, med kurs- og oppgave-ID fra bindingen (oppgavesiden).
import * as vscode from "vscode";
import { listSubmissions, gradeSubmission } from "../../src/canvas.js";
import {
  lagPanel,
  visningsmodell,
  validerMelding,
  vurderFersk,
  vurderFerskSvar,
  bekreftelse,
  bekreftSvar,
  sendArgumenter,
  svarArgumenter,
  etterSending,
  sendefeil,
  feilmelding,
  pagesModell,
  tradModell,
  sendtModell,
} from "./panel.mjs";
import { delRepo, pagesNokkel } from "./pages.mjs";
import { lagHtml, lagNonce } from "./panel-html.mjs";
import { hentPalogging, utenToken, canvasFeil, tryggDetalj } from "./oppsett.mjs";

// 0.3.0: nodetypene hver kommando kan binde (kritiker B1: eksplisitte lister).
export const KARAKTER_TYPER = Object.freeze(["innlevering"]);
export const KOMMENTAR_TYPER = Object.freeze(["ikkeLevert"]);

export const PANEL_TYPE = "canvasClone.karakterpanel";

// `testmodus`: innsyn i HTML og sendte meldinger for VS Code-testene
// (ExtensionMode.Test, se extension.js). Bare i minnet.
// `lager` ({ globalState, secrets }) gir Canvas-URL og token; `engelsk` språket
// for kjernens feilmeldinger; `logg(tekst)` skriver til OutputChannel (T11).
// `vedSendt({ kursId, oppgaveId, userId, karakter, status })` kalles etter hver
// vellykket sending, også om panelet har byttet elev i mellomtiden (D6d: treet
// oppdaterer noden, se karakterSatt i bla-vindu.js). Bare i minnet.
// `sjekk` (lagPagesSjekk) og `pages` (startPages) er felles med trevisningen (extension.js).
// `canvaslenke` (startCanvaslenke) åpner innleveringssiden i Canvas (0.3.0).
export function startPanel(
  context,
  t,
  { testmodus = false, lager, engelsk = false, logg = () => {}, vedSendt = () => {}, sjekk, pages, canvaslenke } = {},
) {
  const panel = lagPanel();
  let webview = null; // vscode.WebviewPanel
  let opprettet = 0;
  const innsyn = testmodus ? { html: null, sendt: [], klar: 0 } : null;

  function post(melding) {
    if (!webview) return false;
    innsyn?.sendt.push(melding);
    webview.webview.postMessage(melding).then(undefined, () => {});
    return true;
  }

  // Pages-knappen for den gjeldende bindingen (egen melding, etter `vis`).
  function postPages() {
    const b = panel.gjeldende;
    const r = b ? delRepo(b.repo) : null;
    const modell = pagesModell(b, r && sjekk ? sjekk.status(r.owner, r.repo) : undefined, t);
    if (modell) post(modell);
  }

  // Tråden for den gjeldende bindingen (egen melding, etter `vis`).
  function postTrad() {
    const modell = tradModell(panel.gjeldende, t);
    if (modell) post(modell);
  }

  function visGjeldende() {
    const modell = visningsmodell(panel.gjeldende, t);
    const ok = post(modell ?? { type: "tom", tekst: feilmelding("ingen_binding", t) });
    if (modell) {
      postPages();
      postTrad();
    }
    return ok;
  }

  // Ny status for bindingens eier/repo (eller alle, etter «Oppdater»): bare knappen oppdateres.
  if (sjekk) {
    context.subscriptions.push(
      sjekk.onEndret((nokkel) => {
        const r = delRepo(panel.gjeldende?.repo);
        if (!r) return;
        if (nokkel === null || nokkel === pagesNokkel(r.owner, r.repo)) postPages();
      }),
    );
  }

  function lagWebview() {
    const p = vscode.window.createWebviewPanel(PANEL_TYPE, t.vscPanelTitle(), vscode.ViewColumn.Active, {
      enableScripts: true,
      enableForms: false,
      enableCommandUris: false,
      enableFindWidget: false,
      retainContextWhenHidden: false,
      // Skriptet og stilen ligger inline med nonce; ingen lokale filer trengs.
      localResourceRoots: [],
    });
    const html = lagHtml(lagNonce());
    p.webview.html = html;
    if (innsyn) innsyn.html = html;
    p.webview.onDidReceiveMessage((m) => {
      handter(m).catch(() => {});
    });
    p.onDidDispose(() => {
      if (webview !== p) return;
      webview = null;
      panel.losne();
    });
    opprettet++;
    return p;
  }

  const melding = (tekst, feil) => post({ type: "melding", tekst, feil });

  // Én melding fra webviewen. Returverdien brukes bare av testene.
  let sender = false;
  async function handter(m) {
    // Bindingen meldingen ble validert mot, fanget før første await.
    const binding = panel.gjeldende;
    const r = validerMelding(m, binding);
    if (!r.ok) {
      melding(feilmelding(r.grunn, t), true);
      return { status: "avvist", grunn: r.grunn };
    }
    if (r.type === "klar") {
      if (innsyn) innsyn.klar++;
      visGjeldende();
      return { status: "klar" };
    }
    if (r.type === "apnePages") {
      // Eier/repo fra bindingen som meldingen ble validert mot (P3/P9).
      const res = pages ? await pages.apne(binding.repo) : { status: "ingen_lenke" };
      if (res.status !== "apnet") postPages();
      return { status: "pages", resultat: res.status };
    }
    if (r.type === "apneCanvas") {
      // ID-ene fra bindingen som meldingen ble validert mot (K4).
      const res = canvaslenke ? await canvaslenke.apne(binding) : { status: "ugyldig" };
      return { status: "canvas", resultat: res.status };
    }
    if (r.type === "apneOppgave") {
      // Kurs- og oppgave-ID fra bindingen som meldingen ble validert mot (O3).
      const res = canvaslenke ? await canvaslenke.apneOppgave(binding) : { status: "ugyldig" };
      return { status: "oppgave", resultat: res.status };
    }
    // Én sending om gangen: flagget settes før første await.
    if (sender) {
      melding(feilmelding("opptatt", t), true);
      return { status: "avvist", grunn: "opptatt" };
    }
    sender = true;
    let config = null;
    try {
      config = await palogging();
      if (r.type === "svar") return await svar(config, binding, r.tekst);
      return await send(config, binding, { karakter: r.karakter, kommentar: r.kommentar });
    } catch (err) {
      melding(t.vscUnexpectedError(vask(err?.code ?? err?.message, config)), true);
      return { status: "feil" };
    } finally {
      sender = false;
    }
  }

  async function palogging() {
    if (!lager) return null;
    const p = await hentPalogging(lager);
    return p.mangler ? null : { canvasUrl: p.canvasUrl, canvasToken: p.canvasToken, joeMode: engelsk };
  }

  const vask = (tekst, config) => utenToken(String(tekst ?? ""), config?.canvasToken);
  // Bindingen er fortsatt den gjeldende: ingen ny elev, ingen lukking i mellomtiden.
  // Samme generasjon = samme elev (bindingen kan være byttet ut med ny karakter eller
  // tråd, men ID-ene er de samme innenfor en generasjon).
  const erGjeldende = (binding) => panel.gjeldende?.generasjon === binding.generasjon && panel.generasjon === binding.generasjon;

  // Selve sendingen. `binding` er den gjeldende da meldingen ble validert; alle
  // ID-er kommer herfra, aldri fra webviewen (T1-V).
  async function send(config, binding, skjema) {
    if (!config) {
      melding(t.vscNeedsSetup(), true);
      return { status: "ikke_satt_opp" };
    }

    // Steg 2: hent innleveringen på nytt og sammenlign.
    let ferske;
    try {
      ferske = await listSubmissions(config, binding.kursId, binding.oppgaveId);
    } catch (err) {
      melding(t.vscPanelRefetchFailed(), true);
      // T-A: bare «HTTP nnn» eller nettverksfeilen, aldri en JSON-feil som kan sitere svaret.
      vscode.window.showErrorMessage(t.vscCanvasError(canvasFeil(err, config.canvasToken)));
      return { status: "feil", steg: "hent" };
    }
    if (!erGjeldende(binding)) {
      melding(feilmelding("gammel_generasjon", t), true);
      return { status: "avbrutt", grunn: "gammel_generasjon" };
    }
    const vurdering = vurderFersk(binding, ferske);
    if (vurdering.utfall === "avbryt") {
      melding(feilmelding(vurdering.grunn, t), true);
      return { status: "avbrutt", grunn: vurdering.grunn };
    }

    // Steg 3: modal bekreftelse i extension host (T10). Avbryt/Escape = ingenting.
    const k = bekreftelse(binding, skjema, vurdering, t);
    const valg = await vscode.window.showWarningMessage(k.melding, { modal: true, detail: k.detalj }, k.knapp);
    if (valg !== k.knapp) {
      if (erGjeldende(binding)) melding(t.gradeCancelled(), false);
      return { status: "avbrutt", grunn: "modal" };
    }
    // Steg 4: byttet læreren elev eller lukket panelet mens modalen sto åpen?
    if (!erGjeldende(binding)) {
      melding(feilmelding("gammel_generasjon", t), true);
      return { status: "avbrutt", grunn: "gammel_generasjon" };
    }

    // Steg 5: send, med ID-ene fra bindingen.
    const resultat = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.gradingInProgress() },
      () => gradeSubmission(config, ...sendArgumenter(binding, skjema)),
    );
    // Steg 6: resultatet i panelet (bare hvis det fortsatt viser denne eleven).
    const elev = t.gradeStudentLabel(vurdering.fersk.canvasNavn, vurdering.fersk.github);
    if (!resultat.ok) {
      const tekst = sendefeil(resultat, t, config.canvasToken);
      if (erGjeldende(binding)) melding(tekst, true);
      else vscode.window.showErrorMessage(tekst);
      return { status: "feil", steg: "send", reason: resultat.reason };
    }
    logg(t.vscLogGradeSent());
    // Bare grade og workflow_state leses fra svaret (det har også body, T-A).
    const endring = etterSending(binding, skjema, resultat.submission);
    try {
      vedSendt({ kursId: binding.kursId, oppgaveId: binding.oppgaveId, userId: binding.userId, ...endring });
    } catch {
      // Treet er bare visning; sendingen er uansett gjort.
    }
    const ny = panel.etterSending(binding, endring);
    if (ny) {
      // B5: bare skjemaet tømmes; et utkast i svarfeltet står.
      post(sendtModell(ny, "skjema", t));
      postTrad();
      melding(t.gradeSuccess(elev), false);
    } else {
      vscode.window.showInformationMessage(t.gradeSuccess(elev));
    }
    return { status: "sendt" };
  }

  // 0.3.0 «Svar» (K5, Lars 3b). `binding` er den gjeldende da meldingen ble validert;
  // alle ID-er kommer herfra. Gjelder også ikke-leverte.
  async function svar(config, binding, tekst) {
    if (!config) {
      melding(t.vscNeedsSetup(), true);
      return { status: "ikke_satt_opp" };
    }
    // Steg 1: hent innleveringen på nytt (uten kommentarer) og sammenlign.
    let ferske;
    try {
      ferske = await listSubmissions(config, binding.kursId, binding.oppgaveId);
    } catch (err) {
      melding(t.vscPanelRefetchFailed(), true);
      vscode.window.showErrorMessage(t.vscCanvasError(canvasFeil(err, config.canvasToken)));
      return { status: "feil", steg: "hent" };
    }
    if (!erGjeldende(binding)) {
      melding(feilmelding("gammel_generasjon", t), true);
      return { status: "avbrutt", grunn: "gammel_generasjon" };
    }
    const vurdering = vurderFerskSvar(binding, ferske);
    if (vurdering.utfall === "avbryt") {
      melding(feilmelding(vurdering.grunn, t), true);
      return { status: "avbrutt", grunn: vurdering.grunn };
    }
    // Steg 2: modal bekreftelse med navnet fra den bundne user_id.
    const k = bekreftSvar(binding, tekst, vurdering, t);
    const valg = await vscode.window.showWarningMessage(k.melding, { modal: true, detail: k.detalj }, k.knapp);
    if (valg !== k.knapp) {
      if (erGjeldende(binding)) melding(t.vscReplyCancelled(), false);
      return { status: "avbrutt", grunn: "modal" };
    }
    // Steg 3: byttet læreren elev eller lukket panelet mens modalen sto åpen?
    if (!erGjeldende(binding)) {
      melding(feilmelding("gammel_generasjon", t), true);
      return { status: "avbrutt", grunn: "gammel_generasjon" };
    }
    // Steg 4: send bare teksten, med ID-ene fra bindingen.
    const resultat = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t.vscReplyInProgress() },
      () => gradeSubmission(config, ...svarArgumenter(binding, tekst)),
    );
    const elev = t.gradeStudentLabel(vurdering.fersk.canvasNavn, vurdering.fersk.github);
    if (!resultat.ok) {
      // Svarte Canvas med en HTTP-feil, ble svaret ikke lagret. Ellers (nettverk,
      // ugyldig JSON) vet vi ikke: læreren må sjekke tråden før hun sender på nytt.
      const detalj = tryggDetalj(resultat, config.canvasToken);
      const tekstFeil = /^HTTP \d{3}$/.test(detalj) ? t.vscReplyFailed(detalj) : t.vscReplyMaybeSent();
      if (erGjeldende(binding)) melding(tekstFeil, true);
      else vscode.window.showErrorMessage(tekstFeil);
      return { status: "feil", steg: "send", reason: resultat.reason };
    }
    logg(t.vscLogReplySent());
    const endring = etterSending(binding, { karakter: "" }, resultat.submission);
    try {
      vedSendt({ kursId: binding.kursId, oppgaveId: binding.oppgaveId, userId: binding.userId, ...endring });
    } catch {
      // Treet er bare visning; sendingen er uansett gjort.
    }
    const ny = panel.etterSending(binding, endring);
    if (ny) {
      post(sendtModell(ny, "svar", t));
      postTrad();
      melding(t.vscReplySent(elev), false);
    } else {
      vscode.window.showInformationMessage(t.vscReplySent(elev));
    }
    return { status: "sendt" };
  }

  // Binder panelet til en innlevering og viser det. Avvist binding: feilmelding,
  // og et åpent panel tømmes (den forrige eleven skal ikke stå igjen).
  function bindOgVis(node) {
    const r = panel.bind(node);
    if (!r.ok) {
      const tekst = feilmelding(r.grunn, t);
      post({ type: "tom", tekst });
      vscode.window.showErrorMessage(tekst);
      return { status: "avvist", grunn: r.grunn, generasjon: r.generasjon };
    }
    if (webview) webview.reveal();
    else webview = lagWebview();
    visGjeldende();
    // Pages: sjekk bare den eleven læreren har valgt (Lars 2026-11-04), og aldri for
    // en elev som ikke har levert (K13).
    const repo = r.binding.levert ? delRepo(r.binding.repo) : null;
    if (repo && sjekk) sjekk.sjekk(repo.owner, repo.repo);
    return { status: "vist", generasjon: r.binding.generasjon };
  }

  // `node` er allerede slått opp med nodeFraArg (bla-vindu.js): bare node-objekter
  // fra treet (i testene også en id som tekst).
  function settKarakter(node) {
    if (!node) return { status: "ugyldig" };
    if (!KARAKTER_TYPER.includes(node.type)) {
      vscode.window.showErrorMessage(t.vscPanelPickSubmission());
      return { status: "ikke_innlevering" };
    }
    return bindOgVis(node);
  }

  // 0.3.0 «Vis kommentarer» på en elev som ikke har levert, men har en tråd. `node` er
  // slått opp med nodeFraArg og typelisten KOMMENTAR_TYPER (extension.js).
  function visKommentarer(node) {
    if (!node || !KOMMENTAR_TYPER.includes(node.type)) return { status: "ugyldig" };
    return bindOgVis(node);
  }

  // 0.3.0 (K9): «Oppdater fra Canvas» glemmer tråden i panelet («ikke hentet»).
  function glemTrad() {
    if (panel.glemKommentarer()) postTrad();
  }

  // 0.3.0: oppsett og sletting av token løser bindingen; panelet tømmes. Uten binding
  // er det ingenting å løse (og generasjonen står).
  function losne() {
    if (!panel.gjeldende) return;
    panel.losne();
    post({ type: "tom", tekst: feilmelding("ingen_binding", t) });
  }

  context.subscriptions.push({ dispose: () => webview?.dispose() });

  return {
    settKarakter,
    visKommentarer,
    glemTrad,
    losne,
    // Bare for testene (ExtensionMode.Test, se extension.js).
    bindOgVis,
    handter,
    innsyn: () =>
      innsyn && {
        finnes: Boolean(webview),
        opprettet,
        generasjon: panel.generasjon,
        bundet: panel.gjeldende?.generasjon ?? null,
        html: innsyn.html,
        sendt: [...innsyn.sendt],
        klar: innsyn.klar,
      },
    lukk: () => webview?.dispose(),
  };
}
