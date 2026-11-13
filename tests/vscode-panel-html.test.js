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
import { MELDINGSFELT, lagPanel, visningsmodell, validerMelding, tradModell, sendtModell } from "../vscode/src/panel.mjs";

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
  // 0.3.0: også svarfeltet.
  assert.equal((html.match(/autocomplete="off"/g) ?? []).length, 3);
});

// --- Webview-skriptet mot en falsk DOM ----------------------------------------

// 0.3.0: elementene har også `children`, `appendChild`, `replaceChildren` og `dir`
// (tråden bygges med createElement/textContent). Ingen setAttribute og ingen innerHTML.
function lagElement(navn, tag = null) {
  const lyttere = {};
  const el = {
    navn,
    tag,
    textContent: "",
    value: "",
    disabled: true,
    hidden: false,
    maxLength: -1,
    className: "",
    dir: "",
    children: [],
    appendChild: (barn) => (el.children.push(barn), barn),
    replaceChildren: (...barn) => {
      el.children = [...barn];
    },
    addEventListener: (type, f) => ((lyttere[type] ??= []).push(f)),
    klikk: () => (lyttere.click ?? []).forEach((f) => f()),
    // innerHTML finnes ikke: skriptet skal aldri bruke det.
    set innerHTML(_) {
      throw new Error("innerHTML brukt");
    },
  };
  return el;
}

function falskWebview() {
  const felt = new Map();
  const element = (navn) => {
    if (!felt.has(navn)) felt.set(navn, lagElement(navn));
    return felt.get(navn);
  };
  const lagde = [];
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
      createElement: (tag) => {
        assert.ok(["div"].includes(tag), `uventet element ${tag}`);
        const el = lagElement(null, tag);
        lagde.push(el);
        return el;
      },
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
    lagde,
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

// 0.2.0, GitHub Pages (P3/P9): knappen vises bare for gjeldende generasjon, skjules av
// `vis`/`tom`, og et klikk sender bare { type: "apnePages", generasjon }.
test("skriptet: Pages-knappen følger generasjonen; klikk sender bare apnePages med generasjonen", () => {
  const w = falskWebview();
  const panel = lagPanel();
  const nodeMedRepo = (userId, eier) => {
    const n = node(userId, `Elev ${eier}`, eier);
    n.sub.repo = `${eier}/oppg`;
    return n;
  };
  const b1 = panel.bind(nodeMedRepo(1001, "ola")).binding;
  w.motta(visningsmodell(b1, t));
  assert.equal(w.f("pages").hidden, true);
  w.f("pages").klikk();
  assert.equal(w.sendt.length, 1, "skjult knapp sender ingenting");
  w.motta({ type: "pages", generasjon: b1.generasjon, tekst: t.vscPagesOpen() });
  assert.equal(w.f("pages").hidden, false);
  assert.equal(w.f("pages").textContent, t.vscPagesOpen());
  w.f("pages").klikk();
  assert.deepEqual(w.sendt.at(-1), { type: "apnePages", generasjon: b1.generasjon });
  assert.deepEqual(validerMelding(w.sendt.at(-1), panel.gjeldende), { ok: true, type: "apnePages" });
  // Ny elev: knappen skjules av `vis`, og en sen pages-melding for forrige generasjon ignoreres.
  const b2 = panel.bind(nodeMedRepo(1002, "kari")).binding;
  w.motta(visningsmodell(b2, t));
  assert.equal(w.f("pages").hidden, true);
  w.motta({ type: "pages", generasjon: b1.generasjon, tekst: t.vscPagesOpen() });
  assert.equal(w.f("pages").hidden, true, "pages-melding for gammel generasjon ble vist");
  // Tom tekst skjuler; `tom` skjuler.
  w.motta({ type: "pages", generasjon: b2.generasjon, tekst: t.vscPagesOpenUnchecked() });
  assert.equal(w.f("pages").hidden, false);
  w.motta({ type: "pages", generasjon: b2.generasjon, tekst: "" });
  assert.equal(w.f("pages").hidden, true);
  w.motta({ type: "pages", generasjon: b2.generasjon, tekst: t.vscPagesOpen() });
  w.motta({ type: "tom", tekst: t.vscPanelNoBinding() });
  assert.equal(w.f("pages").hidden, true);
  for (const s of w.sendt) assert.ok(Object.hasOwn(MELDINGSFELT, s.type), s.type);
});

// --- 0.3.0: tråd, «Svar», «Åpne i Canvas», ikke-leverte -----------------------

const medTrad = (userId, navn, kommentarer, over = {}) => {
  const n = node(userId, navn, null);
  n.sub.kommentarer = kommentarer;
  return { ...n, ...over, sub: { ...n.sub, ...(over.sub ?? {}) } };
};
const km = (id, fraEleven, tekst, over = {}) => ({ id, fraEleven, forfatternavn: fraEleven ? "Ola" : "Lærer", tekst, tid: "2026-11-05T10:00:00Z", forsok: 1, vedlegg: [], media: null, ...over });
const tekstene = (el) => [el.textContent, ...el.children.flatMap(tekstene)];

test("HTML 0.3.0: alle knapper er type=button; tråden, svarfeltet og «Åpne i Canvas» finnes; ingen lenker", () => {
  const html = lagHtml(nonce);
  const knapper = [...html.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]);
  // 0.4.0: fem knapper (ny «Åpne oppgaven i Canvas», O3).
  assert.equal(knapper.length, 5);
  for (const k of knapper) assert.match(k, /^ type="button"/);
  for (const felt of ["trad", "tradTittel", "tradInfo", "svar", "svarEtikett", "svarSend", "apneCanvas", "laast"]) {
    assert.ok(html.includes(`data-felt="${felt}"`), felt);
  }
  assert.match(html, /<button type="button" data-felt="apneCanvas"[^>]* hidden disabled><\/button>/);
  assert.ok(!/<a\s|href|<img/i.test(html));
  assert.ok(WEBVIEW_SKRIPT.includes('blokk.dir = "auto"'), "dir=auto per melding (K3)");
  assert.ok(!/setAttribute|innerHTML/.test(WEBVIEW_SKRIPT));
});

