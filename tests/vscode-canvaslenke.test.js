// Ren logikk for «Åpne i Canvas» i karakterpanelet (vscode/src/canvaslenke.mjs, 0.3.0):
// fast URL-mal fra den lagrede Canvas-URL-en og bindingens ID-er, og sjekken rett før
// åpning (tilsynets K4 revidert). Statiske sjekker av kildekoden for K2/K3/K4. Ingen VS Code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canvasVert, innleveringMal, oppgaveMal, erGyldigCanvasUri, CANVAS_STI, OPPGAVE_STI, CANVAS_MALER } from "../vscode/src/canvaslenke.mjs";
import { oppgaveIder, nodeFraArg } from "../vscode/src/bla.mjs";

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

// --- 0.4.0: oppgavesiden (tilsynets O3) ---------------------------------------

test("O3 oppgaveMal: fast mal /courses/k/assignments/a fra lagret origin og numeriske ID-er; alt annet gir null", () => {
  assert.deepEqual(oppgaveMal(C, 7, 70), { authority: "skole.instructure.com", path: "/courses/7/assignments/70" });
  assert.deepEqual(oppgaveMal(`${C}/`, 7, 70), { authority: "skole.instructure.com", path: "/courses/7/assignments/70" });
  assert.deepEqual(oppgaveMal("https://canvas.test:8443", 1, 2), { authority: "canvas.test:8443", path: "/courses/1/assignments/2" });
  for (const [url, k, a] of [
    ["http://skole.instructure.com", 7, 70],
    ["https://bruker:pass@skole.instructure.com", 7, 70],
    ["https://skole.instructure.com/sti", 7, 70],
    ["https://skole.instructure.com/?q=1", 7, 70],
    ["https://skole.instructure.com/#x", 7, 70],
    ["ikke en url", 7, 70],
    [undefined, 7, 70],
    [C, "7", 70],
    [C, 7, "70"],
    [C, "7/../8", 70],
    [C, 7, "70?verifier=x"],
    [C, 0, 70],
    [C, 7, -1],
    [C, 7, 1.5],
    [C, 7, NaN],
    [C, 7, null],
    [C, undefined, 70],
    [C, 7, Number.MAX_SAFE_INTEGER + 2],
  ]) {
    assert.equal(oppgaveMal(url, k, a), null, JSON.stringify([url, k, a]));
  }
});

