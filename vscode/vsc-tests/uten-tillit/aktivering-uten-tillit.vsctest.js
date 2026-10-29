// D0 g / kritikers B1: en `limited`-utvidelse skal aktiveres av seg selv i et
// vindu UTEN tillit (Restricted Mode), i en mappe med øktmarkøren.
const assert = require("node:assert/strict");
const vscode = require("vscode");

const ID = "krola1.canvas-clone-vscode";

suite("aktivering uten tillit", () => {
  test("vinduet er ikke betrodd", () => {
    assert.equal(vscode.workspace.isTrusted, false);
  });

  test("utvidelsen aktiveres uten å bli bedt om det", async () => {
    const ext = vscode.extensions.getExtension(ID);
    assert.ok(ext, `fant ikke ${ID}`);
    // Ikke ext.activate(): vi vil se at aktiveringshendelsene slår til selv.
    const frist = Date.now() + 15000;
    while (!ext.isActive && Date.now() < frist) {
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(ext.isActive, true);
  });

  test("kommandoen virker i Restricted Mode", async () => {
    const res = await vscode.commands.executeCommand("canvasClone.about");
    assert.equal(res.kjerne, true);
  });
});
