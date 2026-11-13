// 0.4.0 G1b (plan v2 med rettelser; tilsynets O2, O8, O9): hentOppgave/apiGetEn,
// listSubmissions med { levertOgFritak: true } og gradeSubmission med `excuse`.
// tests/canvas.test.js står uendret; dette er tilleggene.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { hentOppgave, listSubmissions, gradeSubmission } from "../src/canvas.js";
import { tilOppgavetekst } from "../src/oppgavetekst.js";
import { canvasFeil } from "../vscode/src/oppsett.mjs";

const config = { canvasUrl: "https://example.instructure.com", canvasToken: "tok" };
const UNIK = "UNIKOPPGAVETEKST7731";

// `svar` er enten JSON-verdien eller en funksjon som lager hele responsen.
function medFetch(svar, fn) {
  const kall = [];
  mock.method(global, "fetch", async (url, opts) => {
    kall.push({ url: String(url), opts });
    if (typeof svar === "function") return svar();
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => svar };
  });
  return fn(kall).finally(() => mock.restoreAll());
}

const FIENDTLIG = [
  `<h2>${UNIK} Oppgave</h2>`,
  `<p>Se <a href="https://example.instructure.com/files/77/download?verifier=VERIFIERHEMMELIG">fasit</a>.</p>`,
  `<p>Ren tekst: https://example.instructure.com/courses/1/files/9?verifier=VERIFIERHEMMELIG2 og www.vg.no/x</p>`,
  `<img src="https://x.test/a.png?verifier=VERIFIERHEMMELIG3" alt="bilde">`,
  `<iframe src="https://www.youtube.com/embed/abc"></iframe>`,
  `<script>alert("SKRIPTVAKT")</script>`,
].join("");

test("G1b hentOppgave: én GET på nøyaktig /api/v1/courses/:k/assignments/:a, bare modellen ut", async () => {
  let htmlUrlLest = false;
  const raa = {
    id: 11030,
    name: "Oppgave",
    grading_type: "pass_fail",
    submission_types: ["online_url", 7, null],
    group_category_id: null,
    grade_group_students_individually: false,
    description: FIENDTLIG,
    get html_url() {
      htmlUrlLest = true;
      return "https://example.instructure.com/courses/557/assignments/11030";
    },
  };
  await medFetch(raa, async (kall) => {
    const r = await hentOppgave(config, 557, 11030);
    assert.equal(kall.length, 1);
    assert.equal(kall[0].url, "https://example.instructure.com/api/v1/courses/557/assignments/11030");
    assert.equal(kall[0].opts.headers.Authorization, "Bearer tok");
    assert.equal(kall[0].opts.method, undefined); // GET
    // 0.4.0 G5: også `gruppeoppgave` (tilsynets O5 utvidet).
    assert.deepEqual(Object.keys(r).sort(), ["gradingType", "gruppeSamlet", "gruppeoppgave", "submissionTypes", "tekst"]);
    assert.equal(r.gradingType, "pass_fail");
    assert.deepEqual(r.submissionTypes, ["online_url"]);
    assert.equal(r.gruppeSamlet, false);
    assert.equal(r.gruppeoppgave, false);
    assert.deepEqual(r.tekst, tilOppgavetekst(FIENDTLIG));
    assert.equal(r.tekst.status, "ok");
    const ut = JSON.stringify(r);
    // Positiv kontroll: den unike teksten kommer gjennom modellen ...
    assert.ok(ut.includes(UNIK), "unik tekst mangler i modellen");
    // ... men ingen URL, verifier, rå HTML eller html_url.
    for (const v of ["verifier", "VERIFIERHEMMELIG", "://", "www.", "/files/", "<a", "<p>", "href", "SKRIPTVAKT", "youtube", "html_url", "assignments/11030"]) {
      assert.ok(!ut.includes(v), `«${v}» lekket: ${ut}`);
    }
    assert.equal(htmlUrlLest, false, "html_url ble lest");
  });
  // Id-er som tall-strenger gir samme sti.
  await medFetch(raa, async (kall) => {
    await hentOppgave(config, "557", "11030");
    assert.equal(kall[0].url, "https://example.instructure.com/api/v1/courses/557/assignments/11030");
  });
});

