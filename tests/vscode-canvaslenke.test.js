// Ren logikk for «Åpne i Canvas» i karakterpanelet (vscode/src/canvaslenke.mjs, 0.3.0):
// fast URL-mal fra den lagrede Canvas-URL-en og bindingens ID-er, og sjekken rett før
// åpning (tilsynets K4 revidert). Statiske sjekker av kildekoden for K2/K3/K4. Ingen VS Code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canvasVert, innleveringMal, erGyldigCanvasUri, CANVAS_STI } from "../vscode/src/canvaslenke.mjs";

const ROT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VSRC = path.join(ROT, "vscode", "src");
const C = "https://skole.instructure.com";

test("innleveringMal: fast mal fra Canvas-URL-en og numeriske ID-er; alt annet gir null", () => {
  assert.deepEqual(innleveringMal(C, 7, 70, 1001), { authority: "skole.instructure.com", path: "/courses/7/assignments/70/submissions/1001" });
  assert.deepEqual(innleveringMal("https://canvas.test:8443", 1, 2, 3), { authority: "canvas.test:8443", path: "/courses/1/assignments/2/submissions/3" });
  for (const [url, k, a, u] of [
    ["http://skole.instructure.com", 7, 70, 1001],
    ["https://bruker:pass@skole.instructure.com", 7, 70, 1001],
    ["https://skole.instructure.com/sti", 7, 70, 1001],
    ["https://skole.instructure.com/?q=1", 7, 70, 1001],
    ["ikke en url", 7, 70, 1001],
    [undefined, 7, 70, 1001],
    [C, "7", 70, 1001],
    [C, 7, 0, 1001],
    [C, 7, 70, -1],
    [C, 7, 70, 1.5],
    [C, 7, 70, Number.MAX_SAFE_INTEGER + 2],
  ]) {
    assert.equal(innleveringMal(url, k, a, u), null, JSON.stringify([url, k, a, u]));
  }
  assert.equal(canvasVert(`${C}/`), "skole.instructure.com");
});

test("erGyldigCanvasUri: bare https, samme vert/port, ingen userinfo, sti etter malen, ingen query/fragment", () => {
  const god = `${C}/courses/7/assignments/70/submissions/1001`;
  assert.equal(erGyldigCanvasUri(god, C), true);
  assert.equal(erGyldigCanvasUri({ scheme: "https", authority: "skole.instructure.com", path: "/courses/7/assignments/70/submissions/1001", query: "", fragment: "" }, C), true);
  const daarlige = [
    "http://skole.instructure.com/courses/7/assignments/70/submissions/1001",
    "https://annen.instructure.com/courses/7/assignments/70/submissions/1001",
    "https://skole.instructure.com:444/courses/7/assignments/70/submissions/1001",
    "https://x@skole.instructure.com/courses/7/assignments/70/submissions/1001",
    `${god}?verifier=abc`,
    `${god}#x`,
    `${C}/courses/7/assignments/70/submissions/1001/`,
    `${C}/courses/7/assignments/70/submissions/abc`,
    `${C}/courses/7/gradebook/speed_grader`,
    `${C}/files/1/download`,
    `${C}/courses/7/assignments/70/submissions/%31`,
    `${C}/courses/7/assignments/70/submissions/../1`,
    "javascript:alert(1)",
    "",
  ];
  for (const u of daarlige) assert.equal(erGyldigCanvasUri(u, C), false, u);
  for (const o of [
    { scheme: "https", authority: "x@skole.instructure.com", path: "/courses/7/assignments/70/submissions/1001", query: "", fragment: "" },
    { scheme: "https", authority: "skole.instructure.com", path: "/courses/7/assignments/70/submissions/1001", query: "a=1", fragment: "" },
    { scheme: "https", authority: "skole.instructure.com", path: "/courses/7/assignments/70/submissions/1001", query: "", fragment: "f" },
    { scheme: "http", authority: "skole.instructure.com", path: "/courses/7/assignments/70/submissions/1001", query: "", fragment: "" },
    null,
    42,
  ]) {
    assert.equal(erGyldigCanvasUri(o, C), false, JSON.stringify(o));
  }
  // Uten gyldig lagret Canvas-URL åpnes ingenting.
  assert.equal(erGyldigCanvasUri(god, undefined), false);
  assert.equal(erGyldigCanvasUri(god, "http://skole.instructure.com"), false);
  assert.ok(CANVAS_STI.test("/courses/1/assignments/2/submissions/3"));
});

// --- Statiske sjekker av kildekoden (K2/K3/K4) ----------------------------------

const kilder = (mappe) =>
  readdirSync(mappe)
    .filter((f) => /\.(m?js)$/.test(f))
    .map((f) => ({ f, tekst: readFileSync(path.join(mappe, f), "utf8") }));

test("K4: bare canvaslenke-vindu.js bygger Canvas-lenker for nettleseren; ingen Canvas-URL fra webviewen", () => {
  const med = kilder(VSRC).filter((k) => k.tekst.includes("innleveringMal(")).map((k) => k.f).sort();
  assert.deepEqual(med, ["canvaslenke-vindu.js", "canvaslenke.mjs"]);
  const vindu = readFileSync(path.join(VSRC, "canvaslenke-vindu.js"), "utf8");
  assert.match(vindu, /erGyldigCanvasUri\(uri, canvasUrl\) \|\| !erGyldigCanvasUri\(uri\.toString\(\), canvasUrl\)/);
  assert.match(vindu, /vscode\.Uri\.from\(/);
});

test("K2/K3: ingen innerHTML, <a, submission_html_comments eller submission_history; include for kommentarer bare i canvas.js", () => {
  const alle = [...kilder(VSRC).map((k) => ({ ...k, f: `vscode/src/${k.f}` })), ...kilder(path.join(ROT, "src")).map((k) => ({ ...k, f: `src/${k.f}` }))];
  for (const { f, tekst } of alle) {
    const kode = tekst
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    for (const forbudt of ["innerHTML", "outerHTML", "insertAdjacentHTML", "<a ", "<a>", "submission_html_comments", "submission_history"]) {
      assert.ok(!kode.includes(forbudt), `«${forbudt}» i ${f}`);
    }
    if (f !== "src/canvas.js") assert.ok(!kode.includes("submission_comments"), `submission_comments i ${f}`);
  }
});
