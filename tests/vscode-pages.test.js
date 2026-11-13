// Ren logikk for lenken til elevens GitHub Pages i VS Code-utvidelsen
// (vscode/src/pages.mjs, 0.2.0), Pages-meldingene i panelet (vscode/src/panel.mjs,
// panel-html.mjs) og statiske sjekker av tilsynets P2–P5 i kildekoden.
// Falsk fetch og falsk klokke: ingen nettverk, ingen VS Code, ingen filer utenom
// lesing av kildekoden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStrings } from "../src/strings.js";
import {
  API_BASE,
  USER_AGENT,
  SPERRE_UTEN_RESET_MS,
  STATUS,
  pagesMal,
  pagesTekst,
  erGyldigPagesUri,
  lenkeFor,
  lagPagesSjekk,
} from "../vscode/src/pages.mjs";
import { MELDINGSFELT, lagPanel, validerMelding, pagesModell } from "../vscode/src/panel.mjs";

const t = createStrings(false);
const en = createStrings(true);
const ROT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VSRC = path.join(ROT, "vscode", "src");

// Falsk GitHub: `svar(url, opts)` gir { status, data, headers } (eller kaster).
// Alle kall logges. `vent` lar testen holde svarene tilbake.
function falskFetch(svar = () => ({ status: 200, data: { has_pages: true } })) {
  const kall = [];
  let aktive = 0;
  let maks = 0;
  const fetch = async (url, opts = {}) => {
    kall.push({ url: String(url), opts });
    aktive++;
    maks = Math.max(maks, aktive);
    try {
      const r = await svar(String(url), opts);
      return new Response(r.data === undefined ? null : JSON.stringify(r.data), { status: r.status ?? 200, headers: r.headers ?? {} });
    } finally {
      aktive--;
    }
  };
  return { fetch, kall, maks: () => maks };
}

function klokke(start = 1_800_000_000_000) {
  let n = start;
  return { naa: () => n, frem: (ms) => (n += ms) };
}

const utsatt = () => {
  let slipp;
  const p = new Promise((r) => (slipp = r));
  return { p, slipp };
};

// --- URL-mal og validering (P2) -------------------------------------------------

test("pagesMal: prosjektside /<repo>/ med repo-navnet slik det står, vert med små bokstaver; brukerside gir /", () => {
  assert.deepEqual(pagesMal("Ola-N", "Oppg.1"), { authority: "ola-n.github.io", path: "/Oppg.1/" });
  assert.deepEqual(pagesMal("ola", "ola.github.io"), { authority: "ola.github.io", path: "/" });
  assert.deepEqual(pagesMal("Ola", "OLA.github.io"), { authority: "ola.github.io", path: "/" });
  assert.equal(pagesTekst(pagesMal("ola", "oppg")), "https://ola.github.io/oppg/");
  assert.equal(pagesTekst(pagesMal("ola", "ola.github.io")), "https://ola.github.io/");
  assert.equal(pagesTekst(null), null);
});

test("pagesMal: ugyldig eier eller repo gir null (ingen URL av noe annet enn gyldig eier/repo)", () => {
  for (const [o, r] of [
    ["", "x"],
    ["-ola", "x"],
    ["ola-", "x"],
    ["o".repeat(40), "x"],
    ["ola@ond", "x"],
    ["ola.ond", "x"],
    ["ola:443", "x"],
    ["ola", ".."],
    ["ola", "."],
    ["ola", "%2e%2e"],
    ["ola", "a/b"],
    ["ola", "a?b"],
    ["ola", "a#b"],
    ["ola", "-x"],
    [null, "x"],
    ["ola", undefined],
  ]) {
    assert.equal(pagesMal(o, r), null, `${o}/${r}`);
  }
});

