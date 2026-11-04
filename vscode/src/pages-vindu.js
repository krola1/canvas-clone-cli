// VS Code-delen av lenken til elevens GitHub Pages (0.2.0), bare i hovedvinduet.
// Den rene logikken (URL-mal, validering, sjekken mot GitHub) ligger i ./pages.mjs.
//
// Dette er det ENESTE stedet i utvidelsen som kaller `vscode.env.openExternal`
// (P2/P3, sjekkes av en statisk test i tests/vscode-pages.test.js). Trevisningen
// (bla-vindu.js) og karakterpanelet (panel-vindu.js) gir bare «eier/repo» fra
// innleveringen eller bindingen hit, aldri en URL.
//
// - `pagesUri(mal)`: vscode.Uri.from({ scheme: "https", authority, path }).
// - `apne(repo)`: slår opp statusen der og da (`lenkeFor`), bygger Uri-en, sjekker
//   den med `erGyldigPagesUri` (både Uri-objektet og teksten), og åpner den i
//   nettleseren. Ingen lenke eller ugyldig: fast melding, ingenting åpnes.
// - I ExtensionMode.Test åpnes ingenting: Uri-en registreres for testene.
//
// Tilsynets krav: P2 (én URL-bygger, validering rett før åpning, aldri html_url/
// cname), P3 (ingen URL fra webview eller kommandoargument), T11 (ingen eier/repo
// i meldinger eller OutputChannel).
import * as vscode from "vscode";
import { lenkeFor, erGyldigPagesUri, delRepo } from "./pages.mjs";

export function pagesUri(mal) {
  return vscode.Uri.from({ scheme: "https", authority: mal.authority, path: mal.path });
}

// `sjekk` er lagPagesSjekk fra extension.js (felles for trevisningen og panelet).
export function startPages(t, { sjekk, testmodus = false }) {
  const apnet = []; // bare i testmodus: Uri-ene som ville blitt åpnet

  // Tilstanden for «eier/repo» akkurat nå: { tilstand, mal } eller null.
  function lenke(repo) {
    const r = delRepo(repo);
    return r ? lenkeFor({ repo }, sjekk.status(r.owner, r.repo)) : null;
  }

  // Åpner Pages-siden for «eier/repo». Gir { status } for testene:
  // "apnet" | "ingen_lenke" | "ugyldig".
  async function apne(repo) {
    const l = lenke(repo);
    if (!l) {
      vscode.window.showInformationMessage(t.vscPagesNone());
      return { status: "ingen_lenke" };
    }
    const uri = pagesUri(l.mal);
    if (!erGyldigPagesUri(uri) || !erGyldigPagesUri(uri.toString())) {
      vscode.window.showErrorMessage(t.vscPagesInvalid());
      return { status: "ugyldig" };
    }
    if (testmodus) {
      apnet.push(uri.toString());
      return { status: "apnet", tilstand: l.tilstand };
    }
    await vscode.env.openExternal(uri);
    return { status: "apnet", tilstand: l.tilstand };
  }

  return { lenke, apne, apnet: () => [...apnet] };
}
