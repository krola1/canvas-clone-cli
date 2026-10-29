import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { whoAmI, gradeSubmission, listSubmissions } from "../src/canvas.js";

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
    assert.deepEqual(result, { ok: true, submission: { id: 1, grade: "A" } });
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