test("erGyldigPagesUri: godtar bare https://<eier>.github.io/ og /<repo>/, som Uri-objekt og som tekst", () => {
  const uri = (authority, p = "/", ekstra = {}) => ({ scheme: "https", authority, path: p, query: "", fragment: "", ...ekstra });
  assert.equal(erGyldigPagesUri(uri("ola.github.io")), true);
  assert.equal(erGyldigPagesUri(uri("ola.github.io", "/Oppg.1/")), true);
  assert.equal(erGyldigPagesUri("https://ola.github.io/"), true);
  assert.equal(erGyldigPagesUri("https://ola.github.io/pdf.js/"), true);

  const ugyldige = [
    uri("ola.github.io", "/", { scheme: "http" }),
    uri("ola.github.io", "/", { query: "a=1" }),
    uri("ola.github.io", "/", { fragment: "x" }),
    uri("x@ola.github.io"),
    uri("ola.github.io:8443"),
    uri("x.ola.github.io"),
    uri("ola.github.io.ond.example"),
    uri("OLA.github.io"),
    uri("ola.github.io", "/../"),
    uri("ola.github.io", "/%2e%2e/"),
    uri("ola.github.io", "/a/b/"),
    uri("ola.github.io", "/a"),
    uri("ola.github.io", ""),
    uri("github.io"),
    uri("-ola.github.io"),
    "http://ola.github.io/",
    "https://x@ola.github.io/",
    "https://x:y@ola.github.io/",
    "https://ola.github.io:8443/",
    "https://ola.github.io:443/",
    "https://x.ola.github.io/",
    "https://ola.github.io.ond.example/",
    "https://OLA.github.io/",
    "https://ola.github.io/?a=1",
    "https://ola.github.io/#x",
    "https://ola.github.io/%2e%2e/",
    "https://ola.github.io/../",
    "https://ola.github.io/a/b/",
    "javascript:alert(1)",
    "ikke en url",
    null,
    42,
  ];
  for (const u of ugyldige) assert.equal(erGyldigPagesUri(u), false, JSON.stringify(u));
});

test("lenkeFor: bekreftet, ikke sjekket (ukjent/feil/ikke sjekket ennå) og ingen lenke", () => {
  const sub = { repo: "ola/oppg", owner: "ola" };
  const mal = { authority: "ola.github.io", path: "/oppg/" };
  assert.deepEqual(lenkeFor(sub, STATUS.bekreftet), { tilstand: "bekreftet", mal });
  assert.deepEqual(lenkeFor(sub, STATUS.ikkeSjekket), { tilstand: "ikke_sjekket", mal });
  assert.deepEqual(lenkeFor(sub, undefined), { tilstand: "ikke_sjekket", mal });
  assert.equal(lenkeFor(sub, STATUS.ingen), null);
  assert.equal(lenkeFor({ repo: null }, STATUS.bekreftet), null);
  assert.equal(lenkeFor({ repo: "ola" }, STATUS.bekreftet), null);
  assert.equal(lenkeFor({ repo: "ola/oppg/x" }, STATUS.bekreftet), null);
  assert.equal(lenkeFor({ repo: "ola/.." }, STATUS.bekreftet), null);
  assert.equal(lenkeFor(null, STATUS.bekreftet), null);
  assert.deepEqual(lenkeFor({ repo: "ola/ola.github.io" }, STATUS.bekreftet).mal, { authority: "ola.github.io", path: "/" });
});

// --- Sjekken mot GitHub (P4/P5) ---------------------------------------------------

test("sjekk: uautentisert GET mot /repos/{eier}/{repo}, fast User-Agent, redirect manual; bare has_pages leses", async () => {
  const f = falskFetch(() => ({ status: 200, data: { has_pages: true, html_url: "https://ond.example/", cname: "ond.example" } }));
  const s = lagPagesSjekk({ fetch: f.fetch });
  assert.equal(await s.sjekk("Ola", "Oppg"), STATUS.bekreftet);
  assert.equal(f.kall.length, 1);
  const { url, opts } = f.kall[0];
  assert.equal(url, `${API_BASE}/repos/Ola/Oppg`);
  assert.equal(API_BASE, "https://api.github.com");
  assert.equal(opts.method, "GET");
  assert.equal(opts.redirect, "manual");
  assert.equal(opts.headers["User-Agent"], USER_AGENT);
  assert.equal(USER_AGENT, "canvas-clone-vscode");
  assert.ok(!Object.keys(opts.headers).some((h) => h.toLowerCase() === "authorization"), "Authorization i kallet");
  assert.equal(opts.body, undefined);
  assert.equal(s.status("ola", "oppg"), STATUS.bekreftet, "nøkkelen skiller ikke på store/små bokstaver");
});

