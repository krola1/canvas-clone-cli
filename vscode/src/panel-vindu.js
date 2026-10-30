// VS Code-delen av karakterpanelet (D6b: bare visning, ingen sending), bare i
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
// - D6b: en gyldig «send» sendes ikke til Canvas; panelet sier at sending kommer
//   (D6c kobler på vurderFersk, modal bekreftelse og gradeSubmission her).
//
// Tilsynets krav: T-A (bindingen har ikke body), T1-V (ett panel, generasjon,
// ingen ID-er fra webviewen), T10 (CSP med nonce, hviteliste, skjemavalidering),
// T11 (ingen elevdata i globalState/workspaceState/OutputChannel, ingen
// serializer, ingen setState, retainContextWhenHidden av).
import * as vscode from "vscode";
import { lagPanel, visningsmodell, validerMelding, feilmelding } from "./panel.mjs";
import { lagHtml, lagNonce } from "./panel-html.mjs";

export const PANEL_TYPE = "canvasClone.karakterpanel";

// `testmodus`: innsyn i HTML og sendte meldinger for VS Code-testene
// (ExtensionMode.Test, se extension.js). Bare i minnet.
export function startPanel(context, t, { testmodus = false } = {}) {
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
      handter(m);
    });
    p.onDidDispose(() => {
      if (webview !== p) return;
      webview = null;
      panel.losne();
    });
    opprettet++;
    return p;
  }

  // Én melding fra webviewen. Returverdien brukes bare av testene.
  function handter(melding) {
    const r = validerMelding(melding, panel.gjeldende);
    if (!r.ok) {
      post({ type: "melding", tekst: feilmelding(r.grunn, t), feil: true });
      return { status: "avvist", grunn: r.grunn };
    }
    if (r.type === "klar") {
      if (innsyn) innsyn.klar++;
      visGjeldende();
      return { status: "klar" };
    }
    // D6b: ingen sending. D6c bytter ut dette steget.
    post({ type: "melding", tekst: t.vscPanelSendNotYet(), feil: false });
    return { status: "ikke_sendt" };
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
