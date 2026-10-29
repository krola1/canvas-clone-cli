// VS Code-delen av øktmodellen (D4). Den rene logikken (regelen for
// overtakelse og sletting, sti-sjekk, markører) ligger i ./okter.mjs.
//
// To roller, bestemt ved aktivering:
// - Øktvinduet: én workspace-mappe som er en økt under ~/canvas-clone/vscode/.
//   Slår hjerteslag, viser T9d-advarselen hvis vinduet er betrodd, og har
//   «Ferdig med økten» (skriv ferdig-markør, lukk vinduet).
// - Hovedvinduet: alle andre vinduer. Ser hvert TIKK etter økter som er
//   ferdige eller forlatte etter den felles regelen og sletter dem, sammen
//   med workspaceStorage/<id>/ (T11b), og fjerner dem fra «Åpne nylig».
//   Åpner nye økter (T9b/T9c, noRecentEntry).
// Ingen sletting her direkte: alt går via okter.mjs -> safeRemove.
import * as vscode from "vscode";
import path from "node:path";
import {
  TID,
  vscodeRot,
  opprettOkt,
  sjekkOktSti,
  lesOkt,
  hjerteslag,
  skrivFerdig,
  lesFerdig,
  kanGjenopptas,
  nyVaktklokke,
  tikk,
  ryddOkter,
  ryddWorkspaceStorage,
  workspaceStorageRot,
} from "./okter.mjs";

const NOKKEL_ADVARSEL_VIST = "canvasClone.oktAdvarselVist";
const KONTEKST_OKTVINDU = "canvasClone.oktvindu";

// Finner økten hvis dette vinduet er et øktvindu, ellers null.
export function finnOkt(root) {
  const mapper = vscode.workspace.workspaceFolders ?? [];
  if (mapper.length !== 1 || mapper[0].uri.scheme !== "file") return null;
  const s = sjekkOktSti(root, mapper[0].uri.fsPath);
  return s.ok ? { navn: s.navn, sti: s.sti } : null;
}