test("skriptet 0.3.0: tråden bygges med textContent og dir=auto, bare for gjeldende generasjon; vis og tom tømmer den", () => {
  const w = falskWebview();
  const panel = lagPanel();
  const b1 = panel.bind(medTrad(1001, "Ola", [km(1, false, "<b>Rett</b> lenken"), km(2, true, "Fikset", { vedlegg: [{ filnavn: "<i>bilde</i>.png", type: "x" }], media: { type: "audio" } })])).binding;
  w.motta(visningsmodell(b1, t));
  assert.deepEqual(w.f("trad").children, []);
  w.motta(tradModell(b1, t));
  const blokker = w.f("trad").children;
  assert.equal(blokker.length, 2);
  assert.deepEqual(blokker.map((b) => [b.className, b.dir]), [["kommentar", "auto"], ["kommentar elev", "auto"]]);
  assert.equal(blokker[0].children[1].textContent, "<b>Rett</b> lenken");
  assert.match(blokker[1].children[0].textContent, /^Ola · fra eleven · 2026-11-0[56] \d\d:\d\d · forsøk 1$/);
  assert.deepEqual(blokker[1].children.slice(2).map((c) => c.textContent), [t.vscCommentsAttachment("<i>bilde</i>.png"), t.vscCommentsAudio()]);
  assert.equal(w.f("tradTittel").textContent, t.vscCommentsTitle());
  // En tråd for en annen generasjon ignoreres.
  const b2 = panel.bind(medTrad(1002, "Kari", [km(3, true, "ANNEN-ELEV")])).binding;
  w.motta(tradModell(b2, t));
  assert.ok(!tekstene(w.f("trad")).includes("ANNEN-ELEV"), "tråd for feil generasjon vist");
  // `vis` for ny elev tømmer tråden; så kommer den nye.
  w.motta(visningsmodell(b2, t));
  assert.deepEqual(w.f("trad").children, []);
  w.motta({ ...tradModell(b1, t), generasjon: b1.generasjon });
  assert.deepEqual(w.f("trad").children, [], "sen tråd for forrige elev");
  w.motta(tradModell(b2, t));
  assert.equal(w.f("trad").children.length, 1);
  // «ikke hentet»: ingen meldinger, fast tekst.
  w.motta({ ...tradModell(panel.glemKommentarer(), t) });
  assert.deepEqual(w.f("trad").children, []);
  assert.equal(w.f("tradInfo").textContent, t.vscCommentsNotLoaded());
  w.motta(tradModell(panel.etterSending(b2, { karakter: null, status: "submitted", kommentarer: [] }), t));
  assert.equal(w.f("tradInfo").textContent, t.vscCommentsNone());
  w.motta({ type: "tom", tekst: t.vscPanelNoBinding() });
  assert.deepEqual(w.f("trad").children, []);
  assert.equal(w.f("tradInfo").textContent, "");
  assert.ok(w.lagde.every((el) => el.tag === "div"));
});

