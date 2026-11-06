import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { whoAmI, gradeSubmission, listSubmissions, tilKommentarer } from "../src/canvas.js";

const config = { canvasUrl: "https://example.instructure.com", canvasToken: "tok" };

test("whoAmI: returnerer {ok:true, user} ved gyldig token", async () => {
  mock.method(global, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 1, name: "Lars" }),
  }));
  try {
    const result = await whoAmI(config);
    assert.deepEqual(result, { ok: true, user: { id: 1, name: "Lars" } });
  } finally {
    mock.restoreAll();
  }
});

test("whoAmI: skiller ugyldig token (401) fra andre feil", async () => {
  mock.method(global, "fetch", async () => ({
    ok: false,
    status: 401,
    json: async () => ({}),
  }));
  try {
    const result = await whoAmI(config);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_token");
  } finally {
    mock.restoreAll();
  }
});

test("whoAmI: 403 regnes også som invalid_token", async () => {
  mock.method(global, "fetch", async () => ({
    ok: false,
    status: 403,
    json: async () => ({}),
  }));
  try {
    const result = await whoAmI(config);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_token");
  } finally {
    mock.restoreAll();
  }
});

test("whoAmI: skiller nettverksfeil (fetch kaster) fra ugyldig token", async () => {
  mock.method(global, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  try {
    const result = await whoAmI(config);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "network");
    assert.match(result.detail, /fetch failed/);
  } finally {
    mock.restoreAll();
  }
});

test("whoAmI: annen/uventet feil (f.eks. helt feil URL som svarer 404/500) klassifiseres som 'other'", async () => {
  mock.method(global, "fetch", async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  }));
  try {
    const result = await whoAmI(config);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "other");
  } finally {
    mock.restoreAll();
  }
});

test("gradeSubmission: sender PUT med nøstede form-params (submission[posted_grade], comment[text_comment])", async () => {
  let capturedUrl, capturedOptions;
  mock.method(global, "fetch", async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 1, grade: "A" }),
    };
  });
  try {
    const result = await gradeSubmission(config, 557, 11030, 42, { grade: "A", comment: "Bra jobbet!" });
    // 0.3.0 (K2): bare grade, workflow_state og kommentarer forlater canvas.js.
    assert.deepEqual(result, { ok: true, submission: { grade: "A", kommentarer: null } });
    assert.equal(capturedUrl, "https://example.instructure.com/api/v1/courses/557/assignments/11030/submissions/42");
    assert.equal(capturedOptions.method, "PUT");
    assert.equal(capturedOptions.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(capturedOptions.headers.Authorization, "Bearer tok");
    const params = new URLSearchParams(capturedOptions.body);
    assert.equal(params.get("submission[posted_grade]"), "A");
    assert.equal(params.get("comment[text_comment]"), "Bra jobbet!");
  } finally {
    mock.restoreAll();
  }
});

test("gradeSubmission: uten kommentar sender ikke comment[text_comment]", async () => {
  let capturedOptions;
  mock.method(global, "fetch", async (url, options) => {
    capturedOptions = options;
    return { ok: true, status: 200, json: async () => ({ id: 1 }) };
  });
  try {
    await gradeSubmission(config, 557, 11030, 42, { grade: "B", comment: "" });
    const params = new URLSearchParams(capturedOptions.body);
    assert.equal(params.get("submission[posted_grade]"), "B");
    assert.equal(params.has("comment[text_comment]"), false);
  } finally {
    mock.restoreAll();
  }
});

