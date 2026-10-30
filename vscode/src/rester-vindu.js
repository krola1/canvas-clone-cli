// T12 (D5) i hovedvinduet: «Vis hva som ble liggende» og «Slett alle økter nå»,
// for begge røttene (~/canvas-clone/vscode og ~/canvas-clone/grading). Den rene
// logikken ligger i ./rester.mjs.
// - vscode/: slettes med hovedvinduets vanlige rydding (D4-regelen), så et
//   ferskt hjerteslag og økter hovedvinduet holder, røres aldri.
// - grading/: slettes med startupCleanup, uendret (levende CLI-kjøringer røres ikke).
//   Kjører VS Code i en sandkasse (Flatpak, se iSandkasse), røres ikke grading/.
// Bare i UI: øktnavn og status, aldri innholdet i en økt. Til OutputChannel
// går bare antall (T11).
import * as vscode from "vscode";
import { gradingRoot } from "../../src/storage.js";
import { velg } from "./velg.js";
import { kartleggVscode, kartleggGrading, antallSomSlettes, slettGrading } from "./rester.mjs";

const vent = (ms) => new Promise((r) => setTimeout(r, ms));

export function startRester(t, { hoved, root, logg, gradingRot = gradingRoot() }) {
  function kartlegg() {
    return { vscode: kartleggVscode(root, hoved.regelTilstand()), grading: kartleggGrading(gradingRot) };
  }

  // Hovedvinduets rydding svarer null hvis en runde allerede pågår.
  async function ryddNa() {
    for (let i = 0; i < 50; i++) {
      const r = await hoved.rydd({ medWorkspaceStorage: true });
      if (r) return r;
      await vent(100);
    }
    return null;
  }

  const totalt = (k) => k.vscode.okter.length + k.grading.okter.length;

  async function slettAlle() {
    const for_ = kartlegg();
    const nV = antallSomSlettes(for_.vscode);
    const nG = antallSomSlettes(for_.grading);
    const sandkasse = for_.grading.sandkasse ? ` ${t.vscGradingSandboxed()}` : "";
    if (nV + nG === 0) {
      const beholdes = totalt(for_);
      vscode.window.showInformationMessage(t.vscNothingToDelete(beholdes) + sandkasse, ...(beholdes > 0 ? [t.vscShowLeftovers()] : [])).then((v) => {
        if (v === t.vscShowLeftovers()) visRester();
      });
      return { status: "ingenting", beholdes, sandkasse: for_.grading.sandkasse };
    }
    const knapp = t.vscDeleteButton();
    const valg = await vscode.window.showWarningMessage(
      t.vscDeleteAllConfirm(nV, nG),
      { modal: true, detail: t.vscDeleteAllDetail(totalt(for_) - nV - nG) + sandkasse },
      knapp,
    );
    if (valg !== knapp) return { status: "avbrutt" };

    const r = await ryddNa();
    const g = slettGrading(gradingRot);
    const etter = kartlegg();
    const slettet = (r?.slettet.length ?? 0) + g.removed.length;
    const feilet = (r?.feilet.length ?? 0) + g.failed.length;
    const igjen = totalt(etter);
    logg(t.vscLogDeleteAll(slettet, feilet, igjen));
    vscode.window.showInformationMessage(t.vscDeleteAllDone(slettet, feilet, igjen) + sandkasse, ...(igjen > 0 ? [t.vscShowLeftovers()] : [])).then((v) => {
      if (v === t.vscShowLeftovers()) visRester();
    });
    return {
      status: "slettet",
      vscode: r?.slettet.map((s) => s.navn) ?? [],
      grading: g.removed.length,
      feilet,
      sandkasse: g.sandkasse,
      igjen: { vscode: etter.vscode.okter, grading: etter.grading.okter },
    };
  }

  function rader(kart, tittel) {
    const liste = [{ label: tittel, kind: vscode.QuickPickItemKind.Separator }];
    if (kart.rootSymlink) liste.push({ label: `$(warning) ${t.vscLeftoverRootSymlink()}` });
    if (kart.sandkasse) liste.push({ label: `$(warning) ${t.vscGradingSandboxed()}` });
    for (const o of kart.okter) liste.push({ label: o.navn, description: t.vscLeftoverStatus(o.status) });
    if (kart.okter.length === 0) liste.push({ label: t.vscLeftoverNone() });
    if (kart.ukjente > 0) liste.push({ label: t.vscLeftoverUnknown(kart.ukjente) });
    return liste;
  }

  async function visRester() {
    const k = kartlegg();
    const resultat = {
      status: "vist",
      vscode: k.vscode.okter,
      grading: k.grading.okter,
      ukjente: { vscode: k.vscode.ukjente, grading: k.grading.ukjente },
    };
    if (totalt(k) === 0 && k.vscode.ukjente + k.grading.ukjente === 0) {
      vscode.window.showInformationMessage(t.vscNothingLeft());
      return { ...resultat, status: "tomt" };
    }
    const slett = { label: `$(trash) ${t.vscDeleteAllNow()}`, slett: true };
    const valg = await velg(
      [
        ...(antallSomSlettes(k.vscode) + antallSomSlettes(k.grading) > 0 ? [slett] : []),
        ...rader(k.vscode, k.vscode.root),
        ...rader(k.grading, k.grading.root),
      ],
      { title: t.vscLeftoversTitle(), placeHolder: t.vscLeftoversPlaceholder() },
    );
    if (valg?.slett) return { ...resultat, slett: await slettAlle() };
    return resultat;
  }

  return { slettAlle, visRester, kartlegg };
}
