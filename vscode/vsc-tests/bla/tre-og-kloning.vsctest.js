// D5: bla og klone i hovedvinduet, og T12. Falsk Canvas (hjelpere/falsk-canvas.js,
// data i hjelpere/bla-scenario.js) og falsk git først i PATH (hjelpere/testhjem.mjs).
// HOME er testens eget, så både ~/canvas-clone og kurscachen (XDG_CONFIG_HOME) er
// testens. Bare falske data (T19). Egen testkjøring («bla» i .vscode-test.mjs) med
// eget VS Code og eget HOME, så T9c-flagget og øktene herfra ikke påvirker D4-testene.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");
const { installer, vent, lagOkt, likSti, OKT_MARKOR } = require("../hjelpere/stubber.js");
const { CANVAS, GYLDIG_TOKEN, medFalskCanvas, installerScenario } = require("../hjelpere/falsk-canvas.js");
const { SENTINEL, OPPG, scenario, ELEVDATA } = require("../hjelpere/bla-scenario.js");

const kjor = (id, ...args) => vscode.commands.executeCommand(id, ...args);
const FALSK_GIT_LOGG = path.join(os.homedir(), "falsk-git.log");
const klonTest = process.platform === "win32" ? test.skip : test; // falsk git finnes ikke på Windows

// Prosjektregelen: ingen sletting utenom safeRemove (ESM, kan ikke require-es her).
// En økt «forsvinner» derfor ved at den flyttes ut av øktroten til testhjemmet,
// som tømmes med safeRemove ved neste kjøring (hjelpere/testhjem.mjs).
function flyttUt(sti) {
  fs.renameSync(sti, path.join(os.homedir(), `flyttet-${path.basename(sti)}-${Date.now()}`));
}

// Enter i en QuickPick: den aktive raden (standardvalget), eller de valgte ved flervalg.
const enter = (items, info) => (info.canSelectMany ? info.selectedItems : (info.activeItems[0] ?? items[0]));

// Falsk createQuickPick (utvidelsen bruker den, se src/velg.js). Hver QuickPick
// logges med det utvidelsen satte (items, activeItems, selectedItems, tittel), og
// `velg(items, info, nr)` gir svaret (undefined = lukket).
function falskQuickPick(velg, logg) {
  return () => {
    const accept = [];
    const hide = [];
    const qp = {
      items: [],
      activeItems: [],
      selectedItems: [],
      canSelectMany: false,
      onDidAccept: (f) => (accept.push(f), { dispose() {} }),
      onDidHide: (f) => (hide.push(f), { dispose() {} }),
      hide: () => hide.forEach((f) => f()),
      dispose() {},
      show() {
        setImmediate(() => {
          const info = {
            title: qp.title,
            placeholder: qp.placeholder,
            canSelectMany: qp.canSelectMany,
            activeItems: [...qp.activeItems],
            selectedItems: [...qp.selectedItems],
          };
          logg.push({ items: qp.items, ...info });
          const svar = velg(qp.items, info, logg.length - 1);
          if (svar === undefined) return hide.forEach((f) => f());
          qp.selectedItems = Array.isArray(svar) ? svar : [svar];
          accept.forEach((f) => f());
        });
      },
    };
    return qp;
  };
}

// Meldinger: standard er å trykke siste knapp (T9c, bekreftelser). QuickPick:
// standard er Enter.
function stubb({ velg = enter, svar = (_navn, args) => args[args.length - 1] } = {}) {
  const f = installer({ svar });
  const fc = installerScenario(scenario);
  const original = vscode.window.createQuickPick;
  const quickpicks = [];
  vscode.window.createQuickPick = falskQuickPick(velg, quickpicks);
  return {
    logg: f.logg,
    fetch: fc.logg,
    quickpicks,
    gjenopprett() {
      vscode.window.createQuickPick = original;
      fc.gjenopprett();
      f.gjenopprett();
    },
  };
}

async function medStubb(opts, fn) {
  const s = stubb(opts);
  try {
    return await fn(s);
  } finally {
    s.gjenopprett();
  }
}

const barn = (id) => kjor("canvasClone._tre", id);
async function finn(id, label) {
  const b = await barn(id);
  const n = b.find((x) => x.label === label);
  assert.ok(n, `fant ikke «${label}» blant ${JSON.stringify(b.map((x) => x.label))}`);
  return n;
}
async function oppgaveHtml() {
  const k = await finn(undefined, "Kurs-VAKT-Alfa");
  const f = await finn(k.id, "Frontend");
  const m = await finn(f.id, "modul 1");
  return finn(m.id, "Frontend modul 1: OPPG-VAKT-html");
}

