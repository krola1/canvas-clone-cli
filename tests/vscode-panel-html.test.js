// HTML, CSP og webview-skript for karakterpanelet (vscode/src/panel-html.mjs, D6b):
// streng CSP med nonce (T10), ingen tekst/elevdata i HTML-en, aldri innerHTML eller
// webview-state (T11), og skriptet kjørt mot en liten falsk DOM: skjemaet settes fra
// modellen ved hver ny generasjon (B4), og bare meldinger fra MELDINGSFELT sendes.
// Ingen VS Code, ingen filer.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createStrings } from "../src/strings.js";
import { lagNonce, csp, lagHtml, WEBVIEW_SKRIPT } from "../vscode/src/panel-html.mjs";
import { MELDINGSFELT, lagPanel, visningsmodell, validerMelding } from "../vscode/src/panel.mjs";

const t = createStrings(false);
const nonce = "0123456789abcdef0123456789abcdef";

test("nonce: 32 hex-tegn fra crypto, ny hver gang", () => {
  const a = lagNonce();
  const b = lagNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test("CSP: default-src 'none', skript og stil bare med nonce, ingen remote, ingen skjema-sending", () => {
  const c = csp(nonce);
  const direktiver = Object.fromEntries(c.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(direktiver["default-src"], ["'none'"]);
  assert.deepEqual(direktiver["script-src"], [`'nonce-${nonce}'`]);
  assert.deepEqual(direktiver["style-src"], [`'nonce-${nonce}'`]);
  assert.deepEqual(direktiver["form-action"], ["'none'"]);
  assert.deepEqual(direktiver["base-uri"], ["'none'"]);
  assert.ok(!/unsafe-|https?:|\*/.test(c), c);
  assert.throws(() => csp("ikke-en-nonce"));
  assert.throws(() => csp(`${nonce}'; script-src *`));
});

test("HTML: CSP-meta med nonce, nonce på skript og stil, ingen tekst, inline-handlere, remote eller innerHTML", () => {
  const html = lagHtml(nonce);
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${csp(nonce)}">`));
  const skript = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.deepEqual(skript, [` nonce="${nonce}"`]);
  const stiler = [...html.matchAll(/<style\b([^>]*)>/g)].map((m) => m[1]);
  assert.deepEqual(stiler, [` nonce="${nonce}"`]);
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "inline event-handler");
  assert.ok(!/https?:\/\/|src=|href=/i.test(html), "remote-innhold eller lenker");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(html));
  assert.ok(!/setState|getState/.test(html), "webview-state er forbudt (T11)");
  assert.ok(!/<form\b/i.test(html));
  // Ingen tekst mellom taggene i body (alt kommer fra visningsmodellen).
  const body = html.slice(html.indexOf("<body>"), html.indexOf("<script"));
  assert.equal(body.replace(/<[^>]*>/g, "").trim(), "");
  // Tekstfeltene lagres ikke av nettleseren.
  assert.equal((html.match(/autocomplete="off"/g) ?? []).length, 2);
});

// --- Webview-skriptet mot en falsk DOM ----------------------------------------

function falskWebview() {
  const felt = new Map();
  const element = (navn) => {
    if (!felt.has(navn)) {
      const lyttere = {};
      felt.set(navn, {
        navn,
        textContent: "",
        value: "",
        disabled: true,
        maxLength: -1,
        className: "",
        addEventListener: (type, f) => ((lyttere[type] ??= []).push(f)),
        klikk: () => (lyttere.click ?? []).forEach((f) => f()),
        // innerHTML finnes ikke: skriptet skal aldri bruke det.
        set innerHTML(_) {
          throw new Error("innerHTML brukt");
        },
      });
    }
    return felt.get(navn);
  };
  const sendt = [];
  const meldingslyttere = [];
  const kontekst = {
    acquireVsCodeApi: () => ({
      postMessage: (m) => sendt.push(JSON.parse(JSON.stringify(m))),
      setState: () => {
        throw new Error("setState brukt");
      },
      getState: () => {
        throw new Error("getState brukt");
      },
    }),
    document: {
      querySelector: (sel) => {
        const m = sel.match(/^\[data-felt="([A-Za-z]+)"\]$/);
        assert.ok(m, `uventet selector ${sel}`);
        return element(m[1]);
      },
    },
    window: { addEventListener: (type, f) => type === "message" && meldingslyttere.push(f) },
    Number,
    String,
  };
  vm.createContext(kontekst);
  vm.runInContext(WEBVIEW_SKRIPT, kontekst);
  return {
    sendt,
    f: element,
    motta: (data) => meldingslyttere.forEach((l) => l({ data })),
  };
}

const node = (userId, navn, eier) => ({
  course: { id: 7, name: "Kurs A" },
  assignment: { id: 70, name: "Frontend modul 1: HTML", submissionTypes: ["online_url"] },
  sub: { studentName: navn, workflowState: "submitted", owner: eier, userId, currentGrade: null },
});

test("skriptet: sier «klar» ved oppstart, og skjemaet er låst til en modell kommer", () => {
  const w = falskWebview();
  assert.deepEqual(w.sendt, [{ type: "klar" }]);
  assert.equal(w.f("send").disabled, true);
  w.f("send").klikk();
  assert.equal(w.sendt.length, 1, "ingenting sendes uten modell");
});

test("skriptet: viser modellen med textContent, og ny generasjon gir tomt skjema (B4)", () => {
  const w = falskWebview();
  const panel = lagPanel();
  const b1 = panel.bind(node(1001, "Ola <b>Nordmann</b>", "ola")).binding;
  w.motta(visningsmodell(b1, t));
  assert.equal(w.f("elev").textContent, "Ola <b>Nordmann</b> (GitHub: ola)");
  assert.equal(w.f("tittel").textContent, t.vscPanelTitle());
  assert.equal(w.f("send").textContent, t.vscPanelSend());
  assert.equal(w.f("karakter").maxLength, 50);
  assert.equal(w.f("kommentar").maxLength, 8000);
  assert.equal(w.f("send").disabled, false);
  w.f("karakter").value = "A";
  w.f("kommentar").value = "Bra jobbet";
  // Ny elev: skjemaet tømmes.
  const b2 = panel.bind(node(1002, "Kari", "kari")).binding;
  w.motta(visningsmodell(b2, t));
  assert.equal(w.f("elev").textContent, "Kari (GitHub: kari)");
  assert.equal(w.f("karakter").value, "");
  assert.equal(w.f("kommentar").value, "");
  // Samme modell på nytt (f.eks. etter «klar» når panelet var skjult) tømmer også.
  w.f("karakter").value = "B";
  w.motta(visningsmodell(b2, t));
  assert.equal(w.f("karakter").value, "");
});

test("skriptet: «send» har nøyaktig feltene fra MELDINGSFELT, med generasjonen fra modellen, og består validerMelding", () => {
  const w = falskWebview();
  const panel = lagPanel();
  panel.bind(node(1001, "Ola", "ola"));
  const b = panel.bind(node(1002, "Kari", "kari")).binding;
  w.motta(visningsmodell(b, t));
  w.f("karakter").value = " B ";
  w.f("kommentar").value = "Fin";
  w.f("send").klikk();
  const m = w.sendt.at(-1);
  assert.deepEqual(Object.keys(m).sort(), [...MELDINGSFELT.send].sort());
  assert.deepEqual(m, { type: "send", generasjon: 2, karakter: " B ", kommentar: "Fin" });
  assert.deepEqual(validerMelding(m, panel.gjeldende), { ok: true, type: "send", karakter: "B", kommentar: "Fin" });
  for (const s of w.sendt) assert.ok(Object.hasOwn(MELDINGSFELT, s.type), s.type);
});

test("skriptet: «tom» tømmer alt og låser skjemaet; «melding» vises som tekst", () => {
  const w = falskWebview();
  const panel = lagPanel();
  w.motta(visningsmodell(panel.bind(node(1001, "Ola", "ola")).binding, t));
  w.f("karakter").value = "A";
  w.motta({ type: "tom", tekst: t.quizGradingNotSupported() });
  assert.equal(w.f("elev").textContent, "");
  assert.equal(w.f("karakter").value, "");
  assert.equal(w.f("send").disabled, true);
  assert.equal(w.f("melding").textContent, t.quizGradingNotSupported());
  assert.equal(w.f("melding").className, "feil");
  const antall = w.sendt.length;
  w.f("send").klikk();
  assert.equal(w.sendt.length, antall, "ingen sending etter «tom»");
  w.motta({ type: "melding", tekst: "<i>x</i>", feil: false });
  assert.equal(w.f("melding").textContent, "<i>x</i>");
  assert.equal(w.f("melding").className, "");
  // Ukjente meldinger ignoreres.
  w.motta(null);
  w.motta({ type: "vis", generasjon: "1" });
  assert.equal(w.f("melding").textContent, "<i>x</i>");
});