test("O3 erGyldigCanvasUri: godtar nøyaktig de to ankrede malene (oppgave og innlevering), ikke noe løsere", () => {
  assert.deepEqual(CANVAS_MALER, [CANVAS_STI, OPPGAVE_STI]);
  assert.ok(Object.isFrozen(CANVAS_MALER));
  assert.equal(OPPGAVE_STI.source, "^\\/courses\\/\\d+\\/assignments\\/\\d+$");
  assert.equal(CANVAS_STI.source, "^\\/courses\\/\\d+\\/assignments\\/\\d+\\/submissions\\/\\d+$");
  const oppg = `${C}/courses/7/assignments/70`;
  assert.equal(erGyldigCanvasUri(oppg, C), true);
  assert.equal(erGyldigCanvasUri(`${C}/courses/7/assignments/70/submissions/1001`, C), true);
  assert.equal(erGyldigCanvasUri({ scheme: "https", authority: "skole.instructure.com", path: "/courses/7/assignments/70", query: "", fragment: "" }, C), true);
  const daarlige = [
    // Ekstra eller manglende sti.
    `${oppg}/`,
    `${oppg}/edit`,
    `${oppg}/submissions`,
    `${oppg}/submissions/`,
    `${oppg}/submissions/1001/x`,
    `${C}/courses/7/assignments`,
    `${C}/courses/7/assignments/`,
    `${C}/courses/7`,
    `${C}/courses/7/`,
    `${C}/courses/7/quizzes/70`,
    `${C}/courses/7/discussion_topics/70`,
    `${C}/courses/7/pages/70`,
    `${C}/courses/7/files/70`,
    `${C}/courses/7/assignments/70/files/1`,
    `${C}/api/v1/courses/7/assignments/70`,
    `${C}/x/courses/7/assignments/70`,
    `${C}//courses/7/assignments/70`,
    `${C}/courses//assignments/70`,
    `${C}/courses/7/assignments/70/../71`,
    `${C}/files/1/download`,
    `${C}/`,
    C,
    // Query og fragment.
    `${oppg}?verifier=abc`,
    `${oppg}?`,
    `${oppg}#x`,
    `${oppg}?module_item_id=1`,
    `${oppg}#`,
    `${C}/courses/7/assignments/70/submissions/1001?`,
    `${C}/courses/7/assignments/70/submissions/1001#`,
    // Ikke-numeriske ID-er.
    `${C}/courses/abc/assignments/70`,
    `${C}/courses/7/assignments/abc`,
    `${C}/courses/7/assignments/7e2`,
    `${C}/courses/7/assignments/-1`,
    `${C}/courses/7/assignments/%37%30`,
    `${C}/courses/7/assignments/70%2F..`,
    `${C}/courses/%37/assignments/70`,
    `${C}/courses/7/assignments/\u0667\u0660`,
    // Andre verter, skjema, port og userinfo (også en annen skoles Canvas: «på tvers»).
    "https://annen.instructure.com/courses/7/assignments/70",
    "https://skole.instructure.com.ond.example/courses/7/assignments/70",
    "https://skole.instructure.com:444/courses/7/assignments/70",
    "http://skole.instructure.com/courses/7/assignments/70",
    "https://x@skole.instructure.com/courses/7/assignments/70",
    "https://x:y@skole.instructure.com/courses/7/assignments/70",
    "javascript:alert(1)//courses/7/assignments/70",
    "",
  ];
  for (const u of daarlige) assert.equal(erGyldigCanvasUri(u, C), false, u);
  for (const sti of ["/courses/7/assignments/70/", "/courses/7/assignments/70/edit", "/courses/x/assignments/70", "/courses/7/assignments/70\n", " /courses/7/assignments/70"]) {
    assert.equal(erGyldigCanvasUri({ scheme: "https", authority: "skole.instructure.com", path: sti, query: "", fragment: "" }, C), false, sti);
  }
  for (const o of [
    { scheme: "https", authority: "skole.instructure.com", path: "/courses/7/assignments/70", query: "a=1", fragment: "" },
    { scheme: "https", authority: "skole.instructure.com", path: "/courses/7/assignments/70", query: "", fragment: "f" },
    { scheme: "https", authority: "x@skole.instructure.com", path: "/courses/7/assignments/70", query: "", fragment: "" },
    { scheme: "https", authority: "annen.instructure.com", path: "/courses/7/assignments/70", query: "", fragment: "" },
    { scheme: "http", authority: "skole.instructure.com", path: "/courses/7/assignments/70", query: "", fragment: "" },
  ]) {
    assert.equal(erGyldigCanvasUri(o, C), false, JSON.stringify(o));
  }
  // Uten gyldig lagret Canvas-URL åpnes ingenting.
  assert.equal(erGyldigCanvasUri(oppg, undefined), false);
  assert.equal(erGyldigCanvasUri(oppg, "http://skole.instructure.com"), false);
});

