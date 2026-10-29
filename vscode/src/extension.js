// Inngangspunkt for VS Code-utvidelsen. D2: bare skjelett - aktivering og én
// kommando for røyktest. Oppsett, token, tre, kloning og panel kommer i D3-D6.
//
// Regler (prosjektets CLAUDE.md, tilsynets T17): importer aldri ../../src/config.js
// (drar inn @inquirer) eller noe fra bin/. Felles kjerne hentes fra ../../src.
import * as vscode from "vscode";
import { isHttpsUrl } from "../../src/config-store.js";

export function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("canvasClone.about", () => {
      const { displayName, version } = context.extension.packageJSON;
      // Ikke await: meldingen lukkes av brukeren, kommandoen skal returnere med en gang.
      vscode.window.showInformationMessage(`${displayName} ${version}`);
      // Returverdien brukes av røyktesten. `kjerne` viser at den felles
      // kjernen er med i bundelen og virker i utvidelsesverten.
      return { version, kjerne: isHttpsUrl("https://example.invalid") };
    }),
  );
}

export function deactivate() {}
