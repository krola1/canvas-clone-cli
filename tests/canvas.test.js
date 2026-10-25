import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { whoAmI } from "../src/canvas.js";

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
