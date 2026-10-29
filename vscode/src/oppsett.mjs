// Ren logikk for oppsett og token i VS Code-utvidelsen (D3). Ingen import av
// `vscode` her: lageret sendes inn som objekter med samme form som
// `context.globalState` og `context.secrets`, slik at alt kan testes med
// `node --test` (tests/vscode-oppsett.test.js; .mjs fordi vscode/package.json
// ikke har "type": "module") uten VS Code.
//
// Tilsynets tiltak:
// - T8: ingen innstillinger. URL-en i globalState, tokenet bare i SecretStorage.
// - T13: utvidelsen leser aldri CLI-ets config/token (ingen import av
//   config-store sin loadConfig her). Tokenet sjekkes med whoAmI før noe lagres.
// - T13/R-V7: et flagg i globalState husker at et token er lagret, slik at vi
//   kan forklare et token som «forsvant» (SecretStorage i minnet uten keyring).
import { isHttpsUrl } from "../../src/config-store.js";
import { whoAmI } from "../../src/canvas.js";

// Nøkler. Flagget og URL-en er ikke hemmelige; tokenet ligger bare i secrets.
export const NOKKEL_URL = "canvasClone.canvasUrl";
export const NOKKEL_TOKEN_LAGRET = "canvasClone.tokenLagret";
export const HEMMELIG_TOKEN = "canvasClone.canvasToken";

// Norsk når VS Code kjører på norsk (nb, nn, no), ellers engelsk.
export function erNorsk(language) {
  return typeof language === "string" && /^(nb|nn|no)(-|$)/i.test(language);
}

// Samme regel som CLI-et: bare https://, skråstrek(er) på slutten fjernes.
// Returnerer null for ugyldig URL.
export function normaliserUrl(verdi) {
  if (typeof verdi !== "string") return null;
  const url = verdi.trim().replace(/\/+$/, "");
  return isHttpsUrl(url) ? url : null;
}

// Fjerner tokenet fra en tekst i tilfelle en feilmelding skulle inneholde det.
export function utenToken(tekst, token) {
  if (typeof tekst !== "string" || !token) return tekst;
  return tekst.split(token).join("***");
}

// Melding til brukeren når whoAmI feiler. Gjenbruker CLI-ets tekster.
export function feilmelding(resultat, t, token) {
  if (resultat.reason === "network") return utenToken(t.tokenCheckNetworkError(resultat.detail), token);
  if (resultat.reason === "invalid_token" || resultat.reason === "empty_token") return t.tokenInvalid();
  if (resultat.reason === "invalid_url") return t.canvasUrlValidate();
  return utenToken(t.tokenCheckOtherError(resultat.detail), token);
}

// Sjekker URL og token mot Canvas, og lagrer bare hvis sjekken lykkes.
// `globalState` og `secrets` har formen til VS Code sine (get/update, get/store/delete).
// Returnerer whoAmI sitt resultat ({ ok, user } eller { ok: false, reason, detail }).
export async function sjekkOgLagre({ canvasUrl, canvasToken, globalState, secrets, sjekk = whoAmI }) {
  const url = normaliserUrl(canvasUrl);
  if (!url) return { ok: false, reason: "invalid_url" };
  if (typeof canvasToken !== "string" || canvasToken.length === 0) return { ok: false, reason: "empty_token" };

  const resultat = await sjekk({ canvasUrl: url, canvasToken });
  if (!resultat.ok) return resultat;

  // Tokenet først: feiler SecretStorage, er verken URL eller flagg endret.
  await secrets.store(HEMMELIG_TOKEN, canvasToken);
  await globalState.update(NOKKEL_URL, url);
  await globalState.update(NOKKEL_TOKEN_LAGRET, true);
  return resultat;
}

// Sletter tokenet, URL-en og flagget (T13).
export async function slett({ globalState, secrets }) {
  await secrets.delete(HEMMELIG_TOKEN);
  await globalState.update(NOKKEL_URL, undefined);
  await globalState.update(NOKKEL_TOKEN_LAGRET, undefined);
}

// "ok": token finnes. "ikke_satt_opp": oppsettet er aldri gjort (eller slettet).
// "forsvant": oppsettet er gjort, men tokenet finnes ikke i dette vinduet -
// typisk SecretStorage i minnet fordi keyring mangler (D0 c, R-V7).
export async function tokenTilstand({ globalState, secrets }) {
  const token = await secrets.get(HEMMELIG_TOKEN);
  if (token) return "ok";
  return globalState.get(NOKKEL_TOKEN_LAGRET) === true ? "forsvant" : "ikke_satt_opp";
}

// Påloggingen for senere delmål (D5/D6): { canvasUrl, canvasToken } eller
// { mangler: "ikke_satt_opp" | "forsvant" }. Tokenet skal aldri vises eller logges.
export async function hentPalogging({ globalState, secrets }) {
  const canvasUrl = globalState.get(NOKKEL_URL);
  const canvasToken = await secrets.get(HEMMELIG_TOKEN);
  if (canvasToken && normaliserUrl(canvasUrl)) return { canvasUrl, canvasToken };
  if (canvasToken) return { mangler: "ikke_satt_opp" }; // token uten gyldig URL: kjør oppsettet på nytt
  return { mangler: await tokenTilstand({ globalState, secrets }) };
}
