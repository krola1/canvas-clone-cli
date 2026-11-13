// HTML og skript for karakterpanelets webview (D6b). Ren logikk uten import av
// `vscode`, så den kan testes med `node --test` (tests/vscode-panel-html.test.js).
// VS Code-delen ligger i ./panel-vindu.js.
//
// Tilsynets T10/T11:
// - Streng CSP: `default-src 'none'`; skript og stil bare med nonce (ny for hvert
//   panel); ingen remote-innhold, ingen bilder/fonter/fetch, ingen skjema-sending.
// - HTML-en er statisk: ingen tekst, ingen elevdata, ingen Canvas-ID-er. Alt innhold
//   kommer med postMessage (visningsmodellen fra ./panel.mjs) og settes med
//   `textContent` eller `value`, aldri som HTML.
// - Ingen inline event-handlere (`on...=`); skriptet bruker addEventListener.
// - Skriptet bruker aldri `setState`/`getState` (ingen webview-state), og
//   tekstfeltene har `autocomplete="off"`.
// - Skriptet sender bare `{type:"klar"}`, `{type:"send", generasjon, karakter,
//   kommentar}` og `{type:"apnePages", generasjon}` (MELDINGSFELT i ./panel.mjs),
//   aldri ID-er eller URL-er.
// - 0.2.0, GitHub Pages (P3/P9): en `<button>` (ingen `<a href>`), skjult til en
//   `pages`-melding med riktig generasjon gir den tekst; `vis` og `tom` skjuler den.
// - 0.3.0, kommentartråden (tilsynets K3/K4/K5): tråden kommer som egen
//   `trad`-melding med generasjon og bygges med `createElement`/`textContent`, med
//   `dir="auto"` per melding; ingen lenker, ingen bilder. Én knapp «Åpne i Canvas»
//   sender bare `{type:"apneCanvas", generasjon}`. Eget svarfelt med knapp sender
//   `{type:"svar", generasjon, tekst}`. `vis` og `tom` tømmer tråden og svarfeltet.
//   Etter en vellykket sending tømmer `sendt` bare feltet som ble sendt (et utkast
//   i det andre feltet står). Feltene låses mens en sending venter på svar.
// - 0.4.0 (tilsynets O3): knappen «Åpne oppgaven i Canvas» sender bare
//   `{type:"apneOppgave", generasjon}`; synlig og låst som «Åpne i Canvas».
// - 0.4.0 (plan G4, tilsynets O1/O7, Lars 4a): oppgaveteksten står i en statisk
//   `<details>` (sammenfoldet; ingen `open` i HTML-en). Meldingen `oppgavetekst` gir
//   blokker fra en fast modell; hver blokktype mappes til en fast tagg (OPPGAVE_TAGG og
//   overskriftslista), elementene lages bare i `lag()` med strenglitteraler, og all tekst
//   settes med `textContent`. Ukjente typer ignoreres. Ingen attributter (bare
//   egenskapene `className`, `dir`, `start` og `open`). `sammeOppgave: false` folder
//   sammen igjen; ved elevbytte i samme oppgave står tilstanden (ingen setState).
//   Skjemaet er låst (fast tekst fra meldingen) til `typeKjent` er sann, og ved feil.
import { randomBytes } from "node:crypto";

const NONCE = /^[0-9a-f]{32}$/;

// 128 bit fra crypto, som hex (gyldig i CSP-grammatikken for nonce).
export function lagNonce() {
  return randomBytes(16).toString("hex");
}