function antallUlagrede() {
  let n = 0;
  for (const gruppe of vscode.window.tabGroups.all) for (const fane of gruppe.tabs) if (fane.isDirty) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Øktvinduet
// ---------------------------------------------------------------------------
export function startOktvindu(context, t, okt, { root = vscodeRot() } = {}) {
  const tilstand = {
    rolle: "okt",
    navn: okt.navn,
    gjenopptatt: false,
    tillitsadvarselVist: false,
    ferdigStatus: null,
  };
  let slagTimer = null;
  let gjenopplivTimer = null;
  let avslutter = false;
  let advarselApen = false;

  vscode.commands.executeCommand("setContext", KONTEKST_OKTVINDU, true);
  context.subscriptions.push({
    dispose() {
      clearInterval(slagTimer);
      clearTimeout(gjenopplivTimer);
    },
  });

  const lukkVindu = () => vscode.commands.executeCommand("workbench.action.closeWindow");

  // Den felles regelen: et vindu som starter med en avsluttet eller gammel økt
  // (f.eks. gjenopprettet etter omstart av VS Code) fortsetter ikke.
  if (!kanGjenopptas(lesOkt(root, okt.navn), Date.now())) {
    vscode.window.showInformationMessage(t.vscSessionEnded());
    lukkVindu();
    return { tilstand };
  }
  tilstand.gjenopptatt = true;

  const slag = () => {
    try {
      hjerteslag(okt.sti);
    } catch {
      // Markøren er borte: økten er slettet (eller ødelagt). Ikke slå mer.
      clearInterval(slagTimer);
      slagTimer = null;
      vscode.window.showWarningMessage(t.vscSessionDeleted());
      lukkVindu();
    }
  };
  const startSlag = () => {
    clearInterval(slagTimer);
    slag();
    slagTimer = setInterval(slag, TID.HJERTESLAG);
  };
  startSlag();

  const knapp = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  knapp.text = `$(check) ${t.vscDoneButton()}`;
  knapp.tooltip = t.vscDoneTooltip();
  knapp.command = "canvasClone.ferdig";
  knapp.show();
  context.subscriptions.push(knapp);

  // «Ferdig med økten»: advar ved ulagrede filer (T11c), stopp hjerteslaget,
  // skriv ferdig-markøren (med workspaceStorage/<id> for T11b), lukk vinduet.
  // Hovedvinduet sletter rett etterpå. Lukkes vinduet ikke (f.eks. avbrutt
  // av en annen dialog), slås hjerteslaget på igjen, og økten fortsetter.
  async function ferdig() {
    if (avslutter) return { status: "pågår" };
    const ulagrede = antallUlagrede();
    if (ulagrede > 0) {
      const valg = await vscode.window.showWarningMessage(t.vscDoneUnsaved(ulagrede), { modal: true }, t.vscCloseEditors());
      if (valg !== t.vscCloseEditors()) return (tilstand.ferdigStatus = { status: "avbrutt" });
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      if (antallUlagrede() > 0) {
        vscode.window.showWarningMessage(t.vscDoneStillUnsaved());
        return (tilstand.ferdigStatus = { status: "ulagret" });
      }
    }
    avslutter = true;
    clearInterval(slagTimer);
    slagTimer = null;
    const tid = Date.now();
    const workspaceStorage = context.storageUri ? path.dirname(context.storageUri.fsPath) : null;
    try {
      skrivFerdig(okt.sti, { tid, workspaceStorage });
    } catch {
      // Kunne ikke skrive markøren (f.eks. allerede slettet): økten avsluttes
      // likevel via den vanlige regelen (gammelt hjerteslag).
    }
    tilstand.ferdigStatus = { status: "ferdig", tid, workspaceStorage };
    // Tidtakeren startes før closeWindow: venter kommandoen (f.eks. på en
    // dialog), skal gjenopplivingen likevel komme etter GJENOPPLIV.
    gjenopplivTimer = setTimeout(() => {
      avslutter = false;
      startSlag();
      tilstand.ferdigStatus = { status: "gjenopplivet", tid };
      vscode.window.showWarningMessage(t.vscDoneNotClosed());
    }, TID.GJENOPPLIV);
    await lukkVindu();
    return { status: "ferdig" };
  }

  // T9d: et betrodd øktvindu (direkte, arvet fra en forelder, eller Workspace
  // Trust slått av) får en modal der «Lukk økten» er standardvalget (første
  // knapp). Escape, VS Codes egen «Avbryt»/«Cancel» og alt annet enn et
  // eksplisitt klikk på «Fortsett likevel» lukker økten (Lars, 2026-10-29).
  // Ingen knapp har isCloseAffordance: da ville VS Code gjort «Fortsett
  // likevel» til standardknappen.
  async function tillitsSjekk({ tving = false } = {}) {
    if (!vscode.workspace.isTrusted) return { status: "ikke_betrodd" };
    if (advarselApen && !tving) return { status: "vises" };
    advarselApen = true;
    tilstand.tillitsadvarselVist = true;
    try {
      const lukk = { title: t.vscCloseSession() };
      const fortsett = { title: t.vscContinueSession() };
      const valg = await vscode.window.showWarningMessage(
        t.vscSessionTrusted(),
        { modal: true, detail: t.vscSessionTrustedDetail() },
        lukk,
        fortsett,
      );
      if (valg?.title === fortsett.title) return { status: "fortsetter" };
      return { status: "lukker", ferdig: await ferdig() };
    } finally {
      advarselApen = false;
    }
  }

  tillitsSjekk().catch(() => {});
  context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => tillitsSjekk().catch(() => {})));

  return { tilstand, ferdig, tillitsSjekk };
}

