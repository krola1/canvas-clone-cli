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

// D5: falsk Canvas med kurs, oppgaver og innleveringer (samme endepunkter som
// tests/helpers/fake-fetch.mjs for CLI-et). `scenario` = { courses: [...],
// assignments: { <kurs>: [...] }, submissions: { "<kurs>:<oppgave>": [...] } }
// i Canvas sitt format. Alle kall logges; andre verter gir nettverksfeil (T15).
function installerScenario(scenario) {
  const original = globalThis.fetch;
  const logg = [];
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    logg.push({ origin: u.origin, path: u.pathname, auth: opts.headers?.Authorization });
    if (u.origin !== CANVAS) throw new TypeError("fetch failed");
    if (opts.headers?.Authorization !== `Bearer ${GYLDIG_TOKEN}`) return json({}, 401);
    const p = u.pathname;
    let m;
    if (p === "/api/v1/users/self") return json({ id: 1, name: "Test Lærer" });
    if (p === "/api/v1/courses") return json(scenario.courses);
    if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments$/))) return json(scenario.assignments[m[1]] ?? []);
    if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)\/submissions$/)))
      return json(scenario.submissions[`${m[1]}:${m[2]}`] ?? []);
    return json({}, 404);
  };
  return {
    logg,
    gjenopprett() {
      globalThis.fetch = original;
    },
  };
}

module.exports = { CANVAS, GYLDIG_TOKEN, medFalskCanvas, installerScenario };