test("sjekk: has_pages false og 404 gir ingen lenke; 301, 500, rar has_pages, ødelagt JSON og nettverksfeil gir «ikke sjekket»", async () => {
  const tilfeller = [
    [{ status: 200, data: { has_pages: false } }, STATUS.ingen],
    [{ status: 404, data: { message: "Not Found" } }, STATUS.ingen],
    [{ status: 301, data: { message: "Moved Permanently" }, headers: { location: "https://api.github.com/repositories/1" } }, STATUS.ikkeSjekket],
    [{ status: 500, data: {} }, STATUS.ikkeSjekket],
    [{ status: 200, data: { has_pages: "true" } }, STATUS.ikkeSjekket],
    [{ status: 200, data: {} }, STATUS.ikkeSjekket],
  ];
  for (const [svar, forventet] of tilfeller) {
    const s = lagPagesSjekk({ fetch: falskFetch(() => svar).fetch });
    assert.equal(await s.sjekk("ola", "oppg"), forventet, JSON.stringify(svar));
    assert.equal(s.status("ola", "oppg"), forventet);
  }
  const odelagt = lagPagesSjekk({ fetch: async () => new Response("{ikke json", { status: 200 }) });
  assert.equal(await odelagt.sjekk("ola", "oppg"), STATUS.ikkeSjekket);
  const nett = lagPagesSjekk({
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert.equal(await nett.sjekk("ola", "oppg"), STATUS.ikkeSjekket);
});

test("sjekk: én gang per eier/repo (også samtidig, uansett store/små bokstaver), og ugyldig eier/repo kalles aldri", async () => {
  const f = falskFetch();
  const s = lagPagesSjekk({ fetch: f.fetch });
  const svar = await Promise.all([s.sjekk("ola", "oppg"), s.sjekk("OLA", "Oppg"), s.sjekk("ola", "oppg")]);
  assert.deepEqual(svar, [STATUS.bekreftet, STATUS.bekreftet, STATUS.bekreftet]);
  await s.sjekk("ola", "oppg");
  assert.equal(f.kall.length, 1);
  assert.equal(await s.sjekk("ola", ".."), STATUS.ikkeSjekket);
  assert.equal(await s.sjekk("ola/../x", "y"), STATUS.ikkeSjekket);
  assert.equal(f.kall.length, 1);
  assert.equal(s.status("ukjent", "repo"), undefined, "ikke sjekket ennå");
});

test("sjekk: høyst 2 kall samtidig", async () => {
  const holdt = [];
  const f = falskFetch(async () => {
    const u = utsatt();
    holdt.push(u);
    await u.p;
    return { status: 200, data: { has_pages: true } };
  });
  const s = lagPagesSjekk({ fetch: f.fetch });
  const alle = ["a", "b", "c", "d", "e"].map((r) => s.sjekk("ola", r));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.kall.length, 2);
  while (holdt.length > 0) {
    holdt.shift().slipp();
    await new Promise((r) => setTimeout(r, 5));
  }
  await Promise.all(alle);
  assert.equal(f.kall.length, 5);
  assert.equal(f.maks(), 2);
});

test("sjekk: 429 og 403 med remaining 0 setter sperre til x-ratelimit-reset; ingen kall mens den varer, kall igjen etter", async () => {
  for (const status of [403, 429]) {
    const k = klokke();
    const reset = Math.floor(k.naa() / 1000) + 600;
    let n = 0;
    const f = falskFetch(() => (n++ === 0 ? { status, data: { message: "rate limit" }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } } : { status: 200, data: { has_pages: true } }));
    const s = lagPagesSjekk({ fetch: f.fetch, naa: k.naa });
    assert.equal(await s.sjekk("ola", "a"), STATUS.ikkeSjekket);
    assert.equal(s.status("ola", "a"), undefined, "rate limit lagres ikke som status");
    assert.equal(await s.sjekk("ola", "b"), STATUS.ikkeSjekket);
    assert.equal(await s.sjekk("ola", "a"), STATUS.ikkeSjekket);
    assert.equal(f.kall.length, 1, "ingen kall under sperren");
    k.frem(599_000);
    assert.equal(await s.sjekk("ola", "a"), STATUS.ikkeSjekket);
    assert.equal(f.kall.length, 1);
    k.frem(2_000);
    assert.equal(await s.sjekk("ola", "a"), STATUS.bekreftet);
    assert.equal(f.kall.length, 2, "kall igjen etter reset");
  }
});