test("skriptet 0.3.0: «Åpne i Canvas» og «Svar» sender bare MELDINGSFELT-ene med generasjonen, og består validerMelding", () => {
  const w = falskWebview();
  const panel = lagPanel();
  w.f("apneCanvas").klikk();
  w.f("svarSend").klikk();
  assert.deepEqual(w.sendt, [{ type: "klar" }], "ingenting uten modell");
  assert.equal(w.f("apneCanvas").hidden, true);
  const b = panel.bind(medTrad(1001, "Ola", [])).binding;
  w.motta(visningsmodell(b, t));
  assert.equal(w.f("apneCanvas").hidden, false);
  assert.equal(w.f("apneCanvas").textContent, t.vscOpenInCanvas());
  assert.equal(w.f("svar").maxLength, 8000);
  w.f("apneCanvas").klikk();
  assert.deepEqual(w.sendt.at(-1), { type: "apneCanvas", generasjon: b.generasjon });
  assert.deepEqual(validerMelding(w.sendt.at(-1), panel.gjeldende), { ok: true, type: "apneCanvas" });
  w.f("svar").value = "Takk, ser bra ut";
  w.f("svarSend").klikk();
  const m = w.sendt.at(-1);
  assert.deepEqual(Object.keys(m).sort(), [...MELDINGSFELT.svar].sort());
  assert.deepEqual(m, { type: "svar", generasjon: b.generasjon, tekst: "Takk, ser bra ut" });
  assert.deepEqual(validerMelding(m, panel.gjeldende), { ok: true, type: "svar", tekst: "Takk, ser bra ut" });
  for (const x of w.sendt) assert.ok(Object.hasOwn(MELDINGSFELT, x.type), x.type);
  // `tom`: knappen skjules igjen.
  w.motta({ type: "tom", tekst: t.vscPanelNoBinding() });
  assert.equal(w.f("apneCanvas").hidden, true);
});

// 0.4.0 (tilsynets O3): «Åpne oppgaven i Canvas» er en knapp (ingen lenke), skjult og
// låst uten binding, og sender bare `{type:"apneOppgave", generasjon}`.
test("skriptet 0.4.0: «Åpne oppgaven i Canvas» sender bare type og generasjon, består validerMelding, og skjules av `tom`", () => {
  const html = lagHtml(nonce);
  assert.match(html, /<button type="button" data-felt="apneOppgave" class="sekundaer" hidden disabled><\/button>/);
  const w = falskWebview();
  const panel = lagPanel();
  w.f("apneOppgave").klikk();
  assert.deepEqual(w.sendt, [{ type: "klar" }], "ingenting uten modell");
  assert.equal(w.f("apneOppgave").hidden, true);
  assert.equal(w.f("apneOppgave").disabled, true);
  const b1 = panel.bind(medTrad(1001, "Ola", [])).binding;
  w.motta(visningsmodell(b1, t));
  assert.equal(w.f("apneOppgave").hidden, false);
  assert.equal(w.f("apneOppgave").disabled, false);
  assert.equal(w.f("apneOppgave").textContent, t.vscOpenAssignment());
  w.f("apneOppgave").klikk();
  const m = w.sendt.at(-1);
  assert.deepEqual(m, { type: "apneOppgave", generasjon: b1.generasjon });
  assert.deepEqual(Object.keys(m).sort(), [...MELDINGSFELT.apneOppgave].sort());
  assert.deepEqual(validerMelding(m, panel.gjeldende), { ok: true, type: "apneOppgave" });
  // Ny elev: meldingen fra forrige generasjon avvises; knappen sender den nye.
  const b2 = panel.bind(medTrad(1002, "Kari", [])).binding;
  assert.deepEqual(validerMelding(m, panel.gjeldende), { ok: false, grunn: "gammel_generasjon" });
  w.motta(visningsmodell(b2, t));
  w.f("apneOppgave").klikk();
  assert.deepEqual(w.sendt.at(-1), { type: "apneOppgave", generasjon: b2.generasjon });
  w.motta({ type: "tom", tekst: t.vscPanelNoBinding() });
  assert.equal(w.f("apneOppgave").hidden, true);
  const antall = w.sendt.length;
  w.f("apneOppgave").klikk();
  assert.equal(w.sendt.length, antall, "ingenting etter tom");
  // Engelsk tekst følger VS Code-språket.
  assert.equal(visningsmodell(b2, createStrings(true)).tekster.apneOppgave, "Open the assignment in Canvas");
  assert.equal(visningsmodell(b2, t).tekster.apneOppgave, "Åpne oppgaven i Canvas");
});