const lesGitLogg = () =>
  fs.existsSync(FALSK_GIT_LOGG) ? fs.readFileSync(FALSK_GIT_LOGG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

// Alt brukeren og loggen har sett i en test, som én tekst (for vaktpostene).
const sett = (s) =>
  JSON.stringify({
    meldinger: s.logg.meldinger.map((m) => m.args),
    quickpicks: s.quickpicks.map((q) => ({ items: q.items.map(({ label, description, detail }) => ({ label, description, detail })), title: q.title, placeholder: q.placeholder })),
  });

suite("bla og klone i hovedvinduet (D5)", () => {
  let root;
  const okter = []; // øktene testene lager, ryddes i suiteTeardown

  suiteSetup(async () => {
    await vscode.extensions.getExtension("krola1.canvas-clone-vscode").activate();
    await kjor("canvasClone.deleteToken");
    // Kappløp i VS Code sin lagring (CI på macOS 2026-10-30): skrivingen over går
    // til hovedprosessen etter ~100 ms, og hovedprosessen sender den tilbake til
    // vinduet etter ~100 ms til. Kommer oppsettet (test 3) 100–200 ms etter, ser
    // utvidelsen den gamle, tomme globalState en stund (tokenet står, URL-en er
    // borte), og skriver den selv i det vinduet (T9c i «klon én innlevering»),
    // blir URL-en borte for godt. Vent til runden er over før testene starter.
    await vent(1000);
    root = (await kjor("canvasClone._okt")).root;
  });

  // Øktene som ble «åpnet» (openFolder er stubbet), avsluttes som med «Ferdig» og slettes.
  suiteTeardown(async () => {
    const f = installer();
    try {
      for (const navn of okter) {
        if (typeof navn !== "string") continue; // en test feilet før økten ble laget; feilen er meldt der
        const sti = path.join(root, navn);
        if (!fs.existsSync(sti)) continue;
        const gammel = new Date(Date.now() - 20_000);
        fs.utimesSync(path.join(sti, OKT_MARKOR), gammel, gammel);
        fs.writeFileSync(path.join(sti, ".canvas-clone-ferdig"), JSON.stringify({ tid: Date.now() - 10_000 }));
      }
      for (let i = 0; i < 50 && okter.some((n) => typeof n === "string" && fs.existsSync(path.join(root, n))); i++) {
        await kjor("canvasClone._rydd");
        await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      f.gjenopprett();
    }
  });

  test("testmiljøet: ingen WAYLAND_DISPLAY eller ozone-hint arvet, og X11 på Linux (alltid Xvfb)", () => {
    assert.equal(process.env.WAYLAND_DISPLAY, undefined);
    assert.equal(process.env.ELECTRON_OZONE_PLATFORM_HINT, undefined);
  });

  test("D8-GUI: visningen ligger i egen beholder i Activity Bar med eget ikon, og kan åpnes derfra", async () => {
    const pkg = require("../../package.json");
    const [beholder, ...andre] = pkg.contributes.viewsContainers.activitybar;
    assert.deepEqual(andre, []);
    assert.deepEqual(beholder, { id: "canvasClone", title: "Canvas Clone", icon: "media/canvas-clone.svg" });
    // Samme view-id som før, bare i den nye beholderen (ikke lenger i Utforskeren).
    assert.deepEqual(Object.keys(pkg.contributes.views), ["canvasClone"]);
    assert.deepEqual(pkg.contributes.views.canvasClone.map((v) => v.id), ["canvasClone.tre"]);
    assert.equal(pkg.contributes.views.canvasClone[0].when, "!canvasClone.oktvindu");
    // Ikonfila finnes, er 24×24 og monokrom (currentColor, ingen faste farger, ingen lenker).
    const svg = fs.readFileSync(path.join(__dirname, "..", "..", beholder.icon), "utf8");
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /currentColor/);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|href|<image|<script|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(svg), svg);
    // VS Code har registrert beholderen: kommandoene for å vise den og visningen finnes og virker.
    const alle = await vscode.commands.getCommands(true);
    assert.ok(alle.includes("workbench.view.extension.canvasClone"), "workbench.view.extension.canvasClone mangler");
    assert.ok(alle.includes("canvasClone.tre.focus"), "canvasClone.tre.focus mangler");
    await kjor("workbench.view.extension.canvasClone");
    await kjor("canvasClone.tre.focus");
  });

  test("uten oppsett: én rad til oppsettet, melding i visningen, og ingen nettkall", async () => {
    await medStubb({}, async (s) => {
      const r = await barn();
      assert.equal(r.length, 1);
      assert.equal(r[0].contextValue, "oppsett");
      assert.ok((await kjor("canvasClone._treMelding")).length > 0);
      assert.deepEqual(await kjor("canvasClone.klonPaTvers"), { status: "ikke_satt_opp" });
      const varsel = s.logg.meldinger.find((m) => m.type === "showWarningMessage");
      assert.ok(varsel, "ingen melding om oppsett");
      assert.equal(varsel.args.length, 2, "meldingen skal ha en knapp til oppsettet");
      assert.deepEqual(s.fetch, []);
    });
  });

  test("oppsett med falsk Canvas", async () => {
    const r = await medFalskCanvas([CANVAS, GYLDIG_TOKEN], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "ok" });
  });

  test("trevisning: kurs → fagretning → modul → oppgave → innleveringer, som CLI-et; ugjennomsiktige id-er (T11); aldri body (T-A)", async () => {
    await medStubb({}, async (s) => {
      const alle = [];
      const samle = async (id) => {
        const b = await barn(id);
        alle.push(...b);
        return b;
      };
      const kurs = await samle();
      assert.deepEqual(kurs.map((k) => k.label), ["Kurs-VAKT-Alfa", ".vscode-VAKT-Beta"]);
      const fag = await samle(kurs[0].id);
      assert.deepEqual(fag.map((f) => f.label), ["Frontend", "SQL"]);
      const moduler = await samle(fag[0].id);
      assert.deepEqual(moduler.map((m) => m.label), ["modul 2", "modul 1"]);
      const oppg = await samle(moduler[1].id);
      assert.deepEqual(oppg.map((o) => o.label), ["Frontend modul 1: OPPG-VAKT-html"]);
      const inn = await samle(oppg[0].id);
      assert.deepEqual(inn.map((i) => i.label), ["elevvakt-ola", "elevvakt-kari", "Elev-VAKT-Per", "elevvakt-privat", "elevvakt-feil"]);
      assert.equal(inn[0].tooltip, "Elev-VAKT-Ola (GitHub: elevvakt-ola)");
      assert.deepEqual([...new Set(alle.map((x) => x.contextValue))].sort(), ["fagretning", "innlevering", "kurs", "modul", "oppgave"]);
      for (const x of alle) {
        assert.match(x.id, /^cc\d+$/, "TreeItem.id skal være en teller (T11)");
        for (const d of ELEVDATA) assert.ok(!x.id.includes(d));
      }
      assert.ok(!JSON.stringify(alle).includes(SENTINEL), "body i trevisningen (T-A)");
      assert.ok(!sett(s).includes(SENTINEL));
      assert.ok(s.fetch.length > 0);
      assert.ok(s.fetch.every((f) => f.origin === CANVAS), "T15: bare Canvas-URL-en");
    });
  });

  test("kurslisten caches i testens XDG_CONFIG_HOME (src/cache.js), aldri i lærerens", () => {
    const cache = path.join(process.env.XDG_CONFIG_HOME, "canvas-clone", "cache.json");
    assert.ok(cache.startsWith(os.homedir() + path.sep), cache);
    const innhold = fs.readFileSync(cache, "utf8");
    assert.ok(JSON.parse(innhold)[CANVAS].courses.length === 2);
    assert.ok(!innhold.includes(SENTINEL) && !innhold.includes("elevvakt"), "bare kurs og oppgaver i cachen");
  });

  klonTest("falsk git fra testhjemmet brukes (aldri ekte git eller nett)", async () => {
    assert.equal(await kjor("canvasClone._git"), path.join(os.homedir(), "falsk-bin", "git"));
  });

  klonTest("klon én innlevering: ny økt, CLI-ets mappestruktur, T18-flagg, åpnes med D4-flyten", async () => {
    const ola = await finn((await oppgaveHtml()).id, "elevvakt-ola");
    const forGit = lesGitLogg().length;
    await medStubb({}, async (s) => {
      const r = await kjor("canvasClone.klon", ola.id);
      assert.equal(r.status, "apnet", JSON.stringify(r));
      okter.push(r.okt);
      assert.deepEqual(r.oppsummering, { klonet: 1, utenLenke: 0, utenTilgang: 0, kloneFeil: 0, avbrutt: 0, totalt: 1 });
      const sti = path.join(root, r.okt);
      assert.equal(fs.readFileSync(path.join(sti, String(OPPG.html), "elevvakt-ola_oppg", "REPO_ID"), "utf8"), "https://github.com/elevvakt-ola/oppg.git");
      assert.equal(fs.existsSync(path.join(sti, String(OPPG.html), "uten_lenke.txt")), false);
      // Første åpning i denne kjøringen: T9c-advarselen (modal) før vinduet åpnes.
      assert.ok(s.logg.meldinger.some((m) => m.args[1]?.modal === true && m.args[1]?.detail), "T9c ble ikke vist");
      const apne = s.logg.kommandoer.filter((k) => k.id === "vscode.openFolder");
      assert.equal(apne.length, 1);
      assert.equal(likSti(apne[0].args[0].fsPath), likSti(sti));
      assert.deepEqual(apne[0].args[1], { forceNewWindow: true, noRecentEntry: true });
      const git = lesGitLogg().slice(forGit);
      assert.equal(git.length, 1);
      assert.ok(git[0].args.includes("credential.helper="), "T18-flaggene mangler");
      assert.deepEqual(git[0].env, { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "" });
    });
  });

  klonTest("klon én oppgave, «trenger retting»: uten lenke / uten tilgang / klone-feil i uten_lenke.txt, uten git sin stderr (T11)", async () => {
    const oppg = await oppgaveHtml();
    await medStubb({}, async (s) => {
      const r = await kjor("canvasClone.klon", oppg.id);
      assert.equal(r.status, "apnet", JSON.stringify(r));
      okter.push(r.okt);
      // Standardvalget (Enter) er «trenger retting»: den aktive raden, ikke bare den første.
      assert.equal(s.quickpicks[0].activeItems.length, 1);
      assert.equal(s.quickpicks[0].activeItems[0].omfang, "needs_grading");
      // Innleveringene hentes på nytt før kloning, selv om noden allerede var åpnet.
      assert.ok(
        s.fetch.some((f) => f.path.endsWith(`/assignments/${OPPG.html}/submissions`)),
        "innleveringene ble ikke hentet på nytt",
      );
      assert.deepEqual(r.oppsummering, { klonet: 1, utenLenke: 1, utenTilgang: 1, kloneFeil: 1, avbrutt: 0, totalt: 4 });
      const mappe = path.join(root, r.okt, String(OPPG.html));
      assert.deepEqual(fs.readdirSync(mappe).sort(), ["elevvakt-ola_oppg", "uten_lenke.txt"]);
      const linjer = fs.readFileSync(path.join(mappe, "uten_lenke.txt"), "utf8").trim().split("\n");
      assert.deepEqual(linjer.map((l) => l.split("\t")[0]), ["Elev-VAKT-Per", "elevvakt-privat", "elevvakt-feil"]);
      assert.ok(linjer.every((l) => l.split("\t")[1].length > 0));
      const tekst = sett(s) + fs.readFileSync(path.join(mappe, "uten_lenke.txt"), "utf8");
      assert.ok(!tekst.includes("HEMMELIG-STDERR"), "git sin stderr ble vist eller lagret");
      assert.ok(!tekst.includes(SENTINEL));
    });
  });

  klonTest("ingenting klonet (bare uten lenke): modal melding; uten «Åpne likevel» slettes økten med en gang", async () => {
    const per = await finn((await oppgaveHtml()).id, "Elev-VAKT-Per");
    await medStubb({ svar: () => undefined }, async (s) => {
      const r = await kjor("canvasClone.klon", per.id);
      assert.equal(r.status, "ingen_klonet", JSON.stringify(r));
      assert.deepEqual(r.oppsummering, { klonet: 0, utenLenke: 1, utenTilgang: 0, kloneFeil: 0, avbrutt: 0, totalt: 1 });
      assert.equal(fs.existsSync(path.join(root, r.okt)), false, "økten skulle vært slettet");
      assert.ok(s.logg.meldinger.some((m) => m.args[1]?.modal === true));
      assert.equal(s.logg.kommandoer.filter((k) => k.id === "vscode.openFolder").length, 0);
    });
  });

  test("«Klon» på en oppgave henter innleveringene på nytt og oppdaterer barna i treet", async () => {
    const oppg = await oppgaveHtml();
    const for_ = await barn(oppg.id); // fra cachen i treet, ingen henting
    await medStubb({ velg: () => undefined }, async (s) => {
      assert.deepEqual(await kjor("canvasClone.klon", oppg.id), { status: "avbrutt" }); // lukker omfangsvalget
      const hentet = s.fetch.filter((f) => f.path.endsWith(`/assignments/${OPPG.html}/submissions`));
      assert.equal(hentet.length, 1, "innleveringene skulle vært hentet på nytt");
      const etter = await barn(oppg.id);
      assert.deepEqual(etter.map((x) => x.label), for_.map((x) => x.label));
      assert.ok(etter.every((x) => !for_.some((y) => y.id === x.id)), "treet viser fortsatt de gamle radene");
      assert.equal(s.fetch.filter((f) => f.path.endsWith("/submissions")).length, 1, "treet hentet ikke på nytt en gang til");
    });
    // De gamle radene gjelder ikke lenger.
    assert.deepEqual(await kjor("canvasClone.klon", for_[0].id), { status: "ugyldig" });
  });

  // --- D5-rettingen: holdet, sletting som feiler, og feilmeldinger -----------
  const kanChmod = process.platform !== "win32" && process.getuid?.() !== 0;

  test("holdet fra en ny økt har ikke utløp, og slippes når åpningen er ugyldig", async () => {
    const okt = await kjor("canvasClone._nyOkt");
    try {
      assert.deepEqual((await kjor("canvasClone._holdt")).find((x) => x.navn === okt.navn), { navn: okt.navn, til: null });
      fs.renameSync(path.join(okt.sti, OKT_MARKOR), path.join(okt.sti, "markor-flyttet")); // ikke lenger en gyldig økt
      const f = installer();
      try {
        assert.equal((await kjor("canvasClone._apneOkt", okt.sti)).status, "ugyldig");
      } finally {
        f.gjenopprett();
      }
      assert.ok(!(await kjor("canvasClone._holdt")).some((x) => x.navn === okt.navn), "holdet ble ikke sluppet");
    } finally {
      flyttUt(okt.sti);
    }
  });

  klonTest("økten forsvinner mens en åpningsdialog står åpen: riktig melding, ingen «Feil fra Canvas», holdet slippes", async () => {
    const ola = await finn((await oppgaveHtml()).id, "elevvakt-ola");
    const for_ = new Set(fs.readdirSync(root));
    // T9b (Workspace Trust av) gir alltid en modal før åpning; mens den står åpen,
    // forsvinner økten (som om noe annet slettet den).
    const original = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (seksjon, ...rest) =>
      seksjon === "security.workspace.trust" ? { get: (k) => (k === "enabled" ? false : undefined) } : original(seksjon, ...rest);
    const svar = (navn, args) => {
      if (navn === "showWarningMessage" && args[1]?.modal) {
        for (const n of fs.readdirSync(root)) if (!for_.has(n)) flyttUt(path.join(root, n));
      }
      return args[args.length - 1];
    };
    try {
      await medStubb({ svar }, async (s) => {
        const r = await kjor("canvasClone.klon", ola.id);
        assert.equal(r.status, "borte", JSON.stringify(r));
        assert.equal(r.slettet, true);
        assert.equal(s.logg.meldinger.filter((m) => m.type === "showErrorMessage").length, 0, JSON.stringify(s.logg.meldinger.map((m) => m.tekst)));
        assert.equal(s.logg.kommandoer.filter((k) => k.id === "vscode.openFolder").length, 0);
        assert.ok(!(await kjor("canvasClone._holdt")).some((x) => x.navn === r.okt));
      });
    } finally {
      vscode.workspace.getConfiguration = original;
    }
  });

  (kanChmod ? klonTest : test.skip)("sletting som feiler: «prøves igjen» i stedet for «slettet»", async () => {
    const per = await finn((await oppgaveHtml()).id, "Elev-VAKT-Per");
    // «Ingenting klonet»: mens den modale meldingen står, blir roten skrivebeskyttet,
    // så slettingen (rename i roten) feiler.
    const svar = (_navn, args) => {
      if (args[1]?.modal) fs.chmodSync(root, 0o555);
      return undefined;
    };
    try {
      await medStubb({ svar }, async (s) => {
        const r = await kjor("canvasClone.klon", per.id);
        okter.push(r.okt);
        assert.equal(r.status, "ingen_klonet", JSON.stringify(r));
        assert.equal(r.slettet, false);
        assert.ok(fs.existsSync(path.join(root, r.okt)));
        const etter = s.logg.meldinger.slice(s.logg.meldinger.findIndex((m) => m.args[1]?.modal) + 1);
        assert.equal(etter.length, 1);
        assert.equal(etter[0].type, "showWarningMessage", "feilet sletting skal være en advarsel");
      });
    } finally {
      fs.chmodSync(root, 0o755);
    }
  });

  (kanChmod ? klonTest : test.skip)("lokal feil og Canvas-feil får hver sin melding, uten token", async () => {
    const oppg = await oppgaveHtml();
    const ola = await finn(oppg.id, "elevvakt-ola");
    // Lokal feil: roten er skrivebeskyttet, så økten kan ikke lages.
    fs.chmodSync(root, 0o555);
    let lokal;
    try {
      await medStubb({}, async (s) => {
        const r = await kjor("canvasClone.klon", ola.id);
        assert.deepEqual(r, { status: "feil", fraCanvas: false });
        lokal = s.logg.meldinger.find((m) => m.type === "showErrorMessage").tekst;
      });
    } finally {
      fs.chmodSync(root, 0o755);
    }
    // Canvas-feil: innleveringene kan ikke hentes.
    let canvas;
    await medStubb({}, async (s) => {
      globalThis.fetch = async () => {
        throw new TypeError(`fetch failed ${GYLDIG_TOKEN}`);
      };
      const r = await kjor("canvasClone.klon", oppg.id);
      assert.deepEqual(r, { status: "feil", fraCanvas: true });
      canvas = s.logg.meldinger.find((m) => m.type === "showErrorMessage").tekst;
    });
    assert.notEqual(lokal.split(":")[0], canvas.split(":")[0], `${lokal} / ${canvas}`);
    assert.ok(canvas.includes("Canvas"), canvas);
    assert.ok(!lokal.includes("Canvas"), lokal);
    assert.ok(!canvas.includes(GYLDIG_TOKEN), "tokenet skal vaskes bort");
  });

  klonTest("T16: bulk på et kurs: filteret har «trenger retting» som standard; store kloninger må bekreftes med antallet", async () => {
    const kurs = await finn(undefined, "Kurs-VAKT-Alfa");
    const forOkter = fs.readdirSync(root).length;
    const forGit = lesGitLogg().length;
    // Avslått bekreftelse: ingen økt, ingen git.
    await medStubb({ svar: () => undefined }, async (s) => {
      assert.deepEqual(await kjor("canvasClone.klon", kurs.id), { status: "avbrutt" });
      const filter = s.quickpicks[0].items;
      assert.deepEqual(filter.map((x) => x.filter), ["needs_grading", "all"]);
      assert.deepEqual(s.quickpicks[0].activeItems.map((x) => x.filter), ["needs_grading"], "standardvalget");
      const bekreft = s.logg.meldinger.find((m) => m.args[1]?.modal === true);
      assert.ok(bekreft, "ingen modal bekreftelse");
      assert.match(bekreft.tekst, /\b26\b/, "antallet skal stå i bekreftelsen");
      assert.match(bekreft.args[2], /\b26\b/);
    });
    assert.equal(fs.readdirSync(root).length, forOkter, "avslått bekreftelse skal ikke lage en økt");
    assert.equal(lesGitLogg().length, forGit);
    // Godtatt bekreftelse.
    await medStubb({}, async () => {
      const r = await kjor("canvasClone.klon", kurs.id);
      assert.equal(r.status, "apnet", JSON.stringify(r));
      okter.push(r.okt);
      assert.deepEqual(r.oppsummering, { klonet: 23, utenLenke: 1, utenTilgang: 1, kloneFeil: 1, avbrutt: 0, totalt: 26 });
      assert.equal(fs.readdirSync(path.join(root, r.okt, String(OPPG.css))).length, 22);
    });
  });

  klonTest("på tvers av kurs: <økt>/<kurs>/<assignment_id>/, samme id i to kurs holdes atskilt, ingen direkte undermappe med punktum (T9a)", async () => {
    const velg = (items, info, nr) => {
      if (nr === 0) return items; // begge kursene
      if (nr === 1) return items.find((x) => x.label === "Frontend › modul 1");
      if (nr === 2) return items[0]; // «alle i denne listen»
      return enter(items, info); // trenger retting (standard)
    };
    await medStubb({ velg }, async (s) => {
      const r = await kjor("canvasClone.klonPaTvers");
      assert.equal(r.status, "apnet", JSON.stringify(r));
      okter.push(r.okt);
      assert.equal(s.quickpicks[0].canSelectMany, true);
      assert.equal(s.quickpicks[2].items[0].alle, true);
      assert.deepEqual(r.oppsummering, { klonet: 2, utenLenke: 1, utenTilgang: 1, kloneFeil: 1, avbrutt: 0, totalt: 5 });
      const sti = path.join(root, r.okt);
      const direkte = fs.readdirSync(sti).filter((n) => n !== ".vscode" && n !== OKT_MARKOR);
      assert.deepEqual(direkte.sort(), ["Kurs-VAKT-Alfa", "_.vscode-VAKT-Beta"]);
      // Bare våre egne punktum-filer direkte i økten (T9a).
      assert.deepEqual(fs.readdirSync(sti).filter((n) => n.startsWith(".")).sort(), [OKT_MARKOR, ".vscode"]);
      assert.ok(fs.existsSync(path.join(sti, "Kurs-VAKT-Alfa", String(OPPG.html), "elevvakt-ola_oppg")));
      assert.ok(fs.existsSync(path.join(sti, "_.vscode-VAKT-Beta", String(OPPG.html), "elevvakt-beta_oppg")));
    });
  });

  klonTest("OutputChannel: bare øktnavn og antall, aldri elevnavn, eiere, ID-er, body eller git sin stderr (T11)", async () => {
    const linjer = await kjor("canvasClone._logg");
    assert.ok(linjer.length >= 4, JSON.stringify(linjer));
    const tekst = linjer.join("\n");
    for (const d of [...ELEVDATA, SENTINEL, "HEMMELIG-STDERR", "github.com"]) assert.ok(!tekst.includes(d), `«${d}» i OutputChannel`);
  });

  test("T12: «vis hva som ble liggende» viser begge røttene, bare øktnavn og status", async () => {
    const grading = path.join(os.homedir(), "canvas-clone", "grading");
    fs.mkdirSync(path.join(grading, "20261030-100000-9999999"), { recursive: true }); // død PID (over pid_max)
    fs.writeFileSync(path.join(grading, "20261030-100000-9999999", "elev.txt"), "falsk\n");
    fs.mkdirSync(path.join(grading, `20261030-100000-${process.pid}`), { recursive: true }); // levende PID
    lagOkt(root, "20261030-120000-0000aaa1", { hjerteslag: Date.now() }); // ferskt hjerteslag
    await medStubb({ velg: () => undefined }, async (s) => {
      const r = await kjor("canvasClone.visRester");
      assert.equal(r.status, "vist");
      const v = Object.fromEntries(r.vscode.map((o) => [o.navn, o.status]));
      const g = Object.fromEntries(r.grading.map((o) => [o.navn, o.status]));
      assert.equal(v["20261030-120000-0000aaa1"], "apen");
      assert.equal(g["20261030-100000-9999999"], "slettes");
      assert.equal(g[`20261030-100000-${process.pid}`], "i_bruk");
      const items = s.quickpicks[0].items;
      assert.ok(items[0].slett, "«Slett alle økter nå» øverst når noe kan slettes");
      assert.equal(items.filter((x) => x.kind === vscode.QuickPickItemKind.Separator).length, 2);
      assert.ok(!sett(s).includes("elev.txt"), "innholdet i en økt skal ikke vises");
    });
  });

  test("T12: «slett alle nå» krever bekreftelse, sletter grading/ med startupCleanup og vscode/ etter D4-regelen, og rører aldri et ferskt hjerteslag", async () => {
    const grading = path.join(os.homedir(), "canvas-clone", "grading");
    const ferdig = lagOkt(root, "20261030-120000-0000aaa2", { hjerteslag: Date.now() - 20_000, ferdig: { tid: Date.now() - 10_000 } });
    // Avbrutt: ingenting slettes.
    await medStubb({ svar: () => undefined }, async (s) => {
      assert.deepEqual(await kjor("canvasClone.slettAlle"), { status: "avbrutt" });
      assert.equal(s.logg.meldinger[0].args[1].modal, true);
    });
    assert.ok(fs.existsSync(path.join(grading, "20261030-100000-9999999")));
    await medStubb({}, async () => {
      const r = await kjor("canvasClone.slettAlle");
      assert.equal(r.status, "slettet", JSON.stringify(r));
      assert.equal(r.grading, 1);
    });
    assert.equal(fs.existsSync(path.join(grading, "20261030-100000-9999999")), false);
    assert.ok(fs.existsSync(path.join(grading, `20261030-100000-${process.pid}`)), "levende CLI-økt skal stå");
    assert.equal(fs.existsSync(ferdig), false);
    assert.ok(fs.existsSync(path.join(root, "20261030-120000-0000aaa1")), "ferskt hjerteslag skal aldri slettes");
    const logg = (await kjor("canvasClone._logg")).join("\n");
    for (const d of [...ELEVDATA, SENTINEL]) assert.ok(!logg.includes(d));
    // Rydd opp etter testen (D4-regelen: ferdig-markør).
    fs.utimesSync(path.join(root, "20261030-120000-0000aaa1", OKT_MARKOR), new Date(Date.now() - 20_000), new Date(Date.now() - 20_000));
    fs.writeFileSync(path.join(root, "20261030-120000-0000aaa1", ".canvas-clone-ferdig"), JSON.stringify({ tid: Date.now() - 10_000 }));
    okter.push("20261030-120000-0000aaa1");
  });

  test("«Klon» på en ugyldig id gjør ingenting", async () => {
    await medStubb({}, async (s) => {
      assert.deepEqual(await kjor("canvasClone.klon", "cc999999"), { status: "ugyldig" });
      assert.deepEqual(s.fetch, []);
    });
  });

  // D6d (T-A): Canvas svarer 200 med ødelagt JSON som siterer body. V8 sin feilmelding
  // fra res.json() kan gjengi en bit av svaret; bare «HTTP nnn» eller en nettverksfeil
  // skal vises. Sist i suiten, og treet lastes på nytt med vanlige data etterpå.
  test("T-A: ødelagt JSON fra Canvas (200) gir ingen body i treet, varsler eller OutputChannel", async () => {
    const odelagt = () =>
      new Response(`${SENTINEL} [{"body":"${SENTINEL}"`, { status: 200, headers: { "content-type": "application/json" } });
    const medOdelagt = (slutt, fn) =>
      medStubb({}, async (s) => {
        const vanlig = globalThis.fetch;
        globalThis.fetch = async (url, opts) => (new URL(String(url)).pathname.endsWith(slutt) ? odelagt() : vanlig(url, opts));
        return fn(s);
      });
    const sjekk = (tekst, hvor) => {
      assert.ok(!String(tekst).includes(SENTINEL.slice(0, 8)), `body i ${hvor}: ${tekst}`);
      assert.ok(!String(tekst).includes(GYLDIG_TOKEN), `token i ${hvor}`);
    };
    // Innleveringene: info-raden i treet og varselet fra «Klon» (enOmGangen).
    await medOdelagt("/submissions", async (s) => {
      await kjor("canvasClone.oppdater");
      const oppg = await oppgaveHtml();
      const rader = await barn(oppg.id);
      assert.equal(rader.length, 1);
      assert.match(rader[0].label, /Canvas.*\?$/);
      sjekk(JSON.stringify(rader), "treet");
      assert.deepEqual(await kjor("canvasClone.klon", oppg.id), { status: "feil", fraCanvas: true });
      const feil = s.logg.meldinger.filter((m) => m.type === "showErrorMessage");
      assert.equal(feil.length, 1);
      sjekk(sett(s), "varsel");
    });
    // Kurslisten: meldingen i trevisningen.
    await medOdelagt("/assignments", async (s) => {
      await kjor("canvasClone.oppdater");
      assert.deepEqual(await barn(undefined), []);
      const melding = await kjor("canvasClone._treMelding");
      assert.match(melding, /Canvas.*\?$/);
      sjekk(melding, "meldingen i trevisningen");
      sjekk(sett(s), "varsel");
    });
    sjekk((await kjor("canvasClone._logg")).join("\n"), "OutputChannel");
    // Tilbake til vanlige data.
    await medStubb({}, async () => {
      await kjor("canvasClone.oppdater");
      await oppgaveHtml();
    });
  });
});