test("sjekk: 403 er rate limit bare med x-ratelimit-remaining 0; annen 403 gir «ikke sjekket» for det ene repoet uten sperre", async () => {
  // Rate limit: 403 + remaining "0" sperrer (også uten x-ratelimit-reset), lagres ikke.
  const k = klokke();
  const f = falskFetch((url) =>
    url.endsWith("/a") ? { status: 403, data: { message: "rate limit" }, headers: { "x-ratelimit-remaining": "0" } } : { status: 200, data: { has_pages: true } },
  );
  const s = lagPagesSjekk({ fetch: f.fetch, naa: k.naa });
  assert.equal(await s.sjekk("ola", "a"), STATUS.ikkeSjekket);
  assert.equal(s.status("ola", "a"), undefined, "rate limit lagres ikke");
  assert.equal(s.sperretTil, k.naa() + SPERRE_UTEN_RESET_MS);
  assert.equal(await s.sjekk("ola", "b"), STATUS.ikkeSjekket);
  assert.equal(f.kall.length, 1, "sperren stopper neste repo");

  // Annen 403 (uten remaining, eller remaining > 0): bare dette repoet, ingen sperre.
  for (const headers of [{}, { "x-ratelimit-remaining": "41" }]) {
    const k2 = klokke();
    const f2 = falskFetch((url) =>
      url.endsWith("/a") ? { status: 403, data: { message: "Repository access blocked" }, headers } : { status: 200, data: { has_pages: true } },
    );
    const s2 = lagPagesSjekk({ fetch: f2.fetch, naa: k2.naa });
    assert.equal(await s2.sjekk("ola", "a"), STATUS.ikkeSjekket);
    assert.equal(s2.status("ola", "a"), STATUS.ikkeSjekket, "huskes som andre feilsvar (til «Oppdater»)");
    assert.equal(s2.sperretTil, 0, `ingen sperre (${JSON.stringify(headers)})`);
    assert.equal(await s2.sjekk("ola", "b"), STATUS.bekreftet, "neste repo sjekkes som vanlig");
    assert.equal(await s2.sjekk("ola", "a"), STATUS.ikkeSjekket);
    assert.equal(f2.kall.length, 2, "ingen nytt kall for repoet med 403");
  }
});

test("sjekk: rate limit uten x-ratelimit-reset gir 60 minutters sperre; remaining 0 på et 200-svar sperrer de neste", async () => {
  const k = klokke();
  const f = falskFetch(() => ({ status: 429, data: {} }));
  const s = lagPagesSjekk({ fetch: f.fetch, naa: k.naa });
  await s.sjekk("ola", "a");
  assert.equal(s.sperretTil, k.naa() + SPERRE_UTEN_RESET_MS);
  assert.equal(SPERRE_UTEN_RESET_MS, 60 * 60 * 1000);
  k.frem(SPERRE_UTEN_RESET_MS - 1);
  await s.sjekk("ola", "a");
  assert.equal(f.kall.length, 1);

  const k2 = klokke();
  const f2 = falskFetch(() => ({ status: 200, data: { has_pages: true }, headers: { "x-ratelimit-remaining": "0" } }));
  const s2 = lagPagesSjekk({ fetch: f2.fetch, naa: k2.naa });
  assert.equal(await s2.sjekk("ola", "a"), STATUS.bekreftet, "svaret brukes");
  assert.equal(await s2.sjekk("ola", "b"), STATUS.ikkeSjekket);
  assert.equal(f2.kall.length, 1);
});

