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
// - Skriptet sender bare `{type:"klar"}` og `{type:"send", generasjon, karakter,
//   kommentar}` (MELDINGSFELT i ./panel.mjs), aldri ID-er.
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
  const VERDIER = ["kurs", "oppgave", "elev", "status", "naverende"];
  let generasjon = null;

  function melding(v, feil) {
    const m = f("melding");
    m.textContent = tekst(v);
    m.className = feil ? "feil" : "";
  }

  function las(laast) {
    karakter.disabled = laast;
    kommentar.disabled = laast;
    send.disabled = laast;
  }

  function tom(v) {
    generasjon = null;
    for (const navn of VERDIER) sett(navn, "");
    karakter.value = "";
    kommentar.value = "";
    las(true);
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
    sett("kurs", m.kurs);
    sett("oppgave", m.oppgave);
    sett("elev", m.elev);
    sett("status", m.status);
    sett("naverende", m.karakter);
    // Skjemaet settes alltid fra modellen (tomt), så en ny generasjon aldri
    // arver det som ble skrevet for forrige elev (B4).
    const skjema = m.skjema || {};
    karakter.value = tekst(skjema.karakter);
    kommentar.value = tekst(skjema.kommentar);
    const g = m.grenser || {};
    if (Number.isSafeInteger(g.karakter)) karakter.maxLength = g.karakter;
    if (Number.isSafeInteger(g.kommentar)) kommentar.maxLength = g.kommentar;
    generasjon = m.generasjon;
    las(false);
    melding("", false);
  }

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "vis" && Number.isSafeInteger(m.generasjon)) vis(m);
    else if (m.type === "tom") tom(m.tekst);
    else if (m.type === "melding") melding(m.tekst, m.feil === true);
  });

  send.addEventListener("click", () => {
    if (generasjon === null) return;
    api.postMessage({ type: "send", generasjon: generasjon, karakter: String(karakter.value), kommentar: String(kommentar.value) });
  });

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
[data-felt="melding"] { margin-top: 0.9rem; min-height: 1.2em; }
[data-felt="melding"].feil { color: var(--vscode-errorForeground); }
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
<label><span data-felt="karakterEtikett"></span><input data-felt="karakter" type="text" autocomplete="off" spellcheck="false" disabled></label>
<label><span data-felt="kommentarEtikett"></span><textarea data-felt="kommentar" rows="10" autocomplete="off" disabled></textarea></label>
<button type="button" data-felt="send" disabled></button>
<p data-felt="melding" role="status" aria-live="polite"></p>
<script nonce="${nonce}">${WEBVIEW_SKRIPT}</script>
</body>
</html>`;
}
