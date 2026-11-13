// Ren logikk for «Åpne i Canvas» i karakterpanelet (0.3.0) og «Åpne oppgaven i
// Canvas» i treet og panelet (0.4.0, tilsynets O3). Ingen import av
// `vscode` her, så alt kan testes med `node --test` (tests/vscode-canvaslenke.test.js).
// VS Code-delen (det eneste stedet som åpner en Canvas-lenke) ligger i
// ./canvaslenke-vindu.js.
//
// Tilsynets K4 (revidert 2026-11-05): webviewen sender bare
// `{ type: "apneCanvas", generasjon }`. Lenken bygges her etter én fast mal fra
// den lagrede Canvas-URL-en (origin) og de numeriske ID-ene i bindingen:
//   https://<canvas-vert>/courses/<kurs>/assignments/<oppgave>/submissions/<user_id>
// (innleveringssiden; virker også for elever som ikke har levert, se D0-notatet,
// «Kommentar-funn»). Aldri en URL fra Canvas-svaret (vedlegg har `verifier`), aldri
// query eller fragment. `erGyldigCanvasUri` sjekkes rett før åpning.
//
// 0.4.0 (tilsynets O3, utvider K4/P3): oppgavesiden etter én fast mal til,
//   https://<canvas-vert>/courses/<kurs>/assignments/<oppgave>
// fra den samme lagrede origin-en og numeriske ID-er (aldri `html_url` eller en URL
// fra oppgaveteksten). Valideringen godtar nøyaktig de to malene, som to ankrede
// regex-er (CANVAS_MALER), ikke en løsere felles regex.

// Innleveringssiden (0.3.0, K4).
export const CANVAS_STI = /^\/courses\/\d+\/assignments\/\d+\/submissions\/\d+$/;
// Oppgavesiden (0.4.0, O3).
export const OPPGAVE_STI = /^\/courses\/\d+\/assignments\/\d+$/;
// De eneste stiene som kan åpnes.
export const CANVAS_MALER = Object.freeze([CANVAS_STI, OPPGAVE_STI]);

const erId = (v) => Number.isSafeInteger(v) && v > 0;

// Verten (med port hvis den ikke er standard) til en gyldig Canvas-URL, eller null.
// Bare https, ingen brukernavn/passord, ingen sti, query eller fragment utover «/».
export function canvasVert(canvasUrl) {
  if (typeof canvasUrl !== "string") return null;
  let url;
  try {
    url = new URL(canvasUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.host;
}

// { authority, path } for innleveringssiden, eller null.
export function innleveringMal(canvasUrl, kursId, oppgaveId, userId) {
  const authority = canvasVert(canvasUrl);
  if (!authority || !erId(kursId) || !erId(oppgaveId) || !erId(userId)) return null;
  return { authority, path: `/courses/${kursId}/assignments/${oppgaveId}/submissions/${userId}` };
}

// { authority, path } for oppgavesiden (O3), eller null.
export function oppgaveMal(canvasUrl, kursId, oppgaveId) {
  const authority = canvasVert(canvasUrl);
  if (!authority || !erId(kursId) || !erId(oppgaveId)) return null;
  return { authority, path: `/courses/${kursId}/assignments/${oppgaveId}` };
}

// Sjekken rett før åpning. `u` er et vscode.Uri (scheme, authority, path, query,
// fragment) eller en streng. Bare https, samme vert og port som den lagrede
// Canvas-URL-en, ingen userinfo, sti etter nøyaktig én av CANVAS_MALER (innlevering
// eller oppgave), ingen query eller fragment.
export function erGyldigCanvasUri(u, canvasUrl) {
  const vert = canvasVert(canvasUrl);
  if (!vert) return false;
  let deler;
  if (typeof u === "string") {
    let url;
    try {
      url = new URL(u);
    } catch {
      return false;
    }
    if (url.username || url.password) return false;
    // Strengen må allerede være på normalform (URL normaliserer verten, %2e%2e osv.).
    if (u !== url.href) return false;
    // 0.4.0 (O3): også et tomt «?» eller «#» avvises (URL gir da tom search/hash).
    if (u.includes("?") || u.includes("#")) return false;
    deler = { scheme: url.protocol.replace(/:$/, ""), authority: url.host, path: url.pathname, query: url.search, fragment: url.hash };
  } else if (u && typeof u === "object") {
    deler = { scheme: u.scheme, authority: u.authority, path: u.path, query: u.query, fragment: u.fragment };
  } else {
    return false;
  }
  if (deler.scheme !== "https") return false;
  if (typeof deler.authority !== "string" || deler.authority.includes("@")) return false;
  if (deler.authority.toLowerCase() !== vert.toLowerCase()) return false;
  if (deler.query !== "" || deler.fragment !== "") return false;
  return typeof deler.path === "string" && CANVAS_MALER.some((mal) => mal.test(deler.path));
}