test("skriptet 0.3.0: feltene låses mens en sending venter; `sendt` tømmer bare feltet som ble sendt (utkastet i det andre står)", () => {
  const w = falskWebview();
  const panel = lagPanel();
  const b = panel.bind(medTrad(1001, "Ola", [])).binding;
  w.motta(visningsmodell(b, t));
  w.f("karakter").value = "UTKAST-A";
  w.f("kommentar").value = "UTKAST-TILBAKEMELDING";
  w.f("svar").value = "Svaret";
  w.f("svarSend").klikk();
  for (const navn of ["svar", "svarSend", "send", "karakter", "kommentar"]) assert.equal(w.f(navn).disabled, true, `${navn} skal være låst`);
  const antall = w.sendt.length;
  w.f("svarSend").klikk();
  w.f("send").klikk();
  assert.equal(w.sendt.length, antall, "ingen ny sending mens den første venter");
  // En sendt-melding for en annen generasjon ignoreres.
  w.motta({ ...sendtModell(b, "svar", t), generasjon: b.generasjon + 1 });
  assert.equal(w.f("svar").value, "Svaret");
  const ny = panel.etterSending(b, { karakter: "B", status: "graded", kommentarer: null });
  w.motta(sendtModell(ny, "svar", t));
  assert.equal(w.f("svar").value, "");
  assert.equal(w.f("karakter").value, "UTKAST-A");
  assert.equal(w.f("kommentar").value, "UTKAST-TILBAKEMELDING");
  assert.equal(w.f("naverende").textContent, t.currentGradeDisplay("B"));
  assert.equal(w.f("status").textContent, t.vscGraded());
  assert.equal(w.f("svarSend").disabled, false);
  // Karakter: bare skjemaet tømmes.
  w.f("svar").value = "NYTT-SVAR-UTKAST";
  w.f("send").klikk();
  assert.equal(w.f("svar").disabled, true);
  w.motta(sendtModell(ny, "skjema", t));
  assert.equal(w.f("karakter").value, "");
  assert.equal(w.f("kommentar").value, "");
  assert.equal(w.f("svar").value, "NYTT-SVAR-UTKAST");
  // En melding (avbrutt, feil) låser opp uten å tømme noe.
  w.f("svarSend").klikk();
  assert.equal(w.f("svar").disabled, true);
  w.motta({ type: "melding", tekst: t.vscReplyCancelled(), feil: false });
  assert.equal(w.f("svar").disabled, false);
  assert.equal(w.f("svar").value, "NYTT-SVAR-UTKAST");
});

test("skriptet 0.3.0: ikke levert: karakter og tilbakemelding låst med fast tekst; svar og «Åpne i Canvas» virker", () => {
  const w = falskWebview();
  const panel = lagPanel();
  const n = medTrad(1001, "Ola", [km(1, false, "Hei")], { type: "ikkeLevert", sub: { workflowState: "unsubmitted" } });
  const b = panel.bind(n).binding;
  w.motta(visningsmodell(b, t));
  for (const navn of ["karakter", "kommentar", "send"]) assert.equal(w.f(navn).disabled, true, navn);
  assert.equal(w.f("laast").hidden, false);
  assert.equal(w.f("laast").textContent, t.vscNotSubmittedLocked());
  assert.equal(w.f("status").textContent, t.vscNotSubmittedThread());
  assert.equal(w.f("svar").disabled, false);
  const antall = w.sendt.length;
  w.f("send").klikk();
  assert.equal(w.sendt.length, antall, "karakter sendes aldri for ikke-leverte");
  w.f("svar").value = "Du mangler lenken";
  w.f("svarSend").klikk();
  assert.deepEqual(w.sendt.at(-1), { type: "svar", generasjon: b.generasjon, tekst: "Du mangler lenken" });
  // Neste elev har levert: skjemaet låses opp, og den faste teksten skjules.
  w.motta(visningsmodell(panel.bind(node(1002, "Kari", "kari")).binding, t));
  assert.equal(w.f("send").disabled, false);
  assert.equal(w.f("laast").hidden, true);
  assert.equal(w.f("svar").value, "", "svarfeltet tømmes ved ny elev");
});
