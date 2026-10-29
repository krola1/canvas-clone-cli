// Oppsettet skal også virke i et vindu uten tillit (hovedvinduet kan være
// ikke betrodd). Falsk Canvas, tokenet i minnet (--use-inmemory-secretstorage).
const assert = require("node:assert/strict");
const vscode = require("vscode");
const { CANVAS, GYLDIG_TOKEN, medFalskCanvas } = require("../hjelpere/falsk-canvas.js");

suite("oppsett uten tillit", () => {
  test("oppsett og sletting virker i Restricted Mode", async () => {
    assert.equal(vscode.workspace.isTrusted, false);
    const r = await medFalskCanvas([CANVAS, GYLDIG_TOKEN], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "ok" });
    assert.deepEqual(await vscode.commands.executeCommand("canvasClone._tilstand"), { canvasUrl: CANVAS, token: "ok" });
    await vscode.commands.executeCommand("canvasClone.deleteToken");
    assert.deepEqual(await vscode.commands.executeCommand("canvasClone._tilstand"), {
      canvasUrl: undefined,
      token: "ikke_satt_opp",
    });
  });
});
