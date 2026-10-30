// Hjelpere for D4-røyktestene: bytter ut meldingsfunksjonene og de
// VS Code-kommandoene som ville lukket/åpnet vinduer, slik at flyten kan
// testes i ett testvindu. Andre kommandoer går til den ekte executeCommand.
// Utvidelsen og testene deler samme `vscode`-objekt i utvidelsesverten.
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const FANGET = [
  "workbench.action.closeWindow",
  "workbench.action.closeAllEditors",
  "vscode.openFolder",
  "vscode.removeFromRecentlyOpened",
];

// `svar(navn, args)` bestemmer hva en melding returnerer (standard: undefined,
// altså avbrutt). `kommandoer` kan overstyre enkelte fangede kommandoer.
function installer({ svar = () => undefined, kommandoer = {} } = {}) {
  const original = {
    executeCommand: vscode.commands.executeCommand,
    showInformationMessage: vscode.window.showInformationMessage,
    showWarningMessage: vscode.window.showWarningMessage,
    showErrorMessage: vscode.window.showErrorMessage,
  };
  const logg = { kommandoer: [], meldinger: [] };
  vscode.commands.executeCommand = async function (id, ...args) {
    if (FANGET.includes(id)) {
      logg.kommandoer.push({ id, args });
      if (kommandoer[id]) return kommandoer[id](...args);
      return undefined;
    }
    return original.executeCommand.call(vscode.commands, id, ...args);
  };
  for (const navn of ["showInformationMessage", "showWarningMessage", "showErrorMessage"]) {
    vscode.window[navn] = async (...args) => {
      logg.meldinger.push({ type: navn, tekst: args[0], args });
      return svar(navn, args);
    };
  }
  return {
    logg,
    original,
    gjenopprett() {
      vscode.commands.executeCommand = original.executeCommand;
      vscode.window.showInformationMessage = original.showInformationMessage;
      vscode.window.showWarningMessage = original.showWarningMessage;
      vscode.window.showErrorMessage = original.showErrorMessage;
    },
  };
}

const vent = (ms) => new Promise((r) => setTimeout(r, ms));

const OKT_MARKOR = ".canvas-clone-okt";
const FERDIG_MARKOR = ".canvas-clone-ferdig";
const mtime = (oktSti) => fs.statSync(path.join(oktSti, OKT_MARKOR)).mtimeMs;

// Lager en økt for hånd (uten utvidelsen), med valgfritt hjerteslag og ferdig-markør.
function lagOkt(root, navn, { hjerteslag = Date.now(), ferdig = null } = {}) {
  const sti = path.join(root, navn);
  fs.mkdirSync(path.join(sti, ".vscode"), { recursive: true });
  fs.writeFileSync(path.join(sti, "elev.txt"), "falsk elevfil\n");
  fs.writeFileSync(path.join(sti, OKT_MARKOR), "{}\n");
  if (ferdig) fs.writeFileSync(path.join(sti, FERDIG_MARKOR), JSON.stringify(ferdig));
  fs.utimesSync(path.join(sti, OKT_MARKOR), new Date(hjerteslag), new Date(hjerteslag));
  return sti;
}

// Stier til sammenligning i testene. På Windows gir Uri.fsPath liten
// stasjonsbokstav (d:\) og Node stor (D:\); filsystemet skiller ikke store og
// små bokstaver der (CI på Windows 2026-10-30). Produktkoden bruker sammeSti.
function likSti(p) {
  const r = path.resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
}

module.exports = { installer, vent, mtime, lagOkt, likSti, OKT_MARKOR, FERDIG_MARKOR };