test("G1b hentOppgave: gruppeSamlet = group_category_id != null && grade_group_students_individually !== true", async () => {
  const tilfeller = [
    [{}, false],
    [{ group_category_id: null }, false],
    [{ group_category_id: 5 }, true],
    [{ group_category_id: 5, grade_group_students_individually: false }, true],
    [{ group_category_id: 5, grade_group_students_individually: null }, true],
    [{ group_category_id: 5, grade_group_students_individually: "true" }, true],
    [{ group_category_id: 5, grade_group_students_individually: true }, false],
    [{ group_category_id: 0, grade_group_students_individually: false }, true],
    [{ group_category_id: null, grade_group_students_individually: true }, false],
  ];
  for (const [felt, forventet] of tilfeller) {
    await medFetch({ grading_type: "points", ...felt }, async () => {
      const r = await hentOppgave(config, 1, 2);
      assert.equal(r.gruppeSamlet, forventet, JSON.stringify(felt));
      // 0.4.0 G5 (O5 utvidet): gruppeoppgave = group_category_id != null, uansett vurderingsmåte.
      assert.equal(r.gruppeoppgave, felt.group_category_id != null, JSON.stringify(felt));
    });
  }
});

test("G1b hentOppgave: manglende felt gir null/[]/tom, kaster ikke", async () => {
  await medFetch({ id: 2 }, async () => {
    const r = await hentOppgave(config, 1, 2);
    assert.deepEqual(r, { gradingType: null, submissionTypes: [], gruppeSamlet: false, gruppeoppgave: false, tekst: { status: "tom" } });
  });
});

test("G1b hentOppgave: ugyldige id-er kastes før noe kall (ingen annen sti, ingen query)", async () => {
  for (const [k, a] of [["1/../2", 3], [1, "3?x=1"], [1.5, 2], [-1, 2], [1, null], [undefined, 2], [1, "abc"], [1, ""]]) {
    await medFetch({}, async (kall) => {
      await assert.rejects(() => hentOppgave(config, k, a));
      assert.equal(kall.length, 0, `kall for ${k}/${a}`);
    });
  }
});

test("G1b apiGetEn: HTTP-feil har samme format som apiGetAll, så canvasFeil gir «HTTP nnn»", async () => {
  for (const joeMode of [false, true]) {
    const cfg = { ...config, joeMode };
    await medFetch(
      () => ({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({ description: "x?verifier=V" }) }),
      async () => {
        const err = await hentOppgave(cfg, 557, 11030).then(
          () => assert.fail("skulle kastet"),
          (e) => e
        );
        const forventet = joeMode
          ? "Canvas API error (404) at https://example.instructure.com/api/v1/courses/557/assignments/11030"
          : "Canvas API-feil (404) på https://example.instructure.com/api/v1/courses/557/assignments/11030";
        assert.equal(err.message, forventet);
        assert.equal(canvasFeil(err, "tok"), "HTTP 404");
      }
    );
  }
});

test("G1b apiGetEn: ugyldig JSON (med verifier i feilen) gir fast melding, aldri err.message", async () => {
  const lekk = 'Unexpected token < in JSON at position 0: "<a href=\\"https://x/files/1?verifier=VERIFIERIJSON\\">"';
  for (const joeMode of [false, true]) {
    const cfg = { ...config, joeMode };
    await medFetch(
      () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => {
          throw new SyntaxError(lekk);
        },
      }),
      async () => {
        const err = await hentOppgave(cfg, 557, 11030).then(
          () => assert.fail("skulle kastet"),
          (e) => e
        );
        assert.equal(err.message, joeMode ? "invalid response from Canvas (HTTP 200)" : "ugyldig svar fra Canvas (HTTP 200)");
        assert.ok(!err.message.includes("verifier") && !err.message.includes("VERIFIERIJSON"));
        assert.equal(err.cause, undefined);
        assert.ok(!String(err.stack).includes("VERIFIERIJSON"));
        assert.equal(canvasFeil(err, "tok"), "?");
      }
    );
  }
  // Gyldig JSON som ikke er ett objekt regnes også som ugyldig svar.
  for (const svar of [null, [], [{ description: "x" }], "tekst", 5]) {
    await medFetch(svar, async () => {
      await assert.rejects(() => hentOppgave(config, 1, 2), { message: "ugyldig svar fra Canvas (HTTP 200)" });
    });
  }
});

