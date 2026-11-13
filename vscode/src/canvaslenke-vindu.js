// VS Code-delen av «Åpne i Canvas» i karakterpanelet (0.3.0) og «Åpne oppgaven i
// Canvas» i treet og panelet (0.4.0, tilsynets O3), bare i hovedvinduet. Den rene
// logikken (URL-maler og validering) ligger i ./canvaslenke.mjs.
//
// Dette er det ENESTE stedet i utvidelsen som åpner en Canvas-lenke med
// `vscode.env.openExternal` (tilsynets K4; ./pages-vindu.js er det eneste andre
// stedet med openExternal, se den statiske testen i tests/vscode-pages.test.js).
// Panelet (./panel-vindu.js) og treet (./bla-vindu.js) gir bare ID-ene fra bindingen
// eller oppgavenoden hit, aldri en URL.
//
// - `apne(binding)`: innleveringssiden. `apneOppgave(ider)`: oppgavesiden; `ider` er
//   bindingen eller `{ kursId, oppgaveId }` fra en oppgavenode i treet.
//   Canvas-URL-en (origin) leses fra det lagrede oppsettet der og da, ID-ene fra
//   argumentet. `vscode.Uri.from` med fast mal, så sjekk med `erGyldigCanvasUri`
//   (både Uri-objektet og teksten) rett før åpning. Ugyldig: fast melding, ingenting
//   åpnes.
// - I ExtensionMode.Test åpnes ingenting: Uri-en registreres for testene.
import * as vscode from "vscode";
import { innleveringMal, oppgaveMal, erGyldigCanvasUri } from "./canvaslenke.mjs";
import { NOKKEL_URL } from "./oppsett.mjs";

// `lager` ({ globalState }) gir den lagrede Canvas-URL-en.
export function startCanvaslenke(t, { lager, testmodus = false }) {
  const apnet = []; // bare i testmodus: Uri-ene som ville blitt åpnet

  // Gir { status } for testene: "apnet" | "ugyldig". `lagMal(canvasUrl)` gir
  // { authority, path } etter en av de faste malene, eller null.
  async function apneEtterMal(lagMal) {
    const canvasUrl = lager?.globalState?.get(NOKKEL_URL);
    const mal = lagMal(canvasUrl);
    const uri = mal ? vscode.Uri.from({ scheme: "https", authority: mal.authority, path: mal.path }) : null;
    if (!uri || !erGyldigCanvasUri(uri, canvasUrl) || !erGyldigCanvasUri(uri.toString(), canvasUrl)) {
      vscode.window.showErrorMessage(t.vscOpenInCanvasInvalid());
      return { status: "ugyldig" };
    }
    if (testmodus) {
      apnet.push(uri.toString());
      return { status: "apnet" };
    }
    await vscode.env.openExternal(uri);
    return { status: "apnet" };
  }

  const apne = (binding) =>
    apneEtterMal((canvasUrl) => (binding ? innleveringMal(canvasUrl, binding.kursId, binding.oppgaveId, binding.userId) : null));

  const apneOppgave = (ider) => apneEtterMal((canvasUrl) => (ider ? oppgaveMal(canvasUrl, ider.kursId, ider.oppgaveId) : null));

  return { apne, apneOppgave, apnet: () => [...apnet] };
}
