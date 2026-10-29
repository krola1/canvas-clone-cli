// Felles hjelpere for røyktestene av oppsettet (D3). Ingen ekte nettverk og
// ingen ekte data (T19):
// - `globalThis.fetch` byttes ut med en falsk Canvas på https://canvas.test.invalid.
//   Alle andre verter gir nettverksfeil. Alle kall registreres, slik at testene
//   kan sjekke at det bare snakkes med Canvas-URL-en (T15).
// - `vscode.window.showInputBox` og meldingsfunksjonene byttes ut, slik at
//   kommandoene kan kjøres uten at noen taster. Utvidelsen og testene deler
//   samme `vscode`-objekt i utvidelsesverten.
const vscode = require("vscode");

const CANVAS = "https://canvas.test.invalid";
const GYLDIG_TOKEN = "falskt-gyldig-token";

function installer({ svar }) {
  const original = {
    fetch: globalThis.fetch,
    showInputBox: vscode.window.showInputBox,
    showInformationMessage: vscode.window.showInformationMessage,
    showErrorMessage: vscode.window.showErrorMessage,
    showWarningMessage: vscode.window.showWarningMessage,
  };
  const logg = { fetch: [], inputBoxer: [], meldinger: [] };
  const ko = [...svar];

  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    logg.fetch.push({ origin: u.origin, path: u.pathname, auth: opts.headers?.Authorization });
    if (u.origin !== CANVAS) throw new TypeError("fetch failed");
    if (u.pathname !== "/api/v1/users/self") return new Response("{}", { status: 404 });
    if (opts.headers?.Authorization !== `Bearer ${GYLDIG_TOKEN}`) return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ id: 1, name: "Test Lærer" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  vscode.window.showInputBox = async (opts) => {
    logg.inputBoxer.push(opts);
    return ko.shift();
  };
  for (const navn of ["showInformationMessage", "showErrorMessage", "showWarningMessage"]) {
    vscode.window[navn] = async (tekst) => {
      logg.meldinger.push({ type: navn, tekst });
      return undefined;
    };
  }

  return {
    logg,
    gjenopprett() {
      Object.assign(vscode.window, {
        showInputBox: original.showInputBox,
        showInformationMessage: original.showInformationMessage,
        showErrorMessage: original.showErrorMessage,
        showWarningMessage: original.showWarningMessage,
      });
      globalThis.fetch = original.fetch;
    },
  };
}

// Kjører en kommando med falsk Canvas og forhåndsutfylte svar i input-boksene.
async function medFalskCanvas(svar, kommando) {
  const f = installer({ svar });
  try {
    const res = await vscode.commands.executeCommand(kommando);
    return { res, ...f.logg };
  } finally {
    f.gjenopprett();
  }
}

module.exports = { CANVAS, GYLDIG_TOKEN, medFalskCanvas };
