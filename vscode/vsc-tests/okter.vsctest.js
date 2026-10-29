// D4: økter sett fra hovedvinduet. HOME er testens eget (.vscode-test/hjem-hoved,
// se .vscode-test.mjs), så øktroten er aldri lærerens. Bare falske data (T19).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vscode = require("vscode");
const { installer, lagOkt, mtime, OKT_MARKOR } = require("./hjelpere/stubber.js");

const kjor = (id, ...args) => vscode.commands.executeCommand(id, ...args);
const fortid = (ms) => Date.now() - ms;

// Hovedvinduet rydder også selv hvert 3. sekund; `_rydd` gir null hvis en
// runde allerede pågår. Prøv til vi får et svar.
async function rydd() {
  for (let i = 0; i < 50; i++) {
    const r = await kjor("canvasClone._rydd");
    if (r) return r;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("_rydd svarte aldri");
}

suite("økter i hovedvinduet (D4)", () => {
  let tilstand;
  suiteSetup(async () => {
    await vscode.extensions.getExtension("krola1.canvas-clone-vscode").activate();
    tilstand = await kjor("canvasClone._okt");
  });

  test("rollen er hovedvindu, og øktroten ligger i testens eget HOME", () => {
    assert.equal(tilstand.rolle, "hoved");
    assert.equal(tilstand.root, path.join(os.homedir(), "canvas-clone", "vscode"));
    assert.ok(tilstand.root.includes(`${path.sep}.vscode-test${path.sep}hjem-hoved${path.sep}`), tilstand.root);
  });

  test("«Ferdig med økten» gjør ingenting utenfor øktvinduet", async () => {
    const f = installer();
    try {
      assert.deepEqual(await kjor("canvasClone.ferdig"), { status: "ikke_oktvindu" });
      assert.deepEqual(f.logg.kommandoer, []);
    } finally {
      f.gjenopprett();
    }
  });

  test("ny økt: markør, settings.json og .gitignore; holdes og slettes ikke", async () => {
    const okt = await kjor("canvasClone._nyOkt");
    assert.match(okt.navn, /^\d{8}-\d{6}-[0-9a-f]{8}$/);
    assert.equal(path.dirname(okt.sti), tilstand.root);
    assert.ok(fs.statSync(path.join(okt.sti, OKT_MARKOR)).isFile());
    const innst = JSON.parse(fs.readFileSync(path.join(okt.sti, ".vscode", "settings.json"), "utf8"));
    assert.equal(innst["workbench.localHistory.enabled"], false);
    assert.equal(fs.readFileSync(path.join(path.dirname(tilstand.root), ".gitignore"), "utf8"), "*\n");
    // Selv med gammelt hjerteslag holdes den (hovedvinduet slår for den).
    fs.utimesSync(path.join(okt.sti, OKT_MARKOR), new Date(0), new Date(0));
    const r = await rydd();
    assert.equal(fs.existsSync(okt.sti), true);
    assert.ok(r.igjen.some((o) => o.navn === okt.navn && o.vurdering === "holdt"));
    assert.ok(mtime(okt.sti) > fortid(10_000), "hovedvinduet slo hjerteslag for økten");
  });

  test("ferdig økt slettes, med workspaceStorage (T11b) og fjernet fra «Åpne nylig»", async () => {
    const navn = "20261029-100000-0000aaaa";
    const sti = path.join(tilstand.root, navn);
    const wsDir = path.join(tilstand.wsRot, "0123456789abcdef0123456789abcdef");
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, "workspace.json"), JSON.stringify({ folder: pathToFileURL(sti).href }));
    fs.writeFileSync(path.join(wsDir, "state.vscdb"), "falsk");
    // En annen workspaceStorage-mappe skal ikke røres.
    const annenWs = path.join(tilstand.wsRot, "f".repeat(32));
    fs.mkdirSync(annenWs, { recursive: true });
    fs.writeFileSync(path.join(annenWs, "workspace.json"), JSON.stringify({ folder: "file:///et/annet/prosjekt" }));
    // Stubbene først: den automatiske runden kan slette økten før vi spør.
    const f = installer();
    try {
      lagOkt(tilstand.root, navn, { hjerteslag: fortid(20_000), ferdig: { tid: fortid(10_000), workspaceStorage: wsDir } });
      for (let i = 0; i < 50 && fs.existsSync(sti); i++) await rydd();
    } finally {
      f.gjenopprett();
    }
    assert.equal(fs.existsSync(sti), false);
    assert.equal(fs.existsSync(wsDir), false);
    assert.equal(fs.existsSync(annenWs), true);
    const fjernet = f.logg.kommandoer.filter((k) => k.id === "vscode.removeFromRecentlyOpened");
    assert.equal(fjernet.length, 1);
    assert.equal(fjernet[0].args[0].fsPath, sti);
  });

  test("ferske, nettopp avsluttede og gjenopplivede økter, og symlenker, røres ikke", async () => {
    const fersk = lagOkt(tilstand.root, "20261029-100000-0000bbbb", { hjerteslag: fortid(1_000) });
    const avslutter = lagOkt(tilstand.root, "20261029-100000-0000cccc", {
      hjerteslag: fortid(2_000),
      ferdig: { tid: fortid(1_000) },
    });
    const gjenopplivet = lagOkt(tilstand.root, "20261029-100000-0000dddd", {
      hjerteslag: fortid(1_000),
      ferdig: { tid: fortid(30_000) },
    });
    // Gammel «økt» utenfor roten, lenket inn med øktnavn.
    const utenfor = path.join(os.homedir(), "utenfor");
    lagOkt(os.homedir(), "utenfor", { hjerteslag: 0, ferdig: { tid: 1 } });
    fs.symlinkSync(utenfor, path.join(tilstand.root, "20261029-100000-0000eeee"), process.platform === "win32" ? "junction" : "dir");

    const f = installer();
    let r;
    try {
      r = await rydd();
    } finally {
      f.gjenopprett();
    }
    for (const sti of [fersk, avslutter, gjenopplivet]) assert.equal(fs.existsSync(sti), true, sti);
    assert.equal(fs.existsSync(path.join(utenfor, "elev.txt")), true);
    assert.deepEqual(r.slettet, []);
    const v = Object.fromEntries(r.igjen.map((o) => [o.navn, o.vurdering]));
    assert.equal(v["20261029-100000-0000bbbb"], "aktiv");
    assert.equal(v["20261029-100000-0000cccc"], "avslutter");
    assert.equal(v["20261029-100000-0000dddd"], "aktiv");
  });

  test("åpne økt: nekter stier som ikke er økter", async () => {
    const f = installer();
    try {
      assert.equal((await kjor("canvasClone._apneOkt", tilstand.root)).status, "ugyldig");
      const fixture = vscode.workspace.workspaceFolders[0].uri.fsPath;
      assert.equal((await kjor("canvasClone._apneOkt", fixture)).status, "ugyldig");
      assert.equal((await kjor("canvasClone._apneOkt", undefined)).status, "ugyldig");
      assert.deepEqual(f.logg.kommandoer, []);
    } finally {
      f.gjenopprett();
    }
  });

  test("åpne økt: T9c-advarsel første gang; avbrutt åpner ikke", async () => {
    const okt = await kjor("canvasClone._nyOkt");
    const f = installer(); // svarer «avbrutt» på alt
    try {
      assert.deepEqual(await kjor("canvasClone._apneOkt", okt.sti), { status: "avbrutt" });
      assert.equal(f.logg.meldinger.length, 1, JSON.stringify(f.logg.meldinger.map((m) => m.tekst)));
      assert.equal(f.logg.meldinger[0].args[1].modal, true);
      assert.ok(f.logg.meldinger[0].args[1].detail.length > 0);
      assert.deepEqual(f.logg.kommandoer, []);
    } finally {
      f.gjenopprett();
    }
  });

  test("åpne økt: godtatt advarsel gir nytt vindu uten «Åpne nylig» (T9a/T11), og vises ikke igjen", async () => {
    const okt = await kjor("canvasClone._nyOkt");
    const f = installer({ svar: (_navn, args) => args[args.length - 1] }); // trykk knappen
    try {
      assert.deepEqual(await kjor("canvasClone._apneOkt", okt.sti), { status: "apnet" });
      assert.equal(f.logg.meldinger.length, 1);
      const apne = f.logg.kommandoer.filter((k) => k.id === "vscode.openFolder");
      assert.equal(apne.length, 1);
      assert.equal(apne[0].args[0].fsPath, okt.sti);
      assert.deepEqual(apne[0].args[1], { forceNewWindow: true, noRecentEntry: true });

      assert.deepEqual(await kjor("canvasClone._apneOkt", okt.sti), { status: "apnet" });
      assert.equal(f.logg.meldinger.length, 1, "T9c vises bare før første åpning");
    } finally {
      f.gjenopprett();
    }
  });

  test("åpne økt: T9b krever bekreftelse når Workspace Trust er slått av", async () => {
    // Innstillingen kan ikke endres i testen (VS Code vil starte på nytt), så
    // lesingen av den byttes ut.
    const okt = await kjor("canvasClone._nyOkt");
    const original = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (seksjon, ...rest) =>
      seksjon === "security.workspace.trust" ? { get: (k) => (k === "enabled" ? false : undefined) } : original(seksjon, ...rest);
    const f = installer();
    try {
      assert.deepEqual(await kjor("canvasClone._apneOkt", okt.sti), { status: "avbrutt" });
      assert.equal(f.logg.meldinger.length, 1);
      assert.equal(f.logg.meldinger[0].args[1].modal, true);
      assert.deepEqual(f.logg.kommandoer, []);
    } finally {
      f.gjenopprett();
      vscode.workspace.getConfiguration = original;
    }
  });

  // Regresjon fra prøvekjøringen (D4): hovedvinduet holdt (slo for) økten det
  // hadde laget i 60 s, også etter «Ferdig», så markøren ble opphevet.
  test("en holdt økt slippes når den får ferdig-markør, og slettes da", async () => {
    const f = installer();
    try {
      const okt = await kjor("canvasClone._nyOkt");
      fs.utimesSync(path.join(okt.sti, OKT_MARKOR), new Date(fortid(20_000)), new Date(fortid(20_000)));
      fs.writeFileSync(path.join(okt.sti, ".canvas-clone-ferdig"), JSON.stringify({ tid: fortid(10_000) }));
      for (let i = 0; i < 50 && fs.existsSync(okt.sti); i++) await rydd();
      assert.equal(fs.existsSync(okt.sti), false);
    } finally {
      f.gjenopprett();
    }
  });

  test("åpning slipper holdet: økten styres deretter bare av øktvinduets hjerteslag", async () => {
    const f = installer({ svar: (_navn, args) => args[args.length - 1] });
    try {
      const okt = await kjor("canvasClone._nyOkt");
      assert.ok((await rydd()).igjen.some((o) => o.navn === okt.navn && o.vurdering === "holdt"));
      assert.deepEqual(await kjor("canvasClone._apneOkt", okt.sti), { status: "apnet" });
      const r = await rydd();
      assert.equal(r.igjen.find((o) => o.navn === okt.navn).vurdering, "aktiv");
    } finally {
      f.gjenopprett();
    }
  });

  test("T11b: workspaceStorage for en økt som er borte uten «Ferdig», slettes; for en økt som finnes, ikke", async () => {
    const borte = path.join(tilstand.root, "20261029-110000-0000ffff");
    const finnes = await kjor("canvasClone._nyOkt");
    const wsBorte = path.join(tilstand.wsRot, "a".repeat(32));
    const wsFinnes = path.join(tilstand.wsRot, "b".repeat(32));
    for (const [d, mappe] of [[wsBorte, borte], [wsFinnes, finnes.sti]]) {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, "workspace.json"), JSON.stringify({ folder: pathToFileURL(mappe).href }));
    }
    const f = installer();
    try {
      for (let i = 0; i < 20 && fs.existsSync(wsBorte); i++) await rydd();
    } finally {
      f.gjenopprett();
    }
    assert.equal(fs.existsSync(wsBorte), false);
    assert.equal(fs.existsSync(wsFinnes), true);
  });
});