test("gradeSubmission: skiller ugyldig token (401) fra andre feil", async () => {
  mock.method(global, "fetch", async () => ({
    ok: false,
    status: 401,
    json: async () => ({}),
  }));
  try {
    const result = await gradeSubmission(config, 557, 11030, 42, { grade: "A" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_token");
  } finally {
    mock.restoreAll();
  }
});

test("gradeSubmission: skiller nettverksfeil (fetch kaster) fra andre feil", async () => {
  mock.method(global, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  try {
    const result = await gradeSubmission(config, 557, 11030, 42, { grade: "A" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "network");
    assert.match(result.detail, /fetch failed/);
  } finally {
    mock.restoreAll();
  }
});

test("gradeSubmission: annen/uventet feil (f.eks. 422 fra Canvas) klassifiseres som 'other'", async () => {
  mock.method(global, "fetch", async () => ({
    ok: false,
    status: 422,
    json: async () => ({}),
  }));
  try {
    const result = await gradeSubmission(config, 557, 11030, 42, { grade: "A" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "other");
  } finally {
    mock.restoreAll();
  }
});

test("listSubmissions: Link til annen vert -> feil med bare vertsnavnet, fremmed URL kalles aldri", async () => {
  const called = [];
  mock.method(global, "fetch", async (url) => {
    called.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: { get: () => '<https://ond.example.net/api/v1/neste?token=hemmelig>; rel="next"' },
      json: async () => [],
    };
  });
  try {
    await assert.rejects(listSubmissions(config, 1, 2), (err) => {
      assert.match(err.message, /ond\.example\.net/);
      assert.doesNotMatch(err.message, /neste|hemmelig|https:/);
      return true;
    });
    assert.equal(called.length, 1);
    assert.ok(called.every((u) => u.startsWith("https://example.instructure.com/")));
  } finally {
    mock.restoreAll();
  }
});

test("listSubmissions: følger Link på samme origin, og returnerer repo/eier uten url/body", async () => {
  const pages = {
    first: { link: '<https://example.instructure.com/api/v1/side2>; rel="next"', data: [{ user_id: 1, user: { name: "Ola" }, workflow_state: "submitted", body: "SENTINEL https://github.com/ola/x" }] },
    second: { link: null, data: [{ user_id: 2, user: { name: "Kari" }, workflow_state: "submitted", url: "https://kari.github.io/side" }] },
  };
  mock.method(global, "fetch", async (url) => {
    const page = String(url).includes("side2") ? pages.second : pages.first;
    return { ok: true, status: 200, headers: { get: () => page.link }, json: async () => page.data };
  });
  try {
    const subs = await listSubmissions(config, 1, 2);
    assert.deepEqual(
      subs.map((s) => [s.studentName, s.repo, s.owner]),
      [
        ["Ola", "ola/x", "ola"],
        ["Kari", "kari/side", "kari"],
      ]
    );
    assert.doesNotMatch(JSON.stringify(subs), /SENTINEL/);
  } finally {
    mock.restoreAll();
  }
});

// --- 0.3.0: kommentartråden (tilsynets K2) ------------------------------------

const VAKTPOSTER = ["VERIFIER-VAKT", "UUID-VAKT", "THUMB-VAKT", "PREVIEW-VAKT", "AVATAR-VAKT", "HTMLURL-VAKT", "MEDIAURL-VAKT", "PRONOMEN-VAKT", "ATTID-VAKT", "BODY-VAKT"];
const raaKommentar = (over = {}) => ({
  id: 11,
  author_id: 42,
  author_name: "Ola Elev",
  author: { id: 42, display_name: "Ola", avatar_image_url: "https://c/AVATAR-VAKT", html_url: "https://c/HTMLURL-VAKT", pronouns: "PRONOMEN-VAKT" },
  comment: "KOMMENTAR-VAKTPOST",
  created_at: "2026-11-05T10:00:00Z",
  edited_at: null,
  attempt: 1,
  attachments: [
    {
      id: "ATTID-VAKT",
      display_name: "rapport.pdf",
      filename: "rapport-intern.pdf",
      "content-type": "application/pdf",
      url: "https://c/files/1/download?verifier=VERIFIER-VAKT",
      uuid: "UUID-VAKT",
      thumbnail_url: "https://c/THUMB-VAKT",
      preview_url: "https://c/PREVIEW-VAKT",
    },
  ],
  media_comment: { "content-type": "video/mp4", display_name: "v", media_id: "m", media_type: "video", url: "https://c/MEDIAURL-VAKT" },
  ...over,
});

function medFetch(svar, fn) {
  const kall = [];
  mock.method(global, "fetch", async (url, opts) => {
    kall.push({ url: String(url), opts });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => svar };
  });
  return fn(kall).finally(() => mock.restoreAll());
}

test("0.3.0 listSubmissions uten valg: samme URL og retur som før (CLI og T17), aldri include for kommentarer", async () => {
  await medFetch([{ user_id: 42, user: { name: "Ola" }, workflow_state: "submitted", url: "https://github.com/ola/x", submission_comments: [raaKommentar()] }], async (kall) => {
    const subs = await listSubmissions(config, 557, 11030);
    assert.equal(kall[0].url, "https://example.instructure.com/api/v1/courses/557/assignments/11030/submissions?include[]=user&per_page=100");
    assert.deepEqual(subs, [{ studentName: "Ola", workflowState: "submitted", repo: "ola/x", owner: "ola", userId: 42, currentGrade: null, currentScore: null }]);
    for (const valg of [{}, { kommentarer: false }, { kommentarer: "true" }, { kommentarer: 1 }]) {
      await listSubmissions(config, 557, 11030, valg);
    }
    assert.ok(kall.every((k) => !k.url.includes("submission_comments")), JSON.stringify(kall.map((k) => k.url)));
  });
});

test("0.3.0 listSubmissions med { kommentarer: true }: include[]=submission_comments og hvitelistet tråd per innlevering", async () => {
  await medFetch([{ user_id: 42, user: { name: "Ola" }, workflow_state: "unsubmitted", body: "BODY-VAKT", submission_comments: [raaKommentar()] }], async (kall) => {
    const [s] = await listSubmissions(config, 557, 11030, { kommentarer: true });
    assert.equal(kall[0].url, "https://example.instructure.com/api/v1/courses/557/assignments/11030/submissions?include[]=user&per_page=100&include[]=submission_comments");
    assert.deepEqual(s.kommentarer, [
      {
        id: 11,
        fraEleven: true,
        forfatternavn: "Ola Elev",
        tekst: "KOMMENTAR-VAKTPOST",
        tid: "2026-11-05T10:00:00Z",
        forsok: 1,
        vedlegg: [{ filnavn: "rapport.pdf", type: "application/pdf" }],
        media: { type: "video" },
      },
    ]);
    const json = JSON.stringify(s);
    for (const v of VAKTPOSTER) assert.ok(!json.includes(v), `«${v}» lekket`);
  });
});

test("0.3.0 tilKommentarer: kaster aldri; ikke-liste gir null, søppel hoppes over; fraEleven bare for eleven selv; sortert på tid, så id", () => {
  for (const raw of [undefined, null, "x", 5, {}, { length: 1 }]) assert.equal(tilKommentarer(raw, 42), null);
  assert.deepEqual(tilKommentarer([], 42), []);
  const sopp = tilKommentarer([null, 5, "x", [], { comment: 7, author_name: {}, attachments: "x", media_comment: "x", attempt: "2", id: "9" }], 42);
  assert.deepEqual(sopp, [{ id: null, fraEleven: false, forfatternavn: "", tekst: "", tid: null, forsok: null, vedlegg: [], media: null }]);
  // En getter som kaster: fortsatt ingen exception.
  const ond = [{ get comment() { throw new Error("ond"); } }];
  assert.equal(tilKommentarer(ond, 42), null);
  const liste = tilKommentarer(
    [
      raaKommentar({ id: 3, created_at: "2026-11-05T12:00:00Z", author_id: 7, author_name: "Lærer" }),
      raaKommentar({ id: 2, created_at: "2026-11-05T11:00:00Z" }),
      raaKommentar({ id: 1, created_at: "2026-11-05T11:00:00Z", author_id: null, author_name: "Anonymous User" }),
      raaKommentar({ id: 4, created_at: null }),
    ],
    42,
  );
  assert.deepEqual(liste.map((k) => [k.id, k.fraEleven]), [[1, false], [2, true], [3, false], [4, true]]);
  // Uten elev-id: ingen er fra eleven (anonym author_id null treffer heller ikke).
  assert.ok(tilKommentarer([raaKommentar({ author_id: null })], null).every((k) => k.fraEleven === false));
  assert.deepEqual(tilKommentarer([raaKommentar({ media_comment: { media_type: "x" } })], 42)[0].media, { type: "annet" });
});

test("0.3.0 gradeSubmission: svaret snevres inn (grade bare når feltet finnes, workflow_state, tråd); PUT med ugyldig tråd er fortsatt ok:true", async () => {
  const svar = { id: 1, user_id: 42, grade: null, workflow_state: "graded", body: "BODY-VAKT", url: "https://x?verifier=VERIFIER-VAKT", submission_comments: [raaKommentar()] };
  await medFetch(svar, async () => {
    const r = await gradeSubmission(config, 557, 11030, 42, { comment: "Hei" });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.submission).sort(), ["grade", "kommentarer", "workflow_state"]);
    assert.equal(r.submission.grade, null);
    assert.equal(r.submission.kommentarer[0].fraEleven, true);
    for (const v of VAKTPOSTER) assert.ok(!JSON.stringify(r).includes(v), `«${v}» lekket`);
  });
  const ugyldige = [{ submission_comments: "søppel" }, { submission_comments: [{ get comment() { throw new Error("x"); } }] }, [], "tekst", null];
  for (const [i, ugyldig] of ugyldige.entries()) {
    await medFetch(ugyldig, async () => {
      const r = await gradeSubmission(config, 557, 11030, 42, { comment: "Hei" });
      assert.equal(r.ok, true, `ugyldig svar nr. ${i}`);
      assert.equal(r.submission.kommentarer, null);
      assert.ok(!Object.hasOwn(r.submission, "grade"));
    });
  }
  // Bare tekst: bare comment[text_comment] i PUT-en, ingen karakter eller forsøk.
  await medFetch({}, async (kall) => {
    await gradeSubmission(config, 557, 11030, 42, { comment: "Hei" });
    assert.deepEqual([...new URLSearchParams(kall[0].opts.body).keys()], ["comment[text_comment]"]);
  });
});
