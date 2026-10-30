// QuickPick med et ekte standardvalg (D5-rettingen). `showQuickPick` kan ikke
// sette hvilken rad som er markert ved enkeltvalg (`picked` virker bare ved
// flervalg), så her brukes createQuickPick:
// - enkeltvalg: raden med `standard: true` blir `activeItems` (Enter velger den)
// - flervalg: radene med `picked: true` blir `selectedItems`
// Gir valgt rad (eller rader ved flervalg), eller undefined hvis lukket.
import * as vscode from "vscode";

export function velg(items, { title, placeHolder, canPickMany = false, matchOnDescription = false } = {}) {
  return new Promise((resolve) => {
    const qp = vscode.window.createQuickPick();
    qp.title = title;
    qp.placeholder = placeHolder;
    qp.canSelectMany = canPickMany;
    qp.matchOnDescription = matchOnDescription;
    qp.ignoreFocusOut = true;
    qp.items = items;
    if (canPickMany) qp.selectedItems = items.filter((i) => i.picked);
    else {
      const standard = items.find((i) => i.standard);
      if (standard) qp.activeItems = [standard];
    }
    let ferdig = false;
    const slutt = (verdi) => {
      if (ferdig) return;
      ferdig = true;
      resolve(verdi);
      qp.dispose();
    };
    qp.onDidAccept(() => slutt(canPickMany ? [...qp.selectedItems] : (qp.selectedItems[0] ?? qp.activeItems[0])));
    qp.onDidHide(() => slutt(undefined));
    qp.show();
  });
}
