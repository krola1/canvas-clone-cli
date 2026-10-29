// D4: øktvinduet, betrodd (test-electron legger til --disable-workspace-trust,
// som gir isTrusted === true, samme signal som arvet tillit, D0 b). Workspace-
// mappen er en økt i testens eget HOME (.vscode-test/hjem-oktvindu), laget av
// .vscode-test.mjs med et falskt elevrepo. Bare falske data (T19).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const { installer, vent, mtime, FERDIG_MARKOR } = require("../hjelpere/stubber.js");
const { stier, sjekkInnstillinger, sjekkTasks, sjekkIngenKjoring } = require("../hjelpere/elevrepo-sjekk.js");

const kjor = (id, ...args) => vscode.commands.executeCommand(id, ...args);
const oktSti = () => vscode.workspace.workspaceFolders[0].uri.fsPath;
const ferdigFil = () => path.join(oktSti(), FERDIG_MARKOR);
const trykk = (_navn, args) => args.find((a) => typeof a === "string" && a !== args[0]) ?? args.find((a) => a?.title);

suite("øktvinduet, betrodd (D4)", function () {
  this.timeout(30000);

  suiteSetup(async () => {
    await vscode.extensions.getExtension("krola1.canvas-clone-vscode").activate();
  });

  test("rollen er øktvindu, økten fortsatte, og hjerteslaget går", async () => {
    const t = await kjor("canvasClone._okt");
    assert.equal(t.rolle, "okt");
    assert.equal(t.gjenopptatt, true);
    assert.equal(path.join(t.root, t.navn), oktSti());
    // testhjem.mjs satte hjerteslaget i framtiden; første slag setter det til nå.
    const forste = mtime(oktSti());
    assert.ok(Math.abs(forste - Date.now()) < 10_000, `mtime ${forste}`);
    await vent(6_000);
    assert.ok(mtime(oktSti()) > forste, "nytt hjerteslag innen 6 s");
  });

  test("T9d: betrodd vindu fikk advarselen ved oppstart", async () => {
    assert.equal(vscode.workspace.isTrusted, true);
    assert.equal((await kjor("canvasClone._okt")).tillitsadvarselVist, true);
  });

  test("T8/T9a: elevrepoets .vscode/settings.json, launch.json og extensions.json har ingen effekt", () => {
    sjekkInnstillinger();
  });

  test("T8/T9a: tasks.json i elevrepoet leses ikke, og verken task eller MCP-server kjørte", async () => {
    await sjekkTasks();
    sjekkIngenKjoring();
  });

  test("T9d: bare et eksplisitt klikk på «Fortsett likevel» lar økten gå videre", async () => {
    const f = installer({ svar: (_n, args) => args[3] });
    try {
      const r = await kjor("canvasClone._tillitsSjekk");
      assert.deepEqual(r, { status: "fortsetter" });
      const m = f.logg.meldinger[0];
      assert.equal(m.args[1].modal, true);
      // «Lukk økten» er første knapp (standard), og ingen knapp er
      // isCloseAffordance (da ville VS Code gjort «Fortsett» til standard).
      assert.equal(m.args[2].isCloseAffordance, undefined);
      assert.equal(m.args[3].isCloseAffordance, undefined);
      assert.deepEqual(f.logg.kommandoer, []);
      assert.equal(fs.existsSync(ferdigFil()), false);
    } finally {
      f.gjenopprett();
    }
  });

  test("T11c: «Ferdig» med ulagret fil advarer; avbrutt eller fortsatt ulagret avslutter ikke", async () => {
    const doc = await vscode.workspace.openTextDocument(stier().fil);
    await vscode.window.showTextDocument(doc);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(0, 0), "// ulagret endring\n");
    await vscode.workspace.applyEdit(edit);
    assert.equal(doc.isDirty, true);

    let f = installer();
    try {
      assert.deepEqual(await kjor("canvasClone.ferdig"), { status: "avbrutt" });
      assert.equal(f.logg.meldinger.length, 1);
      assert.equal(f.logg.meldinger[0].args[1].modal, true);
      assert.deepEqual(f.logg.kommandoer, []);
    } finally {
      f.gjenopprett();
    }

    // «Lukk editorene og avslutt», men lukkingen avbrytes (stubben gjør ingenting).
    f = installer({ svar: trykk });
    try {
      assert.deepEqual(await kjor("canvasClone.ferdig"), { status: "ulagret" });
      assert.deepEqual(
        f.logg.kommandoer.map((k) => k.id),
        ["workbench.action.closeAllEditors"],
      );
    } finally {
      f.gjenopprett();
    }
    assert.equal(fs.existsSync(ferdigFil()), false);

    await kjor("workbench.action.files.revert");
    assert.equal(doc.isDirty, false);
    await kjor("workbench.action.closeAllEditors");
  });

  test("«Ferdig»: stopper hjerteslaget, skriver markør med workspaceStorage, lukker vinduet; gjenoppliver hvis det ikke lukkes", async () => {
    const f = installer();
    try {
      const for_ = Date.now();
      assert.deepEqual(await kjor("canvasClone.ferdig"), { status: "ferdig" });
      assert.deepEqual(f.logg.kommandoer.map((k) => k.id), ["workbench.action.closeWindow"]);
      const markor = JSON.parse(fs.readFileSync(ferdigFil(), "utf8"));
      assert.ok(markor.tid >= for_ && markor.tid <= Date.now());
      assert.ok(mtime(oktSti()) <= markor.tid + 2_000, "ingen hjerteslag etter «Ferdig»");
      // Testkjøreren holder tilstanden i minnet, men storageUri (og dermed
      // stien) finnes likevel for et mappe-workspace. Mangler den, er det en feil.
      assert.equal(typeof markor.workspaceStorage, "string", "workspaceStorage mangler i ferdig-markøren");
      assert.match(path.basename(markor.workspaceStorage), /^[0-9a-f]{32}$/);
      assert.equal(path.basename(path.dirname(markor.workspaceStorage)), "workspaceStorage");
      assert.equal((await kjor("canvasClone._okt")).ferdigStatus.status, "ferdig");

      // Vinduet ble ikke lukket (stubben): etter GJENOPPLIV slår det igjen.
      await vent(4_500);
      assert.equal((await kjor("canvasClone._okt")).ferdigStatus.status, "gjenopplivet");
      assert.ok(mtime(oktSti()) > markor.tid + 2_000, "hjerteslag etter «Ferdig» opphever markøren");
      assert.equal(f.logg.meldinger.length, 1);
      assert.equal(f.logg.meldinger[0].type, "showWarningMessage");
    } finally {
      f.gjenopprett();
    }
  });

  test("gjenopplivingen kommer selv om closeWindow aldri svarer (tidtakeren startes før)", async () => {
    let slipp;
    const f = installer({ kommandoer: { "workbench.action.closeWindow": () => new Promise((r) => (slipp = r)) } });
    try {
      const svar = kjor("canvasClone.ferdig");
      await vent(4_500);
      assert.equal((await kjor("canvasClone._okt")).ferdigStatus.status, "gjenopplivet");
      slipp();
      assert.deepEqual(await svar, { status: "ferdig" });
    } finally {
      f.gjenopprett();
    }
  });

  test("T9d: Escape (ingen knapp valgt) lukker økten", async () => {
    const f = installer(); // svarer undefined, som Escape og VS Codes «Avbryt»
    try {
      const r = await kjor("canvasClone._tillitsSjekk");
      assert.deepEqual(r, { status: "lukker", ferdig: { status: "ferdig" } });
      assert.deepEqual(f.logg.kommandoer.map((k) => k.id), ["workbench.action.closeWindow"]);
      await vent(4_500); // la gjenopplivingen skje før neste test
    } finally {
      f.gjenopprett();
    }
  });

  test("T9d: «Lukk økten» kjører «Ferdig»", async () => {
    const f = installer({ svar: (_n, args) => args[2] });
    try {
      const r = await kjor("canvasClone._tillitsSjekk");
      assert.deepEqual(r, { status: "lukker", ferdig: { status: "ferdig" } });
      assert.deepEqual(f.logg.kommandoer.map((k) => k.id), ["workbench.action.closeWindow"]);
      assert.equal(fs.existsSync(ferdigFil()), true);
      await vent(4_500); // la gjenopplivingen skje før testvinduet lukkes
    } finally {
      f.gjenopprett();
    }
  });
});
