// Ren logikk for oppsettet i VS Code-utvidelsen (vscode/src/oppsett.mjs, D3).
// Ingen VS Code og ingen nettverk: lageret er falske objekter med samme form
// som context.globalState/context.secrets, og whoAmI byttes ut via `sjekk`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  erNorsk,
  normaliserUrl,
  utenToken,
  feilmelding,
  sjekkOgLagre,
  slett,
  tokenTilstand,
  hentPalogging,
  NOKKEL_URL,
  NOKKEL_TOKEN_LAGRET,
  HEMMELIG_TOKEN,
} from "../vscode/src/oppsett.mjs";
import { createStrings } from "../src/strings.js";

function falskLager() {
  const state = new Map();
  const hemmelig = new Map();
  return {
    state,
    hemmelig,
    globalState: {
      get: (k) => state.get(k),
      update: async (k, v) => (v === undefined ? state.delete(k) : state.set(k, v)),
    },
    secrets: {
      get: async (k) => hemmelig.get(k),
      store: async (k, v) => hemmelig.set(k, v),
      delete: async (k) => hemmelig.delete(k),
    },
  };
}

const TOKEN = "falskt-token-123";

test("erNorsk: nb/nn/no gir norsk, alt annet engelsk", () => {
  for (const l of ["nb", "nn", "no", "nb-NO", "NB"]) assert.equal(erNorsk(l), true, l);
  for (const l of ["en", "en-us", "de", "nbx", "", undefined]) assert.equal(erNorsk(l), false, String(l));
});

test("normaliserUrl: bare https, skråstrek fjernes", () => {
  assert.equal(normaliserUrl(" https://skole.instructure.com/ "), "https://skole.instructure.com");
  assert.equal(normaliserUrl("https://skole.instructure.com//"), "https://skole.instructure.com");
  assert.equal(normaliserUrl("http://skole.instructure.com"), null);
  assert.equal(normaliserUrl("https://"), null);
  assert.equal(normaliserUrl("skole.instructure.com"), null);
  assert.equal(normaliserUrl(undefined), null);
});

test("sjekkOgLagre: gyldig token lagres - token i secrets, URL og flagg i globalState", async () => {
  const l = falskLager();
  const kall = [];
  const res = await sjekkOgLagre({
    canvasUrl: "https://canvas.test.invalid/",
    canvasToken: TOKEN,
    ...l,
    sjekk: async (cfg) => (kall.push(cfg), { ok: true, user: { name: "Test Lærer" } }),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(kall, [{ canvasUrl: "https://canvas.test.invalid", canvasToken: TOKEN }]);
  assert.equal(l.hemmelig.get(HEMMELIG_TOKEN), TOKEN);
  assert.equal(l.state.get(NOKKEL_URL), "https://canvas.test.invalid");
  assert.equal(l.state.get(NOKKEL_TOKEN_LAGRET), true);
  // Tokenet ligger aldri i globalState.
  assert.ok(![...l.state.values()].includes(TOKEN));
});

test("sjekkOgLagre: ved feil lagres ingenting", async () => {
  for (const reason of ["network", "invalid_token", "other"]) {
    const l = falskLager();
    const res = await sjekkOgLagre({
      canvasUrl: "https://canvas.test.invalid",
      canvasToken: TOKEN,
      ...l,
      sjekk: async () => ({ ok: false, reason, detail: "x" }),
    });
    assert.equal(res.reason, reason);
    assert.equal(l.state.size, 0, reason);
    assert.equal(l.hemmelig.size, 0, reason);
  }
});

test("sjekkOgLagre: http-URL eller tomt token sjekkes ikke mot Canvas", async () => {
  const l = falskLager();
  let kalt = false;
  const sjekk = async () => ((kalt = true), { ok: true, user: {} });
  assert.equal((await sjekkOgLagre({ canvasUrl: "http://x.invalid", canvasToken: TOKEN, ...l, sjekk })).reason, "invalid_url");
  assert.equal((await sjekkOgLagre({ canvasUrl: "https://x.invalid", canvasToken: "", ...l, sjekk })).reason, "empty_token");
  assert.equal(kalt, false);
  assert.equal(l.state.size + l.hemmelig.size, 0);
});

test("sjekkOgLagre: feiler SecretStorage, endres ikke URL eller flagg", async () => {
  const l = falskLager();
  l.secrets.store = async () => {
    throw new Error("lagring feilet");
  };
  await assert.rejects(
    sjekkOgLagre({ canvasUrl: "https://canvas.test.invalid", canvasToken: TOKEN, ...l, sjekk: async () => ({ ok: true, user: {} }) }),
  );
  assert.equal(l.state.size, 0);
});

test("tokenTilstand og slett: ok, forsvant (keyring mangler), ikke_satt_opp", async () => {
  const l = falskLager();
  assert.equal(await tokenTilstand(l), "ikke_satt_opp");
  await sjekkOgLagre({ canvasUrl: "https://canvas.test.invalid", canvasToken: TOKEN, ...l, sjekk: async () => ({ ok: true, user: {} }) });
  assert.equal(await tokenTilstand(l), "ok");
  assert.deepEqual(await hentPalogging(l), { canvasUrl: "https://canvas.test.invalid", canvasToken: TOKEN });

  // Som etter omstart uten keyring: SecretStorage var i minnet, globalState er på disk.
  l.hemmelig.clear();
  assert.equal(await tokenTilstand(l), "forsvant");
  assert.deepEqual(await hentPalogging(l), { mangler: "forsvant" });

  await slett(l);
  assert.equal(await tokenTilstand(l), "ikke_satt_opp");
  assert.equal(l.state.size + l.hemmelig.size, 0);
});

test("feilmelding: gjenbruker CLI-tekstene og viser aldri tokenet", () => {
  for (const joe of [false, true]) {
    const t = createStrings(joe);
    assert.equal(feilmelding({ reason: "invalid_token", detail: "HTTP 401" }, t, TOKEN), t.tokenInvalid());
    const nett = feilmelding({ reason: "network", detail: `feil med ${TOKEN}` }, t, TOKEN);
    assert.ok(!nett.includes(TOKEN));
    assert.ok(nett.includes("***"));
    const annet = feilmelding({ reason: "other", detail: "HTTP 500" }, t, TOKEN);
    assert.equal(annet, t.tokenCheckOtherError("HTTP 500"));
  }
  assert.equal(utenToken("abc", ""), "abc");
});
