// Røyktest (D2): utvidelsen aktiveres i et workspace med øktmarkøren, og
// kommandoen «Canvas Clone: Om» kjører og bruker den felles kjernen.
// Kjøres inne i VS Code av @vscode/test-cli (mocha, ui: tdd).
const assert = require("node:assert/strict");
const vscode = require("vscode");

const ID = "krola1.canvas-clone-vscode";

suite("aktivering", () => {
  test("utvidelsen finnes og aktiveres i øktmappen", async () => {
    const ext = vscode.extensions.getExtension(ID);
    assert.ok(ext, `fant ikke ${ID}`);
    await ext.activate();
    assert.equal(ext.isActive, true);
  });

  test("canvasClone.about returnerer versjon og bruker kjernen", async () => {
    const res = await vscode.commands.executeCommand("canvasClone.about");
    // Versjonen fra package.json (D7b: ikke hardkodet, slik at testen ikke må
    // endres ved hver ny versjon).
    assert.equal(res.version, require("../package.json").version);
    assert.equal(res.kjerne, true);
  });
});
