// D6b: karakterpanelet i hovedvinduet (visning). D6c: sending til en falsk Canvas
// som fanger opp PUT-kallet til gradeSubmission (egen suite nederst, i samme fil
// fordi panelets generasjoner er felles for kjøringen).
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

async function medStubb(fn, { sc = panelScenario, svar, vedPut, vedGet } = {}) {
  const f = installer({ svar });
  const fc = installerScenario(sc, { vedPut, vedGet });
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

  test("meldinger fra webviewen: feil generasjon, ID-er og ekstra felt avvises med feilmelding i panelet; gyldig «send» går til modalen", async () => {
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
      assert.deepEqual(s.fetch, [], "avviste meldinger kaller aldri Canvas");
      assert.deepEqual(s.meldinger, [], "avviste meldinger vises i panelet, ikke som varsler");
      // Gyldig (D6c): hent på nytt, så modalen; avbrutt modal (stubbens standardsvar) gir ingen PUT.
      const for_ = (await panel()).sendt.length;
      assert.deepEqual(await kjor("canvasClone._panelMelding", { type: "send", generasjon: gen, karakter: "A", kommentar: "Bra" }), {
        status: "avbrutt",
        grunn: "modal",
      });
      const nye = (await panel()).sendt.slice(for_);
      assert.deepEqual(nye.map((m) => [m.type, m.feil]), [["melding", false]]);
      assert.deepEqual(s.fetch.map((f) => f.method), ["GET"]);
      assert.equal(s.meldinger.length, 1);
      assert.equal(s.meldinger[0].args[1].modal, true);
      // «klar» sender gjeldende modell på nytt (tomt skjema).
      assert.deepEqual(await kjor("canvasClone._panelMelding", { type: "klar" }), { status: "klar" });
      assert.equal(sisteVis(await panel()).generasjon, gen);
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

// ---------------------------------------------------------------------------
// D6c: sending
// ---------------------------------------------------------------------------

const OLA_ID = 7773001; // første innlevering i bla-scenarioet (Elev-VAKT-Ola)
const OLA_PUT = `/api/v1/courses/${KURS_A}/assignments/7772001/submissions/${OLA_ID}`;
const puts = (s) => s.fetch.filter((f) => f.method === "PUT");
const modaler = (s) => s.meldinger.filter((m) => m.type === "showWarningMessage" && m.args[1]?.modal === true);
// Svar fra stubben: «Send» i modalen (tredje argument), ellers undefined.
const trykkSend = (navn, args) => (navn === "showWarningMessage" && args[1]?.modal ? args[2] : undefined);
const sendMelding = (generasjon, karakter = "A", kommentar = "Bra jobba") =>
  kjor("canvasClone._panelMelding", { type: "send", generasjon, karakter, kommentar });
// Canvas svarer med hele innleveringen, også body (T-A: skal aldri vises). D6d: som
// ekte Canvas husker den falske karakteren, så neste henting gir den (i panelScenario).
const vedPutOk = ({ kurs, oppgave, userId, form }) => {
  const lagret = (panelScenario.submissions[`${kurs}:${oppgave}`] ?? []).find((x) => x.user_id === userId);
  const posted = form["submission[posted_grade]"];
  if (lagret && posted !== undefined) Object.assign(lagret, { grade: posted, workflow_state: "graded" });
  return { data: { user_id: userId, grade: lagret?.grade ?? posted ?? null, workflow_state: "graded", body: SENTINEL } };
};
// Scenario der Olas innlevering er endret i Canvas etter at panelet ble vist.
function medOla(endring) {
  const sc = structuredClone(panelScenario);
  Object.assign(sc.submissions[`${KURS_A}:7772001`][0], endring);
  return sc;
}
const sisteMelding = (p) => p.sendt.filter((m) => m.type === "melding").at(-1);

suite("karakterpanelet, sending (D6c)", () => {
  let ola;
  let kari;
  let oppgaveId; // oppgavenoden i treet (D6d: treet viser ny karakter)
  const alleMeldinger = []; // modaler og varsler fra hele suiten, til T-A-vaktposten

  suiteSetup(async () => {
    await medStubb(async () => {
      const oppgave = await finn((await modul1()).id, "Frontend modul 1: OPPG-VAKT-html");
      oppgaveId = oppgave.id;
      ola = await finn(oppgave.id, "elevvakt-ola");
      kari = await finn(oppgave.id, "elevvakt-kari");
    });
  });

  // Binder Ola på nytt (ny generasjon, karakter fra treet) og gir generasjonen.
  async function bindOla() {
    const r = await kjor("canvasClone.settKarakter", ola.id);
    assert.equal(r.status, "vist");
    return r.generasjon;
  }

  async function medSending(fn, opts = {}) {
    return medStubb(async (s) => {
      try {
        return await fn(s);
      } finally {
        alleMeldinger.push(...s.meldinger);
      }
    }, opts);
  }

  test("sending går til riktig kurs, oppgave og user_id med karakter og tilbakemelding; panelet får ny karakter og tomt skjema", async () => {
    const gen = await bindOla();
    await medSending(
      async (s) => {
        const kommentar = "Bra jobba.\nLinje to";
        assert.deepEqual(await sendMelding(gen, " A ", kommentar), { status: "sendt" });
        assert.deepEqual(
          s.fetch.map((f) => [f.method, f.path]),
          [
            ["GET", `/api/v1/courses/${KURS_A}/assignments/7772001/submissions`],
            ["PUT", OLA_PUT],
          ],
        );
        const put = puts(s)[0];
        assert.equal(put.origin, CANVAS);
        assert.deepEqual(Object.fromEntries(new URLSearchParams(put.body)), {
          "submission[posted_grade]": "A",
          "comment[text_comment]": kommentar,
        });
        // Modalen: navnet fra den bundne user_id, karakteren som sendes.
        const [modal] = modaler(s);
        assert.ok(modal, "ingen modal");
        assert.equal(modaler(s).length, 1);
        assert.match(modal.args[1].detail, /Elev-VAKT-Ola \(GitHub: elevvakt-ola\)/);
        assert.ok(!modal.args[1].detail.includes("Elev-VAKT-Kari"));
        assert.match(modal.args[1].detail, /: +A$/m);
        // D8-GUI: Ola har ingen karakter i Canvas ennå, så ingen «Nåværende karakter»-linje.
        assert.ok(!/(Nåværende karakter|Current grade):/.test(modal.args[1].detail), modal.args[1].detail);
        // Panelet: samme generasjon, ny karakter, tomt skjema, melding om suksess.
        const p = await panel();
        assert.equal(p.bundet, gen);
        const v = sisteVis(p);
        assert.equal(v.generasjon, gen);
        assert.match(v.karakter, /\bA\b/);
        assert.deepEqual(v.skjema, { karakter: "", kommentar: "" });
        const m = sisteMelding(p);
        assert.equal(m.feil, false);
        assert.match(m.tekst, /Elev-VAKT-Ola/);
        // OutputChannel: bare «karakter sendt», uten elevdata.
        const logg = (await kjor("canvasClone._logg")).join("\n");
        assert.match(logg, /(karakter sendt|grade sent)$/m);
        for (const d of [...ELEVDATA, SENTINEL, "Bra jobba"]) assert.ok(!logg.includes(d), `«${d}» i OutputChannel`);
      },
      { svar: trykkSend, vedPut: vedPutOk },
    );
  });

  test("bare tilbakemelding: ingen posted_grade i PUT", async () => {
    const gen = await bindOla();
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen, "", "Bare tekst"), { status: "sendt" });
        assert.deepEqual(Object.fromEntries(new URLSearchParams(puts(s)[0].body)), { "comment[text_comment]": "Bare tekst" });
      },
      { svar: trykkSend, vedPut: vedPutOk },
    );
  });

  test("avbrutt modal (Avbryt/Escape) gir ingen PUT, og skjemaet beholdes", async () => {
    const gen = await bindOla();
    await medSending(async (s) => {
      const visFor = (await panel()).sendt.filter((m) => m.type === "vis").length;
      assert.deepEqual(await sendMelding(gen), { status: "avbrutt", grunn: "modal" });
      assert.equal(modaler(s).length, 1);
      assert.deepEqual(puts(s), []);
      const p = await panel();
      assert.equal(p.sendt.filter((m) => m.type === "vis").length, visFor, "ingen ny modell (skjemaet tømmes ikke)");
      assert.equal(sisteMelding(p).feil, false);
    });
  });

  test("bytte av elev mens modalen står åpen gir ingen PUT", async () => {
    const gen = await bindOla();
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen), { status: "avbrutt", grunn: "gammel_generasjon" });
        assert.equal(modaler(s).length, 1);
        assert.deepEqual(puts(s), []);
        const p = await panel();
        assert.equal(sisteVis(p).elev, "Elev-VAKT-Kari (GitHub: elevvakt-kari)");
        assert.equal(sisteMelding(p).feil, true);
      },
      {
        svar: async (navn, args) => {
          if (navn !== "showWarningMessage" || !args[1]?.modal) return undefined;
          await kjor("canvasClone.settKarakter", kari.id);
          return args[2]; // læreren trykker «Send» i den gamle modalen
        },
        vedPut: vedPutOk,
      },
    );
  });

  test("lukket panel mens modalen står åpen gir ingen PUT", async () => {
    const gen = await bindOla();
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen), { status: "avbrutt", grunn: "gammel_generasjon" });
        assert.deepEqual(puts(s), []);
        assert.equal((await panel()).finnes, false);
      },
      {
        svar: async (navn, args) => {
          if (navn !== "showWarningMessage" || !args[1]?.modal) return undefined;
          await kjor("canvasClone._panelLukk");
          return args[2];
        },
        vedPut: vedPutOk,
      },
    );
    await bindOla();
  });

  test("gammel generasjon gir ingen PUT (og ingen kall til Canvas)", async () => {
    const gammel = await bindOla();
    await kjor("canvasClone.settKarakter", kari.id);
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gammel), { status: "avvist", grunn: "gammel_generasjon" });
        assert.deepEqual(s.fetch, []);
        assert.deepEqual(modaler(s), []);
      },
      { svar: trykkSend, vedPut: vedPutOk },
    );
  });

  test("ny GitHub-lenke eller eier siden visningen gir avbrudd: ingen modal, ingen PUT, melding i panelet", async () => {
    const endringer = [
      { body: null, url: "https://github.com/elevvakt-ola/nytt-repo" }, // samme eier, nytt repo
      { body: null, url: "https://github.com/elevvakt-annen/oppg" }, // ny eier
      { body: SENTINEL, url: null }, // lenken er borte
    ];
    for (const endring of endringer) {
      const gen = await bindOla();
      await medSending(
        async (s) => {
          assert.deepEqual(await sendMelding(gen), { status: "avbrutt", grunn: "endret_lenke" }, JSON.stringify(endring.url));
          assert.deepEqual(modaler(s), []);
          assert.deepEqual(puts(s), []);
          const m = sisteMelding(await panel());
          assert.equal(m.feil, true);
          assert.match(m.tekst, /GitHub/);
          assert.ok(!m.tekst.includes("elevvakt"), "lenken vises ikke");
        },
        { sc: medOla(endring), svar: trykkSend, vedPut: vedPutOk },
      );
    }
  });

  test("endret karakter siden visningen gir advarsel i modalen; «Send» sender likevel", async () => {
    const gen = await bindOla();
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen, "A", ""), { status: "sendt" });
        const [modal] = modaler(s);
        assert.match(modal.tekst, /(endret|changed)/i);
        assert.match(modal.args[1].detail, /(nå|now): B\)/);
        // D8-GUI: den ferske karakteren også øverst, samme verdi som «nå» i advarselen.
        assert.match(modal.args[1].detail, /^(Nåværende karakter|Current grade): B$/m);
        assert.equal(puts(s).length, 1);
      },
      { sc: medOla({ grade: "B", workflow_state: "graded" }), svar: trykkSend, vedPut: vedPutOk },
    );
  });

  test("dobbelt trykk på «Send» gir én PUT; det andre avvises mens det første pågår", async () => {
    const gen = await bindOla();
    let slipp;
    let modalApen;
    const apnet = new Promise((r) => (modalApen = r));
    await medSending(
      async (s) => {
        const forste = sendMelding(gen);
        await apnet;
        assert.deepEqual(await sendMelding(gen), { status: "avvist", grunn: "opptatt" });
        assert.equal(sisteMelding(await panel()).feil, true);
        slipp();
        assert.deepEqual(await forste, { status: "sendt" });
        assert.equal(puts(s).length, 1);
        assert.equal(modaler(s).length, 1);
        // To trykk samtidig (uten å vente på modalen): også bare én PUT.
        const gen2 = (await panel()).bundet;
        const [a, b] = await Promise.all([sendMelding(gen2, "C", ""), sendMelding(gen2, "C", "")]);
        assert.deepEqual([a.status, b.status].sort(), ["avvist", "sendt"]);
        assert.equal(puts(s).length, 2);
      },
      {
        svar: (navn, args) => {
          if (navn !== "showWarningMessage" || !args[1]?.modal) return undefined;
          if (slipp) return args[2];
          modalApen();
          return new Promise((r) => (slipp = () => r(args[2])));
        },
        vedPut: vedPutOk,
      },
    );
  });

  test("feil fra Canvas: melding uten token, skjemaet beholdes; nettverksfeil vaskes", async () => {
    const gen = await bindOla();
    await medSending(
      async (s) => {
        const visFor = (await panel()).sendt.filter((m) => m.type === "vis").length;
        assert.deepEqual(await sendMelding(gen), { status: "feil", steg: "send", reason: "other" });
        const p = await panel();
        const m = sisteMelding(p);
        assert.equal(m.feil, true);
        assert.match(m.tekst, /HTTP 500/);
        assert.ok(!m.tekst.includes(GYLDIG_TOKEN));
        assert.ok(!m.tekst.includes(SENTINEL));
        assert.equal(p.sendt.filter((x) => x.type === "vis").length, visFor, "skjemaet tømmes ikke ved feil");
        assert.equal(puts(s).length, 1);
      },
      { svar: trykkSend, vedPut: () => ({ status: 500, data: { errors: [{ message: SENTINEL }] } }) },
    );
    await medSending(
      async () => {
        assert.deepEqual(await sendMelding(gen), { status: "feil", steg: "send", reason: "network" });
        const m = sisteMelding(await panel());
        assert.ok(!m.tekst.includes(GYLDIG_TOKEN), "tokenet i feilmeldingen");
        assert.match(m.tekst, /\*\*\*/);
      },
      {
        svar: trykkSend,
        vedPut: () => {
          throw new TypeError(`fetch failed (${GYLDIG_TOKEN})`);
        },
      },
    );
    // Henting på nytt feiler: ingen modal, ingen PUT.
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen), { status: "feil", steg: "hent" });
        assert.deepEqual(modaler(s), []);
        assert.deepEqual(puts(s), []);
        assert.ok(s.meldinger.every((x) => !String(x.tekst).includes(GYLDIG_TOKEN)));
      },
      { svar: trykkSend, vedPut: vedPutOk, vedGet: (sti) => (sti.endsWith("/submissions") ? { status: 500 } : undefined) },
    );
  });

  test("T-A: ødelagt JSON fra Canvas (200) ved henting på nytt: ingen body i panelet, varsler eller OutputChannel", async () => {
    const gen = await bindOla();
    const odelagt = `${SENTINEL} [{"user_id":${OLA_ID},"body":"${SENTINEL}"`;
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen), { status: "feil", steg: "hent" });
        assert.deepEqual(modaler(s), []);
        assert.deepEqual(puts(s), []);
        const varsel = s.meldinger.filter((m) => m.type === "showErrorMessage");
        assert.equal(varsel.length, 1);
        assert.match(varsel[0].tekst, /\?$/);
        for (const tekst of [JSON.stringify(s.meldinger.map((m) => m.args)), JSON.stringify((await panel()).sendt), (await kjor("canvasClone._logg")).join("\n")]) {
          assert.ok(!tekst.includes(SENTINEL.slice(0, 8)), "body lekket");
          assert.ok(!tekst.includes(GYLDIG_TOKEN), "token lekket");
        }
      },
      { svar: trykkSend, vedPut: vedPutOk, vedGet: (sti) => (sti.endsWith("/submissions") ? { raa: odelagt } : undefined) },
    );
  });

  test("D6d: treet viser den nye karakteren; samme elev åpnet på nytt gir ingen falsk «karakteren er endret»", async () => {
    let gen = await bindOla();
    await medSending(
      async (s) => {
        assert.deepEqual(await sendMelding(gen, "D", ""), { status: "sendt" });
        const node = await finn(oppgaveId, "elevvakt-ola");
        assert.equal(node.id, ola.id, "samme node, ikke et nytt tre");
        assert.match(node.description, /(nåværende|current): D\)$/);
        // Samme elev på nytt fra treet, og send igjen: vanlig modal, ingen advarsel.
        gen = await bindOla();
        assert.match(sisteVis(await panel()).karakter, /\bD$/);
        assert.deepEqual(await sendMelding(gen, "E", ""), { status: "sendt" });
        const andre = modaler(s)[1];
        assert.ok(andre, "ingen andre modal");
        assert.ok(!/(endret|changed)/i.test(andre.tekst), andre.tekst);
        assert.ok(!/(nå|now): /.test(andre.args[1].detail), andre.args[1].detail);
        // D8-GUI: karakteren fra forrige sending står øverst i bekreftelsen.
        assert.match(andre.args[1].detail, /^(Nåværende karakter|Current grade): D\n/);
        assert.match((await finn(oppgaveId, "elevvakt-ola")).description, /: E\)$/);
        assert.deepEqual(s.fetch.filter((f) => f.method === "GET").map((f) => f.path.endsWith("/submissions")), [true, true], "treet hentet ikke på nytt");
      },
      { svar: trykkSend, vedPut: vedPutOk },
    );
  });

  test("D6d: byttet læreren elev under PUT, oppdateres treet likevel for eleven det ble sendt til", async () => {
    const gen = await bindOla();
    await medSending(
      async () => {
        assert.deepEqual(await sendMelding(gen, "F", ""), { status: "sendt" });
        const p = await panel();
        assert.equal(sisteVis(p).elev, "Elev-VAKT-Kari (GitHub: elevvakt-kari)", "panelet viser Kari");
        assert.match((await finn(oppgaveId, "elevvakt-ola")).description, /: F\)$/);
        assert.ok(!/\bF\)$/.test((await finn(oppgaveId, "elevvakt-kari")).description), "Kari skal ikke få Olas karakter");
        const logg = (await kjor("canvasClone._logg")).join("\n");
        for (const d of [...ELEVDATA, SENTINEL]) assert.ok(!logg.includes(d), `«${d}» i OutputChannel`);
      },
      {
        svar: trykkSend,
        vedPut: async (kall) => {
          await kjor("canvasClone.settKarakter", kari.id);
          return vedPutOk(kall);
        },
      },
    );
  });

  test("T-A-vaktpost: body-markøren aldri i postMessage, modaltekst, varsler, OutputChannel eller feilmelding", async () => {
    const p = await panel();
    assert.ok(alleMeldinger.length >= 5, "testen må faktisk se på modalene");
    assert.ok(!JSON.stringify(p.sendt).includes(SENTINEL), "body i en postMessage");
    assert.ok(!JSON.stringify(alleMeldinger.map((m) => m.args)).includes(SENTINEL), "body i en modal eller et varsel");
    const logg = (await kjor("canvasClone._logg")).join("\n");
    for (const d of [...ELEVDATA, SENTINEL]) assert.ok(!logg.includes(d), `«${d}» i OutputChannel`);
  });
});
