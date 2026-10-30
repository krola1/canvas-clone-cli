// D6b: karakterpanelet i hovedvinduet, bare visning (ingen sending til Canvas).
// Falsk Canvas (hjelpere/falsk-canvas.js) med bla-scenarioet pluss en quiz.
// Egen testkjøring («panel» i .vscode-test.mjs) med eget VS Code og eget HOME.
// Bare falske data (T19). Innsyn gjennom test-kommandoene `_panel`,
// `_panelMelding`, `_panelBind` og `_panelLukk`, som bare finnes i
// ExtensionMode.Test (se src/extension.js).
const assert = require("node:assert/strict");
const vscode = require("vscode");
const { installer } = require("../hjelpere/stubber.js");
const { CANVAS, GYLDIG_TOKEN, medFalskCanvas, installerScenario } = require("../hjelpere/falsk-canvas.js");
const { SENTINEL, KURS_A, scenario, ELEVDATA } = require("../hjelpere/bla-scenario.js");

const kjor = (id, ...args) => vscode.commands.executeCommand(id, ...args);
const vent = (ms) => new Promise((r) => setTimeout(r, ms));

// Bla-scenarioet pluss en quiz-oppgave med én levert innlevering (bare i denne kjøringen).
const QUIZ = 7772009;
const panelScenario = structuredClone(scenario);
panelScenario.assignments[KURS_A].push({
  id: QUIZ,
  name: "Frontend modul 1: QUIZ-VAKT",
  needs_grading_count: 1,
  submission_types: ["online_quiz"],
  due_at: null,
});
panelScenario.submissions[`${KURS_A}:${QUIZ}`] = [
  { user_id: 7773901, user: { id: 7773901, name: "Elev-VAKT-Quiz" }, workflow_state: "submitted", url: null, body: SENTINEL, grade: null, score: null },
];

async function medStubb(fn) {
  const f = installer();
  const fc = installerScenario(panelScenario);
  try {
    return await fn({ meldinger: f.logg.meldinger, fetch: fc.logg });
  } finally {
    fc.gjenopprett();
    f.gjenopprett();
  }
}

const barn = (id) => kjor("canvasClone._tre", id);
async function finn(id, label) {
  const b = await barn(id);
  const n = b.find((x) => x.label === label);
  assert.ok(n, `fant ikke «${label}» blant ${JSON.stringify(b.map((x) => x.label))}`);
  return n;
}
async function modul1() {
  const k = await finn(undefined, "Kurs-VAKT-Alfa");
  const f = await finn(k.id, "Frontend");
  return finn(f.id, "modul 1");
}
const panel = () => kjor("canvasClone._panel");
const sisteVis = (p) => p.sendt.filter((m) => m.type === "vis").at(-1);

// Venter til webviewen faktisk har lastet skriptet og sagt «klar».
async function ventPaKlar(antall, ms = 15000) {
  const slutt = Date.now() + ms;
  while (Date.now() < slutt) {
    if ((await panel()).klar >= antall) return;
    await vent(100);
  }
  assert.fail(`webviewen sa aldri «klar» (${(await panel()).klar} < ${antall})`);
}