test("O3 oppgaveIder: bare oppgavenoder; kurset er oppgavens eget (courseId) ved oppgaver fra et annet kurs, ellers kursnodens", () => {
  const course = { id: 7, name: "Kurs" };
  assert.deepEqual(oppgaveIder({ type: "oppgave", course, assignment: { id: 70, name: "O" } }), { kursId: 7, oppgaveId: 70 });
  // Oppgave merket med eget kurs (som i workflow.js på tvers av kurs): det kurset brukes.
  assert.deepEqual(oppgaveIder({ type: "oppgave", course, assignment: { id: 80, courseId: 8 } }), { kursId: 8, oppgaveId: 80 });
  for (const n of [
    null,
    undefined,
    { type: "innlevering", course, assignment: { id: 70 }, sub: { userId: 1 } },
    { type: "ikkeLevert", course, assignment: { id: 70 }, sub: { userId: 1 } },
    { type: "kurs", course },
    { type: "modul", course },
    { type: "oppgave", course },
    { type: "oppgave", assignment: { id: 70 } },
  ]) {
    assert.equal(oppgaveIder(n), null, JSON.stringify(n));
  }
  // URL-en bygges bare fra ID-ene: et `html_url` på oppgaven brukes aldri.
  const ider = oppgaveIder({ type: "oppgave", course, assignment: { id: 70, html_url: "https://ond.example/x" } });
  assert.deepEqual(oppgaveMal(C, ider.kursId, ider.oppgaveId), { authority: "skole.instructure.com", path: "/courses/7/assignments/70" });
  // Ugyldige ID-er på noden gir ingen mal (ikke-numerisk kurs fra en ødelagt cache).
  const rare = oppgaveIder({ type: "oppgave", course: { id: "7" }, assignment: { id: 70 } });
  assert.equal(oppgaveMal(C, rare.kursId, rare.oppgaveId), null);
  // Bare noder fra treet, i testmodus også id som tekst; aldri en URL eller et falskt objekt.
  const n = { id: "n1", type: "oppgave", course, assignment: { id: 70 } };
  const noder = new Map([["n1", n]]);
  assert.equal(nodeFraArg(n, noder, false, ["oppgave"]), n);
  assert.equal(nodeFraArg("n1", noder, false, ["oppgave"]), null);
  assert.equal(nodeFraArg(`${C}/courses/7/assignments/70`, noder, true, ["oppgave"]), null);
  assert.equal(nodeFraArg({ ...n }, noder, true, ["oppgave"]), null);
});

// --- Statiske sjekker av kildekoden (K2/K3/K4) ----------------------------------

const kilder = (mappe) =>
  readdirSync(mappe)
    .filter((f) => /\.(m?js)$/.test(f))
    .map((f) => ({ f, tekst: readFileSync(path.join(mappe, f), "utf8") }));

test("K4: bare canvaslenke-vindu.js bygger Canvas-lenker for nettleseren; ingen Canvas-URL fra webviewen", () => {
  const med = kilder(VSRC).filter((k) => k.tekst.includes("innleveringMal(")).map((k) => k.f).sort();
  assert.deepEqual(med, ["canvaslenke-vindu.js", "canvaslenke.mjs"]);
  // 0.4.0 (O3): oppgavemalen likeså.
  const medOppgave = kilder(VSRC).filter((k) => k.tekst.includes("oppgaveMal(")).map((k) => k.f).sort();
  assert.deepEqual(medOppgave, ["canvaslenke-vindu.js", "canvaslenke.mjs"]);
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

// 0.4.0 (tilsynets O3): den statiske lista over filer med openExternal er uendret
// (samme påstand som i tests/vscode-pages.test.js), og ingen kode i vscode/src leser
// `html_url` (kommentarer unntatt).
test("O3: openExternal bare i [canvaslenke-vindu.js, pages-vindu.js]; ingen html_url i vscode/src", () => {
  const med = kilder(VSRC)
    .filter((k) => k.tekst.includes("openExternal"))
    .map((k) => k.f)
    .sort();
  assert.deepEqual(med, ["canvaslenke-vindu.js", "pages-vindu.js"]);
  for (const { f, tekst } of kilder(VSRC)) {
    const kode = tekst
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    assert.ok(!kode.includes("html_url"), `html_url i vscode/src/${f}`);
  }
  // Panelet og treet gir bare ID-er videre: apneOppgave kalles med bindingen eller oppgaveIder.
  const panel = readFileSync(path.join(VSRC, "panel-vindu.js"), "utf8");
  assert.match(panel, /canvaslenke\.apneOppgave\(binding\)/);
  const bla = readFileSync(path.join(VSRC, "bla-vindu.js"), "utf8");
  assert.match(bla, /oppgaveIder\(nodeFraArg\(arg, noder, testmodus, \["oppgave"\]\)\)/);
});