test("G1b statisk: description/html_url og testkrokene i oppgavetekst.js brukes ikke fra produksjonskode", () => {
  const kode = (fil) =>
    readFileSync(new URL(fil, import.meta.url), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join("\n");
  const filer = [
    ...readdirSync(new URL("../src/", import.meta.url)).filter((f) => f !== "oppgavetekst.js").map((f) => `../src/${f}`),
    ...readdirSync(new URL("../bin/", import.meta.url)).map((f) => `../bin/${f}`),
    ...readdirSync(new URL("../vscode/src/", import.meta.url))
      .filter((f) => /\.(m?js)$/.test(f))
      .map((f) => `../vscode/src/${f}`),
  ];
  let kallFunnet = 0;
  for (const fil of filer) {
    const k = kode(fil);
    for (const krok of ["vedSikkerhetsnett", "utenSikkerhetsnett", "utenUrlFilter"]) {
      assert.ok(!k.includes(krok), `${fil} bruker testkroken ${krok}`);
    }
    for (const m of k.matchAll(/tilOppgavetekst\s*\(/g)) {
      // Argumentlisten: frem til matchende parentes; ingen komma på øverste nivå.
      let dybde = 1;
      let i = m.index + m[0].length;
      let komma = false;
      for (; i < k.length && dybde > 0; i++) {
        const c = k[i];
        if ("([{".includes(c)) dybde++;
        else if (")]}".includes(c)) dybde--;
        else if (c === "," && dybde === 1) komma = true;
      }
      assert.equal(komma, false, `${fil} kaller tilOppgavetekst med mer enn ett argument`);
      kallFunnet++;
    }
  }
  assert.equal(kallFunnet, 1, "forventet nøyaktig ett produksjonskall til tilOppgavetekst (hentOppgave)");
  const canvas = kode("../src/canvas.js");
  assert.ok(!canvas.includes("html_url"), "html_url leses i canvas.js");
  assert.deepEqual(canvas.match(/description/g), ["description"], "description brukes mer enn ett sted i canvas.js");
  assert.match(canvas, /tilOppgavetekst\(a\.description\)/);
});

// ---- listSubmissions { levertOgFritak: true } ----

const raaSub = (over = {}) => ({ user_id: 42, user: { name: "Ola" }, workflow_state: "submitted", url: "https://github.com/ola/x", grade: null, score: null, ...over });
const FOR = { studentName: "Ola", workflowState: "submitted", repo: "ola/x", owner: "ola", userId: 42, currentGrade: null, currentScore: null };
const URL_SUBS = "https://example.instructure.com/api/v1/courses/557/assignments/11030/submissions?include[]=user&per_page=100";

test("G1b listSubmissions uten levertOgFritak: byte-lik retur og samme URL, også for andre verdier enn true", async () => {
  const raa = [raaSub({ submitted_at: "2026-11-01T10:00:00Z", excused: true })];
  for (const valg of [undefined, {}, { levertOgFritak: false }, { levertOgFritak: "true" }, { levertOgFritak: 1 }]) {
    await medFetch(raa, async (kall) => {
      const subs = await listSubmissions(config, 557, 11030, valg);
      assert.equal(kall[0].url, URL_SUBS);
      assert.deepEqual(subs, [FOR]);
      assert.equal(JSON.stringify(subs), JSON.stringify([FOR]));
    });
  }
});

test("G1b listSubmissions { levertOgFritak: true }: submittedAt (?? null) og excused (=== true), URL uendret", async () => {
  const raa = [
    raaSub({ submitted_at: "2026-11-01T10:00:00Z", excused: false }),
    raaSub({ user_id: 43, submitted_at: null, excused: true }),
    raaSub({ user_id: 44 }),
    raaSub({ user_id: 45, excused: "true" }),
  ];
  await medFetch(raa, async (kall) => {
    const subs = await listSubmissions(config, 557, 11030, { levertOgFritak: true });
    assert.equal(kall[0].url, URL_SUBS);
    assert.deepEqual(
      subs.map((s) => [s.userId, s.submittedAt, s.excused]),
      [
        [42, "2026-11-01T10:00:00Z", false],
        [43, null, true],
        [44, null, false],
        [45, null, false],
      ]
    );
    assert.deepEqual({ ...subs[0], submittedAt: undefined, excused: undefined }, { ...FOR, submittedAt: undefined, excused: undefined });
  });
  // Sammen med kommentarer: begge tilleggene, og kommentar-URL-en som i 0.3.0.
  await medFetch([raaSub({ submitted_at: null, submission_comments: [] })], async (kall) => {
    const [s] = await listSubmissions(config, 557, 11030, { levertOgFritak: true, kommentarer: true });
    assert.equal(kall[0].url, `${URL_SUBS}&include[]=submission_comments`);
    assert.deepEqual(Object.keys(s).sort(), [...Object.keys(FOR), "excused", "kommentarer", "submittedAt"].sort());
  });
});

// ---- gradeSubmission med excuse ----

async function putBody(args, svar = { id: 1 }) {
  let body;
  await medFetch(svar, async (kall) => {
    await gradeSubmission(config, 557, 11030, 42, args);
    assert.equal(kall.length, 1);
    assert.equal(kall[0].opts.method, "PUT");
    body = kall[0].opts.body;
  });
  return body;
}

test("G1b gradeSubmission: PUT-body nøyaktig per variant", async () => {
  const K = "submission%5Bposted_grade%5D";
  const E = "submission%5Bexcuse%5D";
  const C = "comment%5Btext_comment%5D";
  // excuse utelatt / undefined: byte-lik med 0.3.0.
  assert.equal(await putBody({ grade: "A", comment: "Bra" }), `${K}=A&${C}=Bra`);
  assert.equal(await putBody({ grade: "A", comment: "Bra", excuse: undefined }), `${K}=A&${C}=Bra`);
  assert.equal(await putBody({ comment: "Hei" }), `${C}=Hei`);
  assert.equal(await putBody({ comment: "Hei", excuse: undefined }), `${C}=Hei`);
  assert.equal(await putBody({ grade: "complete" }), `${K}=complete`);
  // excuse:true -> bare excuse (+ kommentar).
  assert.equal(await putBody({ excuse: true }), `${E}=true`);
  assert.equal(await putBody({ excuse: true, comment: "Fritatt" }), `${E}=true&${C}=Fritatt`);
  assert.equal(await putBody({ excuse: true, grade: "", comment: "" }), `${E}=true`);
  assert.equal(await putBody({ excuse: true, grade: null }), `${E}=true`);
  // excuse:false -> bare sammen med karakter.
  assert.equal(await putBody({ grade: "complete", excuse: false }), `${K}=complete&${E}=false`);
  assert.equal(await putBody({ grade: "incomplete", excuse: false, comment: "Nei" }), `${K}=incomplete&${E}=false&${C}=Nei`);
  assert.equal(await putBody({ grade: 0, excuse: false }), `${K}=0&${E}=false`);
});

test("G1b gradeSubmission: ulovlige kombinasjoner kastes før noe kall (rettelse 1)", async () => {
  const ulovlige = [
    { grade: "A", excuse: true },
    { grade: "complete", excuse: true, comment: "x" },
    { grade: 0, excuse: true },
    { excuse: false },
    { excuse: false, comment: "Bare kommentar" },
    { excuse: false, grade: "" },
    { excuse: false, grade: null },
    { excuse: "true" },
    { excuse: null },
    { excuse: 1, grade: "A" },
    { excuse: "false", grade: "A" },
  ];
  for (const args of ulovlige) {
    await medFetch({}, async (kall) => {
      await assert.rejects(() => gradeSubmission(config, 557, 11030, 42, args), undefined, JSON.stringify(args));
      assert.equal(kall.length, 0, JSON.stringify(args));
    });
  }
});

test("G1b gradeSubmission: svaret får excused bare når excuse ble sendt (og feltet finnes)", async () => {
  const svar = { id: 1, user_id: 42, grade: null, workflow_state: "graded", excused: true, body: "BODY-VAKT" };
  const sendt = async (args, s = svar) => {
    let r;
    await medFetch(s, async () => {
      r = await gradeSubmission(config, 557, 11030, 42, args);
    });
    return r;
  };
  let r = await sendt({ comment: "Hei" });
  assert.deepEqual(Object.keys(r.submission).sort(), ["grade", "kommentarer", "workflow_state"]);
  r = await sendt({ grade: "A" });
  assert.ok(!Object.hasOwn(r.submission, "excused"));
  r = await sendt({ excuse: true });
  assert.deepEqual(r, { ok: true, submission: { grade: null, workflow_state: "graded", excused: true, kommentarer: null } });
  r = await sendt({ grade: "complete", excuse: false }, { ...svar, grade: "complete", excused: false });
  assert.equal(r.submission.excused, false);
  r = await sendt({ excuse: true }, { ...svar, excused: "true" });
  assert.equal(r.submission.excused, false);
  const { excused, ...utenFelt } = svar;
  r = await sendt({ excuse: true }, utenFelt);
  assert.ok(!Object.hasOwn(r.submission, "excused"));
  assert.ok(!JSON.stringify(r).includes("BODY-VAKT"));
});
