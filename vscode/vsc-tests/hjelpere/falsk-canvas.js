// Felles hjelpere for røyktestene av oppsettet (D3). Ingen ekte nettverk og
// ingen ekte data (T19):
// - `globalThis.fetch` byttes ut med en falsk Canvas på https://canvas.test.invalid.
//   Alle andre verter gir nettverksfeil. Alle kall registreres, slik at testene
//   kan sjekke at det bare snakkes med Canvas-URL-en (T15).
// - `vscode.window.showInputBox` og meldingsfunksjonene byttes ut, slik at
//   kommandoene kan kjøres uten at noen taster. Utvidelsen og testene deler
//   samme `vscode`-objekt i utvidelsesverten.
const vscode = require("vscode");
const { KOMMENTAR_VAKTER, ALDRI, canvasKommentar } = require("./bla-scenario.js");

const CANVAS = "https://canvas.test.invalid";
const GYLDIG_TOKEN = "falskt-gyldig-token";
const GITHUB_API = "https://api.github.com";

// 0.2.0 (kritiker 2026-11-04): vakt mot ekte kall til api.github.com. Lastes én gang
// per testkjøring (require-cachen) og legges rundt fetch slik den var da; et
// GitHub-kall som ikke går til en av de falske fetch-ene under, registreres her og
// feiler som nettverksfeil. Testene sjekker til slutt at lista er tom.
const utenomFalsk = [];
if (!globalThis.__canvasCloneGithubVakt) {
  const forrige = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (new URL(String(url)).origin === GITHUB_API) {
      utenomFalsk.push(new URL(String(url)).pathname);
      throw new TypeError("fetch failed");
    }
    return forrige(url, opts);
  };
  globalThis.__canvasCloneGithubVakt = true;
}
const githubUtenomFalsk = () => [...utenomFalsk];

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
// i Canvas sitt format. Alle kall logges (med metode og body); andre verter gir
// nettverksfeil (T15).
// D6c: PUT .../submissions/<user_id> (gradeSubmission) gir `vedPut({ kurs, oppgave,
// userId, form })` sitt svar ({ status, data }, eller kast for nettverksfeil);
// uten `vedPut` svarer den som Canvas med karakteren som ble sendt. `vedGet(sti)`
// kan overstyre et GET-svar ({ status, data }, eller { status, raa } med rå tekst,
// f.eks. ødelagt JSON); undefined gir det vanlige svaret.
// 0.2.0: med `scenario.pages` ({ "<eier>/<repo>" i små bokstaver: { status, data,
// headers } }) svarer den også som GET https://api.github.com/repos/<eier>/<repo>
// (ukjent = 404). Uten `scenario.pages` gir GitHub nettverksfeil, som andre verter.
// Loggen får også User-Agent (`ua`) og `redirect`, så T15-testen kan sjekke kallene.
// 0.3.0 (kritiker 2026-11-05, K2): loggen har også `search` (hele queryen), og
// innleveringene får `submission_comments` (fra scenarioet) BARE når kallet har
// `include[]=submission_comments`; ellers fjernes feltet, slik ekte Canvas gjør.
// `vedGet(sti, search)` får også queryen (f.eks. for å la bare kallet med kommentarer
// feile, 1b/K12). Uten `vedPut` svarer PUT som Canvas: hele innleveringen, med
// `submission_comments` (scenarioets tråd + det nye svaret, med vaktposter i
// vedleggs-URL-ene) og `body`.
function installerScenario(scenario, { vedPut, vedGet } = {}) {
  const original = globalThis.fetch;
  const logg = [];
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    const method = opts.method ?? "GET";
    logg.push({
      origin: u.origin,
      path: u.pathname,
      search: u.search,
      auth: opts.headers?.Authorization,
      method,
      body: opts.body ?? null,
      ua: opts.headers?.["User-Agent"],
      redirect: opts.redirect,
    });
    if (u.origin === GITHUB_API && scenario.pages) {
      const m = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
      const svar = m && method === "GET" ? scenario.pages[`${m[1]}/${m[2]}`.toLowerCase()] : null;
      if (!svar) return json({ message: "Not Found" }, 404);
      return new Response(JSON.stringify(svar.data ?? {}), {
        status: svar.status ?? 200,
        headers: { "content-type": "application/json", ...(svar.headers ?? {}) },
      });
    }
    if (u.origin !== CANVAS) throw new TypeError("fetch failed");
    if (opts.headers?.Authorization !== `Bearer ${GYLDIG_TOKEN}`) return json({}, 401);
    const p = u.pathname;
    let m;
    if (method === "PUT") {
      m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/(\d+)$/);
      if (!m) return json({}, 404);
      const form = Object.fromEntries(new URLSearchParams(String(opts.body ?? "")));
      const kall = { kurs: Number(m[1]), oppgave: Number(m[2]), userId: Number(m[3]), form };
      const svar = vedPut ? await vedPut(kall) : { data: standardPut(scenario, kall) };
      return json(svar.data ?? {}, svar.status ?? 200);
    }
    if (method !== "GET") return json({}, 405);
    const overstyrt = vedGet ? await vedGet(p, u.search) : undefined;
    if (overstyrt && typeof overstyrt.raa === "string") {
      return new Response(overstyrt.raa, { status: overstyrt.status ?? 200, headers: { "content-type": "application/json" } });
    }
    if (overstyrt) return json(overstyrt.data ?? {}, overstyrt.status ?? 200);
    if (p === "/api/v1/users/self") return json({ id: 1, name: "Test Lærer" });
    if (p === "/api/v1/courses") return json(scenario.courses);
    if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments$/))) return json(scenario.assignments[m[1]] ?? []);
    if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)\/submissions$/))) {
      const medKommentarer = new URLSearchParams(u.search).getAll("include[]").includes("submission_comments");
      return json((scenario.submissions[`${m[1]}:${m[2]}`] ?? []).map((s) => medEllerUtenKommentarer(s, medKommentarer)));
    }
    return json({}, 404);
  };
  return {
    logg,
    gjenopprett() {
      globalThis.fetch = original;
    },
  };
}