suite("karakterpanelet (D6b)", () => {
  let ola;
  let kari;
  let oppgave;
  let quizElev;

  suiteSetup(async () => {
    await vscode.extensions.getExtension("krola1.canvas-clone-vscode").activate();
    await kjor("canvasClone.deleteToken");
    const r = await medFalskCanvas([CANVAS, GYLDIG_TOKEN], "canvasClone.setup");
    assert.deepEqual(r.res, { status: "ok" });
    await medStubb(async () => {
      const m = await modul1();
      oppgave = await finn(m.id, "Frontend modul 1: OPPG-VAKT-html");
      ola = await finn(oppgave.id, "elevvakt-ola");
      kari = await finn(oppgave.id, "elevvakt-kari");
      const quiz = await finn(m.id, "Frontend modul 1: QUIZ-VAKT");
      quizElev = await finn(quiz.id, "Elev-VAKT-Quiz");
    });
  });

  suiteTeardown(async () => {
    await kjor("canvasClone._panelLukk");
  });

  test("«Sett karakter» er bare på innleveringsnoder (inline og meny), og skjult i kommandopaletten", () => {
    const pkg = vscode.extensions.getExtension("krola1.canvas-clone-vscode").packageJSON;
    const meny = pkg.contributes.menus["view/item/context"].filter((m) => m.command === "canvasClone.settKarakter");
    assert.deepEqual(meny.map((m) => m.group).sort(), ["inline", "karakter@1"]);
    for (const m of meny) assert.equal(m.when, "view == canvasClone.tre && viewItem == innlevering");
    assert.deepEqual(pkg.contributes.menus.commandPalette.find((m) => m.command === "canvasClone.settKarakter"), {
      command: "canvasClone.settKarakter",
      when: "false",
    });
  });

  test("panelet åpnes fra en innleveringsnode og viser «Canvas-navn (GitHub: x)»; webviewen laster og sier «klar»", async () => {
    await medStubb(async (s) => {
      const r = await kjor("canvasClone.settKarakter", ola.id);
      assert.deepEqual(r, { status: "vist", generasjon: 1 });
      await ventPaKlar(1);
      const p = await panel();
      assert.equal(p.finnes, true);
      assert.equal(p.opprettet, 1);
      assert.equal(p.bundet, 1);
      const v = sisteVis(p);
      assert.deepEqual(Object.keys(v).sort(), ["elev", "generasjon", "grenser", "karakter", "kurs", "oppgave", "skjema", "status", "tekster", "type"]);
      assert.equal(v.elev, "Elev-VAKT-Ola (GitHub: elevvakt-ola)");
      assert.equal(v.kurs, "Kurs-VAKT-Alfa");
      assert.equal(v.oppgave, "Frontend modul 1: OPPG-VAKT-html");
      assert.deepEqual(v.skjema, { karakter: "", kommentar: "" });
      assert.equal(v.generasjon, 1);
      assert.deepEqual(s.fetch, [], "visning skal ikke kalle Canvas");
    });
  });

  test("bytte av elev: samme panel, ny generasjon og tomt skjema", async () => {
    await medStubb(async () => {
      const r = await kjor("canvasClone.settKarakter", kari.id);
      assert.deepEqual(r, { status: "vist", generasjon: 2 });
      const p = await panel();
      assert.equal(p.opprettet, 1, "bare ett panel");
      assert.equal(p.bundet, 2);
      const v = sisteVis(p);
      assert.equal(v.generasjon, 2);
      assert.equal(v.elev, "Elev-VAKT-Kari (GitHub: elevvakt-kari)");
      assert.deepEqual(v.skjema, { karakter: "", kommentar: "" });
      // Samme elev på nytt gir også ny generasjon.
      assert.equal((await kjor("canvasClone.settKarakter", kari.id)).generasjon, 3);
      assert.equal((await panel()).opprettet, 1);
    });
  });

  test("HTML: CSP med nonce, ingen innerHTML, ingen tekst eller ID-er fra Canvas", async () => {
    const { html } = await panel();
    const nonce = html.match(/<script nonce="([0-9a-f]{32})">/)?.[1];
    assert.ok(nonce, "skriptet mangler nonce");
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    assert.ok(csp, "CSP mangler");
    assert.match(csp, /(^|; )default-src 'none'(;|$)/);
    assert.match(csp, new RegExp(`(^|; )script-src 'nonce-${nonce}'(;|$)`));
    assert.match(csp, new RegExp(`(^|; )style-src 'nonce-${nonce}'(;|$)`));
    assert.ok(html.includes(`<style nonce="${nonce}">`));
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(html));
    assert.ok(!/setState|getState/.test(html));
    assert.ok(!/\son[a-z]+\s*=/i.test(html), "inline event-handler");
    for (const d of [...ELEVDATA, String(QUIZ), "7773901"]) assert.ok(!html.includes(d), `«${d}» i HTML-en`);
  });

  test("meldinger fra webviewen: feil generasjon, ID-er og ekstra felt avvises med feilmelding i panelet; gyldig «send» sendes ikke", async () => {
    await medStubb(async (s) => {
      const gen = (await panel()).bundet;
      const avvis = async (m, grunn) => {
        const for_ = (await panel()).sendt.length;
        assert.deepEqual(await kjor("canvasClone._panelMelding", m), { status: "avvist", grunn });
        const nye = (await panel()).sendt.slice(for_);
        assert.equal(nye.length, 1);
        assert.equal(nye[0].type, "melding");
        assert.equal(nye[0].feil, true);
        assert.ok(nye[0].tekst.length > 0);
        assert.ok(!nye[0].tekst.includes("LEKK-VAKT"), "innhold fra webviewen i feilmeldingen");
      };
      await avvis({ type: "send", generasjon: gen - 1, karakter: "LEKK-VAKT", kommentar: "" }, "gammel_generasjon");
      await avvis({ type: "send", generasjon: gen + 1, karakter: "LEKK-VAKT", kommentar: "" }, "ugyldig");
      await avvis({ type: "send", generasjon: gen, karakter: "LEKK-VAKT", kommentar: "", userId: 7773002 }, "ugyldig");
      await avvis({ type: "send", generasjon: gen, karakter: "LEKK-VAKT", kommentar: "", kursId: KURS_A }, "ugyldig");
      await avvis({ type: "velg", userId: 7773002 }, "ugyldig");
      await avvis({ type: "send", generasjon: gen, karakter: " ", kommentar: " " }, "tomt");
      await avvis("LEKK-VAKT", "ugyldig");
      // Gyldig: ingen sending i D6b, og ingen nettkall.
      const for_ = (await panel()).sendt.length;
      assert.deepEqual(await kjor("canvasClone._panelMelding", { type: "send", generasjon: gen, karakter: "A", kommentar: "Bra" }), { status: "ikke_sendt" });
      const nye = (await panel()).sendt.slice(for_);
      assert.deepEqual(nye.map((m) => [m.type, m.feil]), [["melding", false]]);
      assert.deepEqual(s.fetch, [], "D6b skal aldri kalle Canvas");
      // «klar» sender gjeldende modell på nytt (tomt skjema).
      assert.deepEqual(await kjor("canvasClone._panelMelding", { type: "klar" }), { status: "klar" });
      assert.equal(sisteVis(await panel()).generasjon, gen);
      assert.deepEqual(s.meldinger, [], "avviste meldinger vises i panelet, ikke som varsler");
    });
  });

  test("quiz gir feilmelding; panelet tømmes og den forrige bindingen fjernes", async () => {
    await medStubb(async (s) => {
      const for_ = await panel();
      const r = await kjor("canvasClone.settKarakter", quizElev.id);
      assert.deepEqual(r, { status: "avvist", grunn: "quiz", generasjon: for_.generasjon + 1 });
      const p = await panel();
      assert.equal(p.bundet, null);
      assert.equal(p.opprettet, 1);
      assert.equal(p.sendt.at(-1).type, "tom");
      assert.equal(s.meldinger.length, 1);
      assert.equal(s.meldinger[0].type, "showErrorMessage");
      assert.equal(s.meldinger[0].tekst, p.sendt.at(-1).tekst);
      assert.match(s.meldinger[0].tekst, /[Qq]uiz/);
      // Et skjema fra forrige elev kan ikke sendes nå.
      assert.deepEqual(await kjor("canvasClone._panelMelding", { type: "send", generasjon: for_.bundet, karakter: "A", kommentar: "" }), {
        status: "avvist",
        grunn: "ingen_binding",
      });
    });
  });

  test("ikke levert gir feilmelding (treet viser aldri slike, så noden bindes direkte i testen)", async () => {
    await medStubb(async (s) => {
      const node = {
        course: { id: KURS_A, name: "Kurs-VAKT-Alfa" },
        assignment: { id: 7772001, name: "x", submissionTypes: ["online_url"] },
        sub: { studentName: "Elev-VAKT-Ikke", workflowState: "unsubmitted", owner: null, userId: 7773006, currentGrade: null },
      };
      const r = await kjor("canvasClone._panelBind", node);
      assert.equal(r.status, "avvist");
      assert.equal(r.grunn, "ikke_levert");
      assert.equal((await panel()).bundet, null);
      assert.equal(s.meldinger.length, 1);
      assert.equal(s.meldinger[0].type, "showErrorMessage");
      assert.ok(!s.meldinger[0].tekst.includes("VAKT"));
    });
  });

  test("bare node-objekter fra treet: oppgave, ukjent id og et falskt objekt gir ingen binding", async () => {
    await medStubb(async (s) => {
      const gen = (await panel()).generasjon;
      assert.deepEqual(await kjor("canvasClone.settKarakter", oppgave.id), { status: "ikke_innlevering" });
      assert.equal(s.meldinger.at(-1).type, "showErrorMessage");
      assert.deepEqual(await kjor("canvasClone.settKarakter", "cc999999"), { status: "ugyldig" });
      assert.deepEqual(await kjor("canvasClone.settKarakter", { id: ola.id, type: "innlevering" }), { status: "ugyldig" });
      assert.deepEqual(await kjor("canvasClone.settKarakter"), { status: "ugyldig" });
      assert.equal((await panel()).generasjon, gen, "ingen bind-forsøk");
    });
  });

  test("lukket panel løsner bindingen; neste åpning lager ett nytt panel som laster på nytt", async () => {
    await medStubb(async () => {
      await kjor("canvasClone.settKarakter", ola.id);
      const klar = (await panel()).klar;
      await kjor("canvasClone._panelLukk");
      let p = await panel();
      assert.equal(p.finnes, false);
      assert.equal(p.bundet, null);
      const r = await kjor("canvasClone.settKarakter", kari.id);
      assert.equal(r.status, "vist");
      p = await panel();
      assert.equal(p.opprettet, 2);
      assert.equal(p.finnes, true);
      await ventPaKlar(klar + 1);
      assert.equal(sisteVis(await panel()).elev, "Elev-VAKT-Kari (GitHub: elevvakt-kari)");
    });
  });

  test("T-A/T11-vaktpost: body-markøren aldri i HTML, postMessage eller OutputChannel; ingen elevdata i OutputChannel", async () => {
    const p = await panel();
    assert.ok(p.sendt.length > 5);
    assert.ok(!p.html.includes(SENTINEL), "body i HTML-en");
    assert.ok(!JSON.stringify(p.sendt).includes(SENTINEL), "body i en postMessage");
    const logg = (await kjor("canvasClone._logg")).join("\n");
    for (const d of [...ELEVDATA, SENTINEL]) assert.ok(!logg.includes(d), `«${d}» i OutputChannel`);
  });
});
