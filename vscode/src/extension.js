// Inngangspunkt for VS Code-utvidelsen. D2: skjelett (aktivering, «Om»).
// D3: oppsett og token. D4: økter og sletting (./okt-vindu.js, ./okter.mjs).
// Tre, kloning og panel kommer i D5-D6.
//
// Regler (prosjektets CLAUDE.md, tilsynets T17): importer aldri ../../src/config.js
// (drar inn @inquirer) eller noe fra bin/. Felles kjerne hentes fra ../../src.
// All brukervendt tekst ligger i ../../src/strings.js; språket følger VS Code.
// T15: ingen telemetri, og nettkall bare til Canvas-URL-en (via whoAmI).
import * as vscode from "vscode";
import { isHttpsUrl } from "../../src/config-store.js";
import { createStrings } from "../../src/strings.js";
import { erNorsk, normaliserUrl, feilmelding, sjekkOgLagre, slett, tokenTilstand, NOKKEL_URL } from "./oppsett.mjs";
import { vscodeRot, OKT_MARKOR } from "./okter.mjs";
import { finnOkt, startOktvindu, startHovedvindu } from "./okt-vindu.js";

export function activate(context) {
  const t = createStrings(!erNorsk(vscode.env.language));
  const lager = { globalState: context.globalState, secrets: context.secrets };

  // D4: øktvindu eller hovedvindu (se okt-vindu.js).
  const root = vscodeRot();
  const okt = finnOkt(root);
  const oktvindu = okt ? startOktvindu(context, t, okt, { root }) : null;
  const hoved = okt ? null : startHovedvindu(context, t, { root });

  context.subscriptions.push(
    vscode.commands.registerCommand("canvasClone.about", () => {
      const { displayName, version } = context.extension.packageJSON;
      // Ikke await: meldingen lukkes av brukeren, kommandoen skal returnere med en gang.
      vscode.window.showInformationMessage(`${displayName} ${version}`);
      // Returverdien brukes av røyktesten. `kjerne` viser at den felles
      // kjernen er med i bundelen og virker i utvidelsesverten.
      return { version, kjerne: isHttpsUrl("https://example.invalid") };
    }),

    // Returverdien ({ status, reason? }) brukes av røyktestene. Den inneholder
    // aldri tokenet eller navnet fra Canvas.
    vscode.commands.registerCommand("canvasClone.setup", () => kjorOppsett(context, t)),

    vscode.commands.registerCommand("canvasClone.deleteToken", async () => {
      await slett(lager);
      vscode.window.showInformationMessage(t.vscDeleted());
      return { status: "slettet" };
    }),

    // Intern (ikke i package.json, vises ikke i kommandopaletten): tilstanden
    // for røyktestene og senere delmål. Aldri selve tokenet.
    vscode.commands.registerCommand("canvasClone._tilstand", async () => ({
      canvasUrl: context.globalState.get(NOKKEL_URL),
      token: await tokenTilstand(lager),
    })),

    // «Ferdig med økten» (bare synlig i øktvinduet, se package.json).
    vscode.commands.registerCommand("canvasClone.ferdig", async () => {
      if (!oktvindu?.ferdig) {
        vscode.window.showInformationMessage(t.vscDoneOnlyInSession());
        return { status: "ikke_oktvindu" };
      }
      return oktvindu.ferdig();
    }),

    // Interne kommandoer (ikke i package.json) for røyktestene og D5. De gir
    // aldri ut elevdata, bare øktnavn og status.
    vscode.commands.registerCommand("canvasClone._okt", () => ({
      ...(oktvindu?.tilstand ?? hoved.tilstand),
      root,
    })),
    vscode.commands.registerCommand("canvasClone._nyOkt", () => (hoved ? hoved.nyOkt() : null)),
    vscode.commands.registerCommand("canvasClone._apneOkt", (sti) => (hoved ? hoved.apneOkt(sti) : null)),
    vscode.commands.registerCommand("canvasClone._rydd", () => (hoved ? hoved.rydd({ medWorkspaceStorage: true }) : null)),
    vscode.commands.registerCommand("canvasClone._tillitsSjekk", () =>
      oktvindu?.tillitsSjekk ? oktvindu.tillitsSjekk({ tving: true }) : null,
    ),
  );

  // T13/R-V7: forklar et token som har forsvunnet (SecretStorage i minnet
  // uten keyring). Ikke i øktvinduet, som ikke trenger tokenet.
  varsleOmTokenetForsvant(lager, t).catch(() => {});
}

async function kjorOppsett(context, t) {
  const tittel = t.vscSetupTitle();
  const url = await vscode.window.showInputBox({
    title: tittel,
    prompt: t.canvasUrlMessage(),
    value: context.globalState.get(NOKKEL_URL) ?? "https://",
    ignoreFocusOut: true,
    validateInput: (v) => (normaliserUrl(v) ? null : t.canvasUrlValidate()),
  });
  if (url === undefined) return { status: "avbrutt" };

  const token = await vscode.window.showInputBox({
    title: tittel,
    prompt: t.vscTokenPrompt(),
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length > 0 ? null : t.canvasTokenValidate()),
  });
  if (token === undefined) return { status: "avbrutt" };
  const canvasToken = token.trim();

  const resultat = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t.vscCheckingToken() },
    () =>
      sjekkOgLagre({
        canvasUrl: url,
        canvasToken,
        globalState: context.globalState,
        secrets: context.secrets,
      }),
  );

  if (!resultat.ok) {
    // Ikke await: kommandoen skal ikke vente på at brukeren lukker meldingen.
    vscode.window.showErrorMessage(`${feilmelding(resultat, t, canvasToken)} ${t.vscSetupNothingSaved()}`);
    return { status: "feil", reason: resultat.reason };
  }
  vscode.window.showInformationMessage(t.vscSetupDone(resultat.user?.name ?? "?"));
  return { status: "ok" };
}

async function erOktvindu() {
  for (const mappe of vscode.workspace.workspaceFolders ?? []) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(mappe.uri, OKT_MARKOR));
      return true;
    } catch {
      // ingen markør i denne mappen
    }
  }
  return false;
}

async function varsleOmTokenetForsvant(lager, t) {
  if ((await tokenTilstand(lager)) !== "forsvant") return;
  if (await erOktvindu()) return;
  const valg = await vscode.window.showWarningMessage(t.vscTokenLost(), t.vscRunSetup());
  if (valg === t.vscRunSetup()) await vscode.commands.executeCommand("canvasClone.setup");
}

export function deactivate() {}
