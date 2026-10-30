// Inngangspunkt for VS Code-utvidelsen. D2: skjelett (aktivering, «Om»).
// D3: oppsett og token. D4: økter og sletting (./okt-vindu.js, ./okter.mjs).
// D5: bla og klone (./bla-vindu.js, ./bla.mjs) og T12 (./rester-vindu.js,
// ./rester.mjs), bare i hovedvinduet. D6b/D6c: karakterpanelet (./panel-vindu.js,
// visning og sending), også bare i hovedvinduet.
//
// Regler (prosjektets CLAUDE.md, tilsynets T17): importer aldri ../../src/config.js
// (drar inn @inquirer) eller noe fra bin/. Felles kjerne hentes fra ../../src.
// All brukervendt tekst ligger i ../../src/strings.js; språket følger VS Code.
// T15: ingen telemetri, og nettkall bare til Canvas-URL-en og `git clone`.
import * as vscode from "vscode";
import { isHttpsUrl } from "../../src/config-store.js";
import { createStrings } from "../../src/strings.js";
import { erNorsk, normaliserUrl, feilmelding, sjekkOgLagre, slett, tokenTilstand, NOKKEL_URL } from "./oppsett.mjs";
import { vscodeRot, OKT_MARKOR } from "./okter.mjs";
import { finnOkt, startOktvindu, startHovedvindu } from "./okt-vindu.js";
import { startBla } from "./bla-vindu.js";
import { startRester } from "./rester-vindu.js";
import { startPanel } from "./panel-vindu.js";
import { finnGit } from "./git-sti.mjs";

// OutputChannel-linjer som også holdes i minnet for røyktestene (`_logg`).
// Bare antall og øktnavn skrives hit, aldri elevdata eller git sin stderr (T11).
const LOGG_MAKS = 200;

// `testkrok` sendes aldri av VS Code (activate får bare context). Prøveriggen
// (scripts/provekjoring.mjs, scenario «klone») kaller activate selv fra en driver
// i samme pakke og får de interne funksjonene gjennom den, uten at de blir
// kommandoer eller `exports` i en vanlig installasjon.
export function activate(context, { testkrok } = {}) {
  const t = createStrings(!erNorsk(vscode.env.language));
  // D5-rettingen: kommandoene som gir ut det trevisningen viser (elevnavn), og
  // «Klon» med id som tekst, finnes bare når VS Code kjører utvidelsens tester.
  const testmodus = context.extensionMode === vscode.ExtensionMode.Test;
  const lager = { globalState: context.globalState, secrets: context.secrets };

  // D4: øktvindu eller hovedvindu (se okt-vindu.js).
  const root = vscodeRot();
  const okt = finnOkt(root);
  const oktvindu = okt ? startOktvindu(context, t, okt, { root }) : null;
  const hoved = okt ? null : startHovedvindu(context, t, { root });

  // D5: bla, klone og T12, bare i hovedvinduet.
  const logglinjer = [];
  let kanal = null;
  const logg = (tekst) => {
    kanal ??= vscode.window.createOutputChannel(t.vscOutputName());
    const linje = `[${new Date().toISOString()}] ${tekst}`;
    kanal.appendLine(linje);
    logglinjer.push(linje);
    if (logglinjer.length > LOGG_MAKS) logglinjer.shift();
  };
  context.subscriptions.push({ dispose: () => kanal?.dispose() });
  const engelsk = !erNorsk(vscode.env.language);
  const bla = hoved ? startBla(context, t, { hoved, root, lager, engelsk, logg, testmodus }) : null;
  const rester = hoved ? startRester(t, { hoved, root, logg }) : null;
  const karakter = hoved ? startPanel(context, t, { testmodus, lager, engelsk, logg }) : null;
  const bareHoved = (fn) => (...args) => {
    if (!hoved) {
      vscode.window.showInformationMessage(t.vscOnlyInMainWindow());
      return { status: "ikke_hovedvindu" };
    }
    return fn(...args);
  };

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
    // Trevisningen (D5) lastes på nytt etter oppsett og sletting.
    vscode.commands.registerCommand("canvasClone.setup", async () => {
      const r = await kjorOppsett(context, t);
      if (r.status === "ok") bla?.oppdater();
      return r;
    }),

    vscode.commands.registerCommand("canvasClone.deleteToken", async () => {
      await slett(lager);
      bla?.oppdater();
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

    // D5: bla og klone. «Klon» får noden fra trevisningen (i testene også dens
    // ugjennomsiktige id som tekst).
    vscode.commands.registerCommand("canvasClone.oppdater", bareHoved(() => bla.oppdater())),
    vscode.commands.registerCommand("canvasClone.klon", bareHoved((node) => bla.klon(node))),
    vscode.commands.registerCommand("canvasClone.klonPaTvers", bareHoved(() => bla.klonPaTvers())),
    // T12.
    vscode.commands.registerCommand("canvasClone.slettAlle", bareHoved(() => rester.slettAlle())),
    vscode.commands.registerCommand("canvasClone.visRester", bareHoved(() => rester.visRester())),
    // D6b: karakterpanelet fra en innlevering i treet (bare node-objektet; en id
    // som tekst bare i testene, samme regel som «Klon»).
    vscode.commands.registerCommand("canvasClone.settKarakter", bareHoved((node) => karakter.settKarakter(bla.nodeFra(node)))),
  );

  // Interne funksjoner for testene og prøveriggen: det trevisningen viser (med
  // elevnavn), det som er skrevet til OutputChannel, hvilken git som brukes, og
  // hvilke økter hovedvinduet holder. Aldri i en vanlig installasjon.
  const intern = {
    tre: (id) => (bla ? bla.treBarn(id) : null),
    treMelding: () => (bla ? bla.melding() : null),
    logg: () => [...logglinjer],
    git: () => finnGit(),
    holdt: () => (hoved ? hoved.holdtListe() : null),
    klonId: (id) => (bla ? bla.klonId(id) : null),
  };
  if (testmodus) {
    context.subscriptions.push(
      vscode.commands.registerCommand("canvasClone._tre", intern.tre),
      vscode.commands.registerCommand("canvasClone._treMelding", intern.treMelding),
      vscode.commands.registerCommand("canvasClone._logg", intern.logg),
      vscode.commands.registerCommand("canvasClone._git", intern.git),
      vscode.commands.registerCommand("canvasClone._holdt", intern.holdt),
      // D6b: innsyn i panelet (HTML, sendte meldinger, generasjon), en melding som
      // om webviewen sendte den, og binding av en rå node (for «ikke levert», som
      // treet aldri viser).
      vscode.commands.registerCommand("canvasClone._panel", () => karakter?.innsyn() ?? null),
      vscode.commands.registerCommand("canvasClone._panelMelding", (m) => karakter?.handter(m) ?? null),
      vscode.commands.registerCommand("canvasClone._panelBind", (node) => karakter?.bindOgVis(node) ?? null),
      vscode.commands.registerCommand("canvasClone._panelLukk", () => karakter?.lukk()),
    );
  }
  testkrok?.(intern);

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
