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
import * as vscode from "vscode";
import { listSubmissions, gradeSubmission } from "../../src/canvas.js";
import {
  lagPanel,
  visningsmodell,
  validerMelding,
  vurderFersk,
  bekreftelse,
  sendArgumenter,
  etterSending,
  sendefeil,
  feilmelding,
} from "./panel.mjs";
import { lagHtml, lagNonce } from "./panel-html.mjs";
import { hentPalogging, utenToken, canvasFeil } from "./oppsett.mjs";

export const PANEL_TYPE = "canvasClone.karakterpanel";

// `testmodus`: innsyn i HTML og sendte meldinger for VS Code-testene
// (ExtensionMode.Test, se extension.js). Bare i minnet.
// `lager` ({ globalState, secrets }) gir Canvas-URL og token; `engelsk` språket
// for kjernens feilmeldinger; `logg(tekst)` skriver til OutputChannel (T11).
// `vedSendt({ kursId, oppgaveId, userId, karakter, status })` kalles etter hver
// vellykket sending, også om panelet har byttet elev i mellomtiden (D6d: treet
// oppdaterer noden, se karakterSatt i bla-vindu.js). Bare i minnet.
export function startPanel(context, t, { testmodus = false, lager, engelsk = false, logg = () => {}, vedSendt = () => {} } = {}) {
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

  function visGjeldende() {
    const modell = visningsmodell(panel.gjeldende, t);
    return post(modell ?? { type: "tom", tekst: feilmelding("ingen_binding", t) });
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
    // Én sending om gangen: flagget settes før første await.
    if (sender) {
      melding(feilmelding("opptatt", t), true);
      return { status: "avvist", grunn: "opptatt" };
    }
    sender = true;
    let config = null;
    try {
      config = await palogging();
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
  const erGjeldende = (binding) => panel.gjeldende === binding && panel.generasjon === binding.generasjon;

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
      visGjeldende();
      melding(t.gradeSuccess(elev), false);
    } else {
      vscode.window.showInformationMessage(t.gradeSuccess(elev));
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
    return { status: "vist", generasjon: r.binding.generasjon };
  }

  // `node` er allerede slått opp med nodeFraArg (bla-vindu.js): bare node-objekter
  // fra treet (i testene også en id som tekst).
  function settKarakter(node) {
    if (!node) return { status: "ugyldig" };
    if (node.type !== "innlevering") {
      vscode.window.showErrorMessage(t.vscPanelPickSubmission());
      return { status: "ikke_innlevering" };
    }
    return bindOgVis(node);
  }

  context.subscriptions.push({ dispose: () => webview?.dispose() });

  return {
    settKarakter,
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