export function csp(nonce) {
  if (!NONCE.test(nonce)) throw new Error("ugyldig nonce");
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

// Meldinger fra utvidelsen til webviewen (panel-vindu.js):
//   visningsmodell (type "vis") - nytt innhold og nytt, tomt skjema (B4)
//   { type: "tom", tekst }      - ingen binding: alt tømmes, skjemaet låses
//   { type: "melding", tekst, feil } - statuslinje (avvist melding, «ikke sendt»)
//   { type: "pages", generasjon, tekst } - Pages-knappen (tom tekst = skjult); bare
//                                 for gjeldende generasjon, aldri en ny `vis`
//   tradModell (type "trad")    - kommentartråden (0.3.0); bare gjeldende generasjon
//   sendtModell (type "sendt")  - vellykket sending: tøm bare feltet som ble sendt
//   oppgavetekstModell (type "oppgavetekst") - oppgaveteksten (0.4.0); bare gjeldende generasjon
// Skriptet er ren tekst (ikke en funksjon som serialiseres), så esbuild ikke kan
// endre det. Ingen `${` her.
export const WEBVIEW_SKRIPT = `(function () {
  "use strict";
  const api = acquireVsCodeApi();
  const f = (navn) => document.querySelector('[data-felt="' + navn + '"]');
  const tekst = (v) => (v == null ? "" : String(v));
  const sett = (navn, v) => { f(navn).textContent = tekst(v); };
  const karakter = f("karakter");
  const kommentar = f("kommentar");
  const send = f("send");
  const pages = f("pages");
  const apneCanvas = f("apneCanvas");
  const apneOppgave = f("apneOppgave");
  const laast = f("laast");
  const trad = f("trad");
  const svar = f("svar");
  const svarSend = f("svarSend");
  const oppgaveBoks = f("oppgaveBoks");
  const oppgavetekst = f("oppgavetekst");
  const VERDIER = ["kurs", "oppgave", "elev", "status", "naverende"];
  let generasjon = null;
  let kanSetteKarakter = false;
  // 0.4.0 (G4): skjemaet er låst til oppgavetypen er kjent; låseteksten kommer fra meldingen.
  let typeKjent = false;
  let laastIkkeLevert = "";
  let laastOppgave = "";
  // Fast tabell type -> tagg (O1). Overskrift nivå 1–6 -> h3–h6 (h1/h2 brukes av panelet).
  const OPPGAVE_TAGG = { avsnitt: "p", sitat: "blockquote", kode: "pre" };
  const OVERSKRIFT_TAGG = ["h3", "h4", "h5", "h6", "h6", "h6"];
  // En sending venter på svar fra utvidelsen: feltene er låst til neste melding.
  let venter = false;

  function las() {
    const ingen = generasjon === null;
    const skjema = ingen || venter || !kanSetteKarakter || !typeKjent;
    karakter.disabled = skjema;
    kommentar.disabled = skjema;
    send.disabled = skjema;
    svar.disabled = ingen || venter;
    svarSend.disabled = ingen || venter;
    apneCanvas.disabled = ingen;
    apneCanvas.hidden = ingen;
    apneOppgave.disabled = ingen;
    apneOppgave.hidden = ingen;
  }

  function melding(v, feil) {
    const m = f("melding");
    m.textContent = tekst(v);
    m.className = feil ? "feil" : "";
    // Hver sending får en melding tilbake (sendt, avbrutt eller feil).
    venter = false;
    las();
  }

  function skjulPages() {
    pages.textContent = "";
    pages.hidden = true;
    pages.disabled = true;
  }

  function visPages(m) {
    if (generasjon === null || m.generasjon !== generasjon) return;
    const v = tekst(m.tekst);
    if (!v) return skjulPages();
    pages.textContent = v;
    pages.hidden = false;
    pages.disabled = false;
  }

  function tomTrad() {
    trad.replaceChildren();
    sett("tradTittel", "");
    sett("tradInfo", "");
  }

  function linje(klasse, v) {
    const el = document.createElement("div");
    el.className = klasse;
    el.textContent = tekst(v);
    return el;
  }

  // Tråden: én blokk per melding, bare tekst (textContent), retning etter innholdet.
  function visTrad(m) {
    if (generasjon === null || m.generasjon !== generasjon) return;
    const t = m.tekster || {};
    tomTrad();
    sett("tradTittel", t.tittel);
    if (m.status !== "ok") return sett("tradInfo", t.ikkeHentet);
    const meldinger = Array.isArray(m.meldinger) ? m.meldinger : [];
    sett("tradInfo", meldinger.length === 0 ? t.ingen : t.eldre);
    for (const k of meldinger) {
      if (!k || typeof k !== "object") continue;
      const blokk = document.createElement("div");
      blokk.className = k.fraEleven === true ? "kommentar elev" : "kommentar";
      blokk.dir = "auto";
      const meta = [k.forfatter, k.fraEleven === true ? t.fraEleven : "", k.tid, k.forsok].map(tekst).filter((x) => x !== "");
      blokk.appendChild(linje("meta", meta.join(" · ")));
      blokk.appendChild(linje("tekst", k.tekst));
      for (const v of Array.isArray(k.vedlegg) ? k.vedlegg : []) blokk.appendChild(linje("vedlegg", v));
      if (tekst(k.media)) blokk.appendChild(linje("vedlegg", k.media));
      trad.appendChild(blokk);
    }
  }

  // Bare disse elementene kan lages, og bare med strenglitteraler (O1).
  function lag(navn) {
    switch (navn) {
      case "p": return document.createElement("p");
      case "blockquote": return document.createElement("blockquote");
      case "pre": return document.createElement("pre");
      case "h3": return document.createElement("h3");
      case "h4": return document.createElement("h4");
      case "h5": return document.createElement("h5");
      case "h6": return document.createElement("h6");
      case "ul": return document.createElement("ul");
      case "ol": return document.createElement("ol");
      case "li": return document.createElement("li");
      case "strong": return document.createElement("strong");
      case "em": return document.createElement("em");
      case "span": return document.createElement("span");
      default: return null;
    }
  }

  const liste = (v) => (Array.isArray(v) ? v : []);
  const dybde = (v) => "dybde-" + (Number.isSafeInteger(v) && v >= 1 && v <= 10 ? v : 1);

  // Tekstbitene i en blokk: fet -> strong, kursiv -> em, begge -> strong > em; bare textContent.
  function fyllBiter(el, biter) {
    for (const b of liste(biter)) {
      if (!b || typeof b !== "object") continue;
      const ytre = lag(b.fet === true ? "strong" : b.kursiv === true ? "em" : "span");
      let indre = ytre;
      if (b.fet === true && b.kursiv === true) {
        indre = lag("em");
        ytre.appendChild(indre);
      }
      indre.textContent = tekst(b.tekst);
      el.appendChild(ytre);
    }
  }

  // Én blokk fra modellen, eller null for en ukjent type (ignoreres).
  function oppgaveBlokk(b) {
    if (!b || typeof b !== "object") return null;
    let el = null;
    if (b.type === "overskrift") {
      el = lag(OVERSKRIFT_TAGG[(Number.isSafeInteger(b.niva) && b.niva >= 1 && b.niva <= 6 ? b.niva : 1) - 1]);
      fyllBiter(el, b.biter);
    } else if (b.type === "liste") {
      const nummerert = b.nummerert === true;
      el = lag(nummerert ? "ol" : "ul");
      if (nummerert && Number.isSafeInteger(b.start) && b.start >= 1) el.start = b.start;
      el.className = dybde(b.dybde);
      for (const punkt of liste(b.punkter)) {
        const li = lag("li");
        fyllBiter(li, punkt);
        el.appendChild(li);
      }
    } else if (Object.prototype.hasOwnProperty.call(OPPGAVE_TAGG, b.type)) {
      el = lag(OPPGAVE_TAGG[b.type]);
      if (b.type === "sitat") el.className = dybde(b.dybde);
      fyllBiter(el, b.biter);
    }
    if (el) el.dir = "auto";
    return el;
  }

  function visLaast() {
    const v = !kanSetteKarakter ? laastIkkeLevert : !typeKjent ? laastOppgave : "";
    sett("laast", v);
    laast.hidden = v === "";
  }

  function tomOppgavetekst() {
    oppgavetekst.replaceChildren();
    sett("oppgaveInfo", "");
    typeKjent = false;
    laastOppgave = "";
  }

  // Oppgaveteksten for gjeldende generasjon. Ny oppgave (eller nytt panel) = sammenfoldet.
  function visOppgavetekst(m) {
    if (generasjon === null || m.generasjon !== generasjon) return;
    const t = m.tekster || {};
    if (m.sammeOppgave !== true) oppgaveBoks.open = false;
    oppgaveBoks.hidden = false;
    tomOppgavetekst();
    sett("oppgaveTittel", t.tittel);
    sett("oppgaveInfo", t.info);
    if (m.status === "ok") {
      for (const b of liste(m.blokker)) {
        const el = oppgaveBlokk(b);
        if (el) oppgavetekst.appendChild(el);
      }
    }
    typeKjent = m.typeKjent === true;
    laastOppgave = tekst(t.laast);
    visLaast();
    las();
  }

  function tom(v) {
    generasjon = null;
    kanSetteKarakter = false;
    tomOppgavetekst();
    oppgaveBoks.open = false;
    oppgaveBoks.hidden = true;
    sett("oppgaveTittel", "");
    skjulPages();
    tomTrad();
    for (const navn of VERDIER) sett(navn, "");
    karakter.value = "";
    kommentar.value = "";
    svar.value = "";
    laastIkkeLevert = "";
    visLaast();
    melding(v, true);
  }

  function vis(m) {
    const t = m.tekster || {};
    sett("tittel", t.tittel);
    sett("kursEtikett", t.kurs);
    sett("oppgaveEtikett", t.oppgave);
    sett("elevEtikett", t.elev);
    sett("statusEtikett", t.status);
    sett("karakterEtikett", t.karakterFelt);
    sett("kommentarEtikett", t.kommentarFelt);
    sett("send", t.send);
    sett("svarEtikett", t.svarFelt);
    sett("svarSend", t.svar);
    sett("apneCanvas", t.apneCanvas);
    sett("apneOppgave", t.apneOppgave);
    sett("kurs", m.kurs);
    sett("oppgave", m.oppgave);
    sett("elev", m.elev);
    sett("status", m.status);
    sett("naverende", m.karakter);
    // Skjemaet settes alltid fra modellen (tomt), så en ny generasjon aldri
    // arver det som ble skrevet for forrige elev (B4). Svarfeltet tømmes også.
    const skjema = m.skjema || {};
    karakter.value = tekst(skjema.karakter);
    kommentar.value = tekst(skjema.kommentar);
    svar.value = "";
    const g = m.grenser || {};
    if (Number.isSafeInteger(g.karakter)) karakter.maxLength = g.karakter;
    if (Number.isSafeInteger(g.kommentar)) kommentar.maxLength = g.kommentar;
    if (Number.isSafeInteger(g.svar)) svar.maxLength = g.svar;
    generasjon = m.generasjon;
    // Ikke levert: bare lese og svare, karakterfeltene er låst med fast tekst.
    kanSetteKarakter = m.kanSetteKarakter === true;
    laastIkkeLevert = tekst(t.laast);
    // 0.4.0 (G4): oppgaveteksten kommer i en egen melding etter «vis»; til da er
    // skjemaet låst. details-tilstanden står til «oppgavetekst» sier ny oppgave.
    tomOppgavetekst();
    visLaast();
    skjulPages();
    tomTrad();
    melding("", false);
  }

  // Vellykket sending: tøm bare feltet som ble sendt; ny karakter og status.
  function sendt(m) {
    if (generasjon === null || m.generasjon !== generasjon) return;
    if (m.felt === "svar") svar.value = "";
    else if (m.felt === "skjema") {
      karakter.value = "";
      kommentar.value = "";
    } else return;
    sett("naverende", m.karakter);
    sett("status", m.status);
    venter = false;
    las();
  }

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "vis" && Number.isSafeInteger(m.generasjon)) vis(m);
    else if (m.type === "tom") tom(m.tekst);
    else if (m.type === "melding") melding(m.tekst, m.feil === true);
    else if (m.type === "pages" && Number.isSafeInteger(m.generasjon)) visPages(m);
    else if (m.type === "trad" && Number.isSafeInteger(m.generasjon)) visTrad(m);
    else if (m.type === "sendt" && Number.isSafeInteger(m.generasjon)) sendt(m);
    else if (m.type === "oppgavetekst" && Number.isSafeInteger(m.generasjon)) visOppgavetekst(m);
  });

  pages.addEventListener("click", () => {
    if (generasjon === null || pages.hidden) return;
    api.postMessage({ type: "apnePages", generasjon: generasjon });
  });

  apneCanvas.addEventListener("click", () => {
    if (generasjon === null) return;
    api.postMessage({ type: "apneCanvas", generasjon: generasjon });
  });

  apneOppgave.addEventListener("click", () => {
    if (generasjon === null) return;
    api.postMessage({ type: "apneOppgave", generasjon: generasjon });
  });

  send.addEventListener("click", () => {
    if (generasjon === null || venter || !kanSetteKarakter || !typeKjent) return;
    venter = true;
    las();
    api.postMessage({ type: "send", generasjon: generasjon, karakter: String(karakter.value), kommentar: String(kommentar.value) });
  });

  svarSend.addEventListener("click", () => {
    if (generasjon === null || venter) return;
    venter = true;
    las();
    api.postMessage({ type: "svar", generasjon: generasjon, tekst: String(svar.value) });
  });

  las();
  api.postMessage({ type: "klar" });
})();`;

const STIL = `
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 1.25rem 1.25rem; max-width: 48rem; }
h1 { font-size: 1.3em; font-weight: 600; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0 0 0.75rem; }
dt { opacity: 0.8; }
dd { margin: 0; overflow-wrap: anywhere; }
label { display: block; margin-top: 0.9rem; }
label > span { display: block; margin-bottom: 0.25rem; }
input, textarea { box-sizing: border-box; width: 100%; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 0.3rem 0.4rem; }
textarea { resize: vertical; min-height: 10rem; }
button { margin-top: 1rem; font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; padding: 0.4rem 0.9rem; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
button[hidden] { display: none; }
button.sekundaer { margin-top: 0; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
[data-felt="melding"] { margin-top: 0.9rem; min-height: 1.2em; }
[hidden] { display: none; }
h2 { font-size: 1.1em; font-weight: 600; margin-top: 1.5rem; }
.kommentar { border-left: 3px solid var(--vscode-panel-border, transparent); padding: 0.3rem 0.6rem; margin: 0.5rem 0; }
.kommentar.elev { border-left-color: var(--vscode-focusBorder); }
.kommentar .meta { opacity: 0.8; font-size: 0.9em; }
.kommentar .tekst { white-space: pre-wrap; overflow-wrap: anywhere; }
.kommentar .vedlegg { font-style: italic; overflow-wrap: anywhere; }
[data-felt="melding"].feil { color: var(--vscode-errorForeground); }
details[data-felt="oppgaveBoks"] { margin: 0.9rem 0; }
details[data-felt="oppgaveBoks"] > summary { cursor: pointer; font-weight: 600; }
[data-felt="oppgavetekst"] p, [data-felt="oppgavetekst"] li, [data-felt="oppgavetekst"] blockquote, [data-felt="oppgavetekst"] pre { white-space: pre-wrap; overflow-wrap: anywhere; }
[data-felt="oppgavetekst"] pre { font-family: var(--vscode-editor-font-family); }
[data-felt="oppgavetekst"] blockquote { border-left: 3px solid var(--vscode-panel-border, transparent); padding-left: 0.6rem; }
${Array.from({ length: 10 }, (_, i) => `[data-felt="oppgavetekst"] .dybde-${i + 1} { margin-left: ${i * 1.5}em; }`).join("\n")}
`;

// Statisk HTML for panelet. `nonce` lages med lagNonce() for hvert panel.
export function lagHtml(nonce) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(nonce)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${STIL}</style>
</head>
<body>
<h1 data-felt="tittel"></h1>
<dl>
<dt data-felt="kursEtikett"></dt><dd data-felt="kurs"></dd>
<dt data-felt="oppgaveEtikett"></dt><dd data-felt="oppgave"></dd>
<dt data-felt="elevEtikett"></dt><dd data-felt="elev"></dd>
<dt data-felt="statusEtikett"></dt><dd data-felt="status"></dd>
</dl>
<p data-felt="naverende"></p>
<button type="button" data-felt="pages" class="sekundaer" hidden disabled></button>
<button type="button" data-felt="apneCanvas" class="sekundaer" hidden disabled></button>
<button type="button" data-felt="apneOppgave" class="sekundaer" hidden disabled></button>
<details data-felt="oppgaveBoks" hidden><summary data-felt="oppgaveTittel"></summary><p data-felt="oppgaveInfo"></p><div data-felt="oppgavetekst"></div></details>
<p data-felt="laast" hidden></p>
<label><span data-felt="karakterEtikett"></span><input data-felt="karakter" type="text" autocomplete="off" spellcheck="false" disabled></label>
<label><span data-felt="kommentarEtikett"></span><textarea data-felt="kommentar" rows="10" autocomplete="off" disabled></textarea></label>
<button type="button" data-felt="send" disabled></button>
<h2 data-felt="tradTittel"></h2>
<p data-felt="tradInfo"></p>
<div data-felt="trad"></div>
<label><span data-felt="svarEtikett"></span><textarea data-felt="svar" rows="5" autocomplete="off" disabled></textarea></label>
<button type="button" data-felt="svarSend" disabled></button>
<p data-felt="melding" role="status" aria-live="polite"></p>
<script nonce="${nonce}">${WEBVIEW_SKRIPT}</script>
</body>
</html>`;
}
