// T-A for feil fra Canvas i VS Code-utvidelsen (D6d): `canvasFeil` og `tryggDetalj`
// i vscode/src/oppsett.mjs viser bare «HTTP nnn» eller en nettverksfeil (tokenet
// vasket bort). En JSON-feil fra res.json() kan sitere svaret fra Canvas, og det
// kan inneholde innleveringens body. Ren logikk, ingen VS Code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { listSubmissions } from "../src/canvas.js";
import { canvasFeil, tryggDetalj } from "../vscode/src/oppsett.mjs";

const SENTINEL = "BODY-VAKTPOST-d6d-8e41c7";
const TOKEN = "hemmelig-token-d6d";
const config = { canvasUrl: "https://canvas.test.invalid", canvasToken: TOKEN };

async function feilFra(svar) {
  const original = globalThis.fetch;
  globalThis.fetch = svar;
  try {
    await listSubmissions(config, 7, 70);
  } catch (err) {
    return err;
  } finally {
    globalThis.fetch = original;
  }
  assert.fail("listSubmissions skulle ha feilet");
}

test("canvasFeil: 200 med ødelagt JSON gir «?», selv om V8 siterer svaret i feilmeldingen", async () => {
  const err = await feilFra(
    async () => new Response(`${SENTINEL} [{"body": "${SENTINEL}"`, { status: 200, headers: { "content-type": "application/json" } })
  );
  assert.equal(err.name, "SyntaxError");
  // Vis at risikoen er ekte: feilmeldingen fra res.json() siterer svaret.
  assert.ok(err.message.includes(SENTINEL.slice(0, 8)), err.message);
  assert.equal(canvasFeil(err, TOKEN), "?");
});

test("canvasFeil: HTTP-feil gir bare «HTTP nnn», uten URL; nettverksfeil vaskes", async () => {
  const http = await feilFra(async () => new Response(SENTINEL, { status: 503 }));
  assert.match(http.message, /canvas\.test\.invalid/);
  assert.equal(canvasFeil(http, TOKEN), "HTTP 503");
  const nett = await feilFra(async () => {
    throw new TypeError(`fetch failed ${TOKEN}`);
  });
  assert.equal(canvasFeil(nett, TOKEN), "fetch failed ***");
  // Engelsk variant av kjernens HTTP-feil, og alt ukjent.
  assert.equal(canvasFeil(new Error("Canvas API error (404) at https://x/y"), TOKEN), "HTTP 404");
  assert.equal(canvasFeil(new Error(`Noe annet ${SENTINEL}`), TOKEN), "?");
  assert.equal(canvasFeil(undefined, TOKEN), "?");
});

test("tryggDetalj: bare «HTTP nnn» eller vasket nettverksfeil, ellers «?»", () => {
  assert.equal(tryggDetalj({ reason: "other", detail: "HTTP 500" }, TOKEN), "HTTP 500");
  assert.equal(tryggDetalj({ reason: "network", detail: `fetch failed ${TOKEN}` }, TOKEN), "fetch failed ***");
  assert.equal(tryggDetalj({ reason: "other", detail: `Unexpected token 'B', "${SENTINEL}" is not valid JSON` }, TOKEN), "?");
  assert.equal(tryggDetalj({ reason: "network", detail: "" }, TOKEN), "?");
  assert.equal(tryggDetalj(undefined, TOKEN), "?");
});