// ---------------------------------------------------------------------------
// Hovedvinduet
// ---------------------------------------------------------------------------
export function startHovedvindu(context, t, { root = vscodeRot() } = {}) {
  const klokke = nyVaktklokke(Date.now());
  const wsRot = workspaceStorageRot(context.globalStorageUri.fsPath);
  const tilstand = { rolle: "hoved", wsRot };
  // Økter hovedvinduet selv holder liv i (slår hjerteslag for) fra de er
  // opprettet til de åpnes i øktvinduet: navn -> holdes til (ms).
  const holdt = new Map();
  const feil = new Map(); // navn -> antall mislykkede slettinger
  let symlenkeVarslet = false;
  let opptatt = false;
  let runde = 0;

  vscode.commands.executeCommand("setContext", KONTEKST_OKTVINDU, false);

  // `medWorkspaceStorage`: skann workspaceStorage nå (testene og `_rydd`).
  async function rydd({ medWorkspaceStorage = false } = {}) {
    if (opptatt) return null;
    opptatt = true;
    try {
      const naa = Date.now();
      tikk(klokke, naa);
      for (const [navn, til] of holdt) {
        const sti = path.join(root, navn);
        // Aldri slå for en økt som er avsluttet (da ville «Ferdig» blitt opphevet).
        if (naa > til || lesFerdig(sti) !== null) {
          holdt.delete(navn);
          continue;
        }
        try {
          hjerteslag(sti);
        } catch {
          holdt.delete(navn);
        }
      }
      const r = ryddOkter(root, { naa, vaakenSiden: klokke.vaakenSiden, wsRot, holdt: new Set(holdt.keys()) });
      for (const s of r.slettet) {
        feil.delete(s.navn);
        // Sikkerhetsnett i tillegg til noRecentEntry (T11).
        await vscode.commands
          .executeCommand("vscode.removeFromRecentlyOpened", vscode.Uri.file(s.sti))
          .then(undefined, () => {});
      }
      // T11b for økter som ble borte uten «Ferdig»: ved oppstart, etter hver
      // sletting og ellers omtrent hvert minutt (20 tikk), ikke hvert tikk.
      let ws = null;
      if (runde++ % 20 === 0 || r.slettet.length > 0 || medWorkspaceStorage) ws = ryddWorkspaceStorage(wsRot, root);
      for (const f of r.feilet) {
        const n = (feil.get(f.navn) ?? 0) + 1;
        feil.set(f.navn, n);
        if (n === 10) vscode.window.showWarningMessage(t.vscDeleteFailed());
      }
      if (r.rootSymlink && !symlenkeVarslet && r.igjen.some((o) => o.vurdering === "forlatt")) {
        symlenkeVarslet = true;
        vscode.window.showWarningMessage(t.vscRootSymlink(root));
      }
      return {
        slettet: r.slettet.map((s) => ({ navn: s.navn, vurdering: s.vurdering, workspaceStorage: s.workspaceStorage })),
        feilet: r.feilet.map((s) => ({ navn: s.navn, code: s.code })),
        igjen: r.igjen,
        ukjente: r.ukjente,
        rootSymlink: r.rootSymlink,
        workspaceStorage: ws,
      };
    } finally {
      opptatt = false;
    }
  }

  const timer = setInterval(() => rydd().catch(() => {}), TID.TIKK);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  // Oppstartsrydding (reserve): ferdige økter slettes med en gang, forlatte
  // etter VAAKEN_KRAV (den felles regelen).
  rydd().catch(() => {});

  function hold(navn, ms = TID.HOLD) {
    holdt.set(navn, Date.now() + ms);
  }
  function slipp(navn) {
    holdt.delete(navn);
  }

  // Ny, tom økt. Hovedvinduet holder liv i den (D5 kloner inn i den) til den
  // åpnes (eller slippes, eller HOLD er ute).
  function nyOkt() {
    const okt = opprettOkt(root);
    hold(okt.navn);
    return okt;
  }

  // Åpner en økt i eget vindu (T9). Returnerer { status }.
  async function apneOkt(sti) {
    const s = sjekkOktSti(root, sti);
    if (!s.ok) return { status: "ugyldig", grunn: s.grunn };
    // T9b: tidlig advarsel. Hovedsignalet er isTrusted i øktvinduet (T9d).
    if (vscode.workspace.getConfiguration("security.workspace.trust").get("enabled") === false) {
      const valg = await vscode.window.showWarningMessage(t.vscTrustDisabled(), { modal: true }, t.vscOpenAnyway());
      if (valg !== t.vscOpenAnyway()) {
        slipp(s.navn);
        return { status: "avbrutt" };
      }
    }
    // T9c: modal advarsel før første åpning.
    if (context.globalState.get(NOKKEL_ADVARSEL_VIST) !== true) {
      const valg = await vscode.window.showWarningMessage(
        t.vscSessionWarning(),
        { modal: true, detail: t.vscSessionWarningDetail() },
        t.vscSessionUnderstood(),
      );
      if (valg !== t.vscSessionUnderstood()) {
        slipp(s.navn);
        return { status: "avbrutt" };
      }
      await context.globalState.update(NOKKEL_ADVARSEL_VIST, true);
    }
    // Ett ferskt hjerteslag, så tar øktvinduet over (det må starte innen
    // GJENOPPTA_MAKS). Hovedvinduet slutter å holde økten nå; ellers kunne det
    // slått etter «Ferdig» og opphevet markøren (funnet i prøvekjøringen, D4).
    hjerteslag(s.sti);
    slipp(s.navn);
    // T9a/T11: bare øktmappen, nytt vindu, ikke i «Åpne nylig».
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(s.sti), {
      forceNewWindow: true,
      noRecentEntry: true,
    });
    return { status: "apnet" };
  }

  return { tilstand, rydd, nyOkt, apneOkt, hold, slipp };
}