// Som Canvas: tråden er bare med når den er bedt om.
function medEllerUtenKommentarer(s, medKommentarer) {
  const { submission_comments: trad, ...uten } = s;
  return medKommentarer ? { ...uten, submission_comments: trad ?? [] } : uten;
}

// PUT som Canvas (`SubmissionsApiController#update`): hele innleveringen, med tråden.
function standardPut(scenario, { kurs, oppgave, userId, form }) {
  const lagret = (scenario.submissions[`${kurs}:${oppgave}`] ?? []).find((s) => s.user_id === userId);
  const tekst = form["comment[text_comment]"];
  const ny = tekst ? [canvasKommentar({ forfatter: 1, forfatterNavn: "Test Lærer", tekst, tid: "2026-11-06T09:00:00Z", vedlegg: true })] : [];
  return {
    user_id: userId,
    grade: form["submission[posted_grade]"] ?? lagret?.grade ?? null,
    workflow_state: form["submission[posted_grade]"] !== undefined ? "graded" : (lagret?.workflow_state ?? "unsubmitted"),
    // 0.4.0 (G3): som Canvas følger `submitted_at` med; en karakter endrer den ikke.
    submitted_at: lagret ? lagret.submitted_at : null,
    body: lagret?.body ?? null,
    submission_comments: [...(lagret?.submission_comments ?? []), ...ny],
  };
}

// T15 (P8, 0.3.0 kritiker B3): de eneste tillatte nettkallene, med metode, sti og eksakt
// query. Kjøres på slutten av hver panel- og tretest (og kopieres i provekjoring.mjs).
const CANVAS_TILLATT = [
  { method: "GET", sti: /^\/api\/v1\/users\/self$/, search: [""] },
  { method: "GET", sti: /^\/api\/v1\/courses$/, search: ["?per_page=100&enrollment_type=teacher&state[]=available&state[]=unpublished"] },
  { method: "GET", sti: /^\/api\/v1\/courses\/\d+\/assignments$/, search: ["?per_page=100"] },
  {
    method: "GET",
    sti: /^\/api\/v1\/courses\/\d+\/assignments\/\d+\/submissions$/,
    search: ["?include[]=user&per_page=100", "?include[]=user&per_page=100&include[]=submission_comments"],
  },
  { method: "PUT", sti: /^\/api\/v1\/courses\/\d+\/assignments\/\d+\/submissions\/\d+$/, search: [""] },
];
const erTillattKall = (f) =>
  (f.origin === CANVAS && CANVAS_TILLATT.some((r) => r.method === f.method && r.sti.test(f.path) && r.search.includes(f.search))) ||
  (f.origin === GITHUB_API &&
    f.method === "GET" &&
    /^\/repos\/[^/]+\/[^/]+$/.test(f.path) &&
    f.search === "" &&
    f.auth === undefined &&
    f.ua === "canvas-clone-vscode" &&
    f.redirect === "manual" &&
    f.body === null);
const ikkeTillatte = (logg) => logg.filter((f) => !erTillattKall(f));
const MED_KOMMENTARER = "include[]=submission_comments";

module.exports = {
  CANVAS,
  GYLDIG_TOKEN,
  GITHUB_API,
  medFalskCanvas,
  installerScenario,
  githubUtenomFalsk,
  erTillattKall,
  ikkeTillatte,
  MED_KOMMENTARER,
  KOMMENTAR_VAKTER,
  ALDRI,
  canvasKommentar,
};
