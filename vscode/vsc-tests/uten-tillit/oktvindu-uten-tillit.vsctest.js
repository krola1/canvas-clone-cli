// D4: øktvinduet UTEN tillit (Restricted Mode), som er det normale. Workspace-
// mappen er en økt med et falskt elevrepo i testens eget HOME
// (scripts/kjor-uten-tillit.mjs). Ingen T9d-advarsel, men hjerteslag og
// «Ferdig» virker, og elevrepoets .vscode/* har ingen effekt (T8/T9a).
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");
const { vent, mtime } = require("../hjelpere/stubber.js");
const { sjekkInnstillinger, sjekkIngenKjoring } = require("../hjelpere/elevrepo-sjekk.js");

const kjor = (id, ...args) => vscode.commands.executeCommand(id, ...args);
const oktSti = () => vscode.workspace.workspaceFolders[0].uri.fsPath;

suite("øktvinduet uten tillit (D4)", function () {
  this.timeout(30000);

  test("rollen er øktvindu, og hjerteslaget går", async () => {
    assert.equal(vscode.workspace.isTrusted, false);
    const t = await kjor("canvasClone._okt");
    assert.equal(t.rolle, "okt");
    assert.equal(t.gjenopptatt, true);
    assert.equal(path.join(t.root, t.navn), oktSti());
    const forste = mtime(oktSti());
    assert.ok(Math.abs(forste - Date.now()) < 10_000);
    await vent(6_000);
    assert.ok(mtime(oktSti()) > forste);
  });

  test("ingen T9d-advarsel når vinduet ikke er betrodd", async () => {
    assert.equal((await kjor("canvasClone._okt")).tillitsadvarselVist, false);
    assert.deepEqual(await kjor("canvasClone._tillitsSjekk"), { status: "ikke_betrodd" });
  });

  // tasks.fetchTasks() venter på tillit i Restricted Mode (henger), så
  // task-listen sjekkes bare i den betrodde kjøringen (vsc-tests/oktvindu/).
  test("T8/T9a: elevrepoets .vscode/* har ingen effekt, og ingen elevkode kjørte", () => {
    sjekkInnstillinger();
    sjekkIngenKjoring();
  });

  // D5: bla, klone og T12 hører til hovedvinduet. I øktvinduet (elevkode åpen)
  // gjør kommandoene ingenting, og det finnes ingen trevisning.
  test("D5: «Klon», «Slett alle økter nå» o.l. gjør ingenting i øktvinduet", async () => {
    const original = vscode.window.showInformationMessage;
    vscode.window.showInformationMessage = async () => undefined;
    try {
      for (const k of ["canvasClone.klonPaTvers", "canvasClone.klon", "canvasClone.slettAlle", "canvasClone.visRester", "canvasClone.oppdater"]) {
        assert.deepEqual(await kjor(k), { status: "ikke_hovedvindu" }, k);
      }
    } finally {
      vscode.window.showInformationMessage = original;
    }
    assert.equal(await kjor("canvasClone._tre"), null);
  });

  test("«Ferdig med økten» er tilgjengelig i Restricted Mode", async () => {
    const alle = await vscode.commands.getCommands(true);
    assert.ok(alle.includes("canvasClone.ferdig"));
  });
});