test("sjekk: tom() glemmer statusene, men løfter ikke sperren", async () => {
  const k = klokke();
  let svar = { status: 200, data: { has_pages: true } };
  const f = falskFetch(() => svar);
  const s = lagPagesSjekk({ fetch: f.fetch, naa: k.naa });
  await s.sjekk("ola", "a");
  s.tom();
  assert.equal(s.status("ola", "a"), undefined);
  svar = { status: 429, data: {} };
  await s.sjekk("ola", "a");
  s.tom();
  assert.equal(await s.sjekk("ola", "a"), STATUS.ikkeSjekket);
  assert.equal(f.kall.length, 2, "sperren står etter tom()");
});

test("sjekk: tom() forkaster sene svar (ingen status, ingen varsling)", async () => {
  const u = utsatt();
  const f = falskFetch(async () => {
    await u.p;
    return { status: 200, data: { has_pages: true } };
  });
  const s = lagPagesSjekk({ fetch: f.fetch });
  const varsler = [];
  s.onEndret((n) => varsler.push(n));
  const lofte = s.sjekk("ola", "a");
  await new Promise((r) => setTimeout(r, 5));
  s.tom();
  assert.deepEqual(varsler, [null]);
  u.slipp();
  await lofte;
  assert.equal(s.status("ola", "a"), undefined, "sent svar havnet i den nye Map-en");
  assert.deepEqual(varsler, [null], "sent svar varslet");
});

test("sjekk: onEndret får nøkkelen (små bokstaver) når en status er klar; dispose fjerner lytteren", async () => {
  const s = lagPagesSjekk({ fetch: falskFetch().fetch });
  const varsler = [];
  const l = s.onEndret((n) => varsler.push(n));
  await s.sjekk("Ola", "Oppg");
  assert.deepEqual(varsler, ["ola/oppg"]);
  l.dispose();
  await s.sjekk("ola", "b");
  assert.deepEqual(varsler, ["ola/oppg"]);
});

test("sjekk: ingen eier/repo i feil (ingenting kastes ut til kalleren)", async () => {
  const s = lagPagesSjekk({
    fetch: async () => {
      throw new Error("elevvakt-ola/oppg nede");
    },
  });
  assert.equal(await s.sjekk("elevvakt-ola", "oppg"), STATUS.ikkeSjekket);
});

// --- Panelet (P3/P9) ---------------------------------------------------------------

const node = (userId, eier, repo) => ({
  course: { id: 7, name: "Kurs A" },
  assignment: { id: 70, name: "Frontend modul 1: HTML", submissionTypes: ["online_url"] },
  // 0.4.0 (G3): submittedAt eksplisitt (erLevert).
  sub: { studentName: "Ola", workflowState: "submitted", submittedAt: "2026-11-01T08:00:00Z", owner: eier, repo: repo ? `${eier}/${repo}` : null, userId, currentGrade: null },
});

test("MELDINGSFELT: apnePages har bare type og generasjon", () => {
  assert.deepEqual([...MELDINGSFELT.apnePages], ["type", "generasjon"]);
});

test("validerMelding: apnePages med riktig generasjon godtas; gammel generasjon, ekstra felt og URL avvises", () => {
  const panel = lagPanel();
  panel.bind(node(1001, "ola", "oppg"));
  const b = panel.bind(node(1002, "kari", "oppg")).binding;
  assert.deepEqual(validerMelding({ type: "apnePages", generasjon: 2 }, b), { ok: true, type: "apnePages" });
  assert.deepEqual(validerMelding({ type: "apnePages", generasjon: 1 }, b), { ok: false, grunn: "gammel_generasjon" });
  assert.deepEqual(validerMelding({ type: "apnePages", generasjon: 2 }, null), { ok: false, grunn: "ingen_binding" });
  for (const m of [
    { type: "apnePages", generasjon: 2, url: "https://ond.example/" },
    { type: "apnePages", generasjon: 2, repo: "ond/x" },
    { type: "apnePages", generasjon: 2, userId: 1001 },
    { type: "apnePages" },
    { type: "apnePages", generasjon: "2" },
    { type: "apnePages", generasjon: 3 },
    { type: "apnePages", generasjon: 2.5 },
  ]) {
    assert.deepEqual(validerMelding(m, b), { ok: false, grunn: "ugyldig" }, JSON.stringify(m));
  }
  // send er uendret.
  assert.deepEqual(validerMelding({ type: "send", generasjon: 2, karakter: " A ", kommentar: "" }, b), { ok: true, type: "send", karakter: "A", kommentar: "" });
});

test("pagesModell: knappetekst for bekreftet / ikke sjekket, tom tekst uten lenke, null uten binding; aldri URL", () => {
  const b = lagPanel().bind(node(1001, "ola", "oppg")).binding;
  assert.deepEqual(pagesModell(b, STATUS.bekreftet, t), { type: "pages", generasjon: 1, tekst: t.vscPagesOpen() });
  assert.deepEqual(pagesModell(b, undefined, t), { type: "pages", generasjon: 1, tekst: t.vscPagesOpenUnchecked() });
  assert.deepEqual(pagesModell(b, STATUS.ingen, t), { type: "pages", generasjon: 1, tekst: "" });
  assert.equal(pagesModell(null, STATUS.bekreftet, t), null);
  const utenRepo = lagPanel().bind(node(1003, "per", null)).binding;
  assert.equal(pagesModell(utenRepo, STATUS.bekreftet, t).tekst, "");
  for (const s of [STATUS.bekreftet, undefined]) {
    const json = JSON.stringify(pagesModell(b, s, en));
    assert.ok(!json.includes("github.io") && !json.includes("ola") && !json.includes("oppg"), json);
  }
});

// --- Statiske sjekker av kildekoden ------------------------------------------------

const kilder = () =>
  readdirSync(VSRC)
    .filter((f) => /\.(m?js)$/.test(f))
    .map((f) => ({ f, tekst: readFileSync(path.join(VSRC, f), "utf8") }));

// 0.3.0 (tilsynets K4 revidert): eksakt, alfabetisk liste; canvaslenke-vindu.js er
// det eneste stedet som åpner Canvas-lenker.
test("P2/P3/K4: openExternal finnes bare i vscode/src/canvaslenke-vindu.js og pages-vindu.js", () => {
  const med = kilder()
    .filter((k) => k.tekst.includes("openExternal"))
    .map((k) => k.f)
    .sort();
  assert.deepEqual(med, ["canvaslenke-vindu.js", "pages-vindu.js"]);
  for (const d of ["src", "bin"]) {
    for (const f of readdirSync(path.join(ROT, d))) {
      assert.ok(!readFileSync(path.join(ROT, d, f), "utf8").includes("openExternal"), `${d}/${f}`);
    }
  }
});

test("P2/P4/P5: Pages-koden har ingen token, Authorization, getSession, html_url/cname eller lagring", () => {
  for (const f of ["pages.mjs", "pages-vindu.js"]) {
    const tekst = readFileSync(path.join(VSRC, f), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    for (const forbudt of ["Authorization", "GITHUB_TOKEN", "GH_TOKEN", "getSession", "authentication", "html_url", "cname", "globalState", "workspaceState", "setState", "secrets", "writeFile", "cache"]) {
      assert.ok(!tekst.includes(forbudt), `«${forbudt}» i ${f}`);
    }
  }
});

test("P3: webviewen har en knapp for Pages, ingen <a href>, og CSP er uendret", async () => {
  const { lagHtml, csp, WEBVIEW_SKRIPT } = await import("../vscode/src/panel-html.mjs");
  const html = lagHtml("0".repeat(32));
  assert.match(html, /<button type="button" data-felt="pages"[^>]* hidden disabled><\/button>/);
  assert.ok(!/<a\s/i.test(html), "lenke-element i HTML-en");
  assert.ok(!/href/i.test(html));
  assert.equal(
    csp("0".repeat(32)),
    "default-src 'none'; script-src 'nonce-00000000000000000000000000000000'; style-src 'nonce-00000000000000000000000000000000'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'",
  );
  assert.ok(WEBVIEW_SKRIPT.includes('api.postMessage({ type: "apnePages", generasjon: generasjon })'));
});
