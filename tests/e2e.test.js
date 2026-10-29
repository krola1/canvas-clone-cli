// Ende-til-ende-tester av bin/canvas-clone.js som egen prosess, helt offline:
// - Canvas: falsk fetch via `--import tests/helpers/fake-fetch.mjs`
// - git og editor: små Node-skript i en egen mappe, og PATH peker BARE dit
//   (ingen ekte git/gh/editor kan startes)
// - HOME og XDG_CONFIG_HOME peker til midlertidige mapper, så ekte
//   ~/canvas-clone og ~/.config/canvas-clone aldri røres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  chmodSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, "..", "bin", "canvas-clone.js");
const FAKE_FETCH = pathToFileURL(path.join(here, "helpers", "fake-fetch.mjs")).href;
const SENTINEL = "ART9-SENTINEL";

const [major, minor] = process.versions.node.split(".").map(Number);
const skip =
  process.platform === "win32"
    ? "POSIX-skript og signaler (Windows testes manuelt)"
    : major < 18 || (major === 18 && minor < 18)
      ? "--import krever Node >= 18.18"
      : false;

const ORIGIN = "https://canvas.test";
const sub = (userId, name, extra) => ({
  user_id: userId,
  user: { name },
  workflow_state: "submitted",
  grade: null,
  score: null,
  ...extra,
});
const SCENARIO = {
  origin: ORIGIN,
  courses: [{ id: 1, name: "Testkurs" }],
  assignments: {
    1: [
      { id: 10, name: "Oppgave A", due_at: null, needs_grading_count: 4, submission_types: ["online_url"] },
      { id: 11, name: "Oppgave B", due_at: null, needs_grading_count: 3, submission_types: ["online_url"] },
    ],
  },
  submissions: {
    "1:10": [
      sub(1, "Ola Nordmann", { body: `${SENTINEL} https://github.com/ola/x` }),
      sub(2, "Kari Nordmann", { body: `<p>${SENTINEL}</p> https://github.com/ola/x` }),
      sub(4, "Lise Uten", { body: `${SENTINEL} ingen lenke her` }),
      sub(8, "Per Hansen", { url: "https://github.com/perh/z", body: SENTINEL }),
    ],
    "1:11": [
      sub(5, "Ole Stor", { url: "https://github.com/Ola/y" }),
      sub(6, "Ole Liten", { url: "https://github.com/ola/y", body: SENTINEL }),
      sub(7, "Eva Ond", { body: `${SENTINEL} https://github.com/../evil` }),
    ],
  },
};

const FAKE_GIT = `#!${process.execPath}
const fs = require("node:fs");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("git version 0.0.0-fake"); process.exit(0); }
if (a[0] === "clone") {
  const dest = a[a.length - 1];
  const url = a[a.length - 2];
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(dest + "/REPO_ID", url);
  process.exit(0);
}
process.exit(1);
`;
const FAKE_EDITOR = `#!${process.execPath}
require("node:fs").appendFileSync(process.env.EDITOR_LOG, process.argv.slice(2).join(" ") + "\\n");
`;

// Alle tmp-mapper testene lager. Hver test sletter sin egen i `finally`;
// dette er en ekstra sikring hvis en test avbrytes før `finally` rekker å
// kjøre (f.eks. tidsavbrudd i testkjøreren eller Ctrl-C).
const bases = new Set();
function cleanupBases() {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
  bases.clear();
}
process.on("exit", cleanupBases);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, () => {
    killAll();
    cleanupBases();
    process.exit(130);
  });
}

function setup() {
  const base = mkdtempSync(path.join(tmpdir(), "cc-e2e-"));
  bases.add(base);
  const env = {
    home: path.join(base, "home"),
    xdg: path.join(base, "home", ".config"),
    fakeBin: path.join(base, "fakebin"),
    work: path.join(base, "work"),
    logs: path.join(base, "logs"),
  };
  for (const d of Object.values(env)) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(env.fakeBin, "git"), FAKE_GIT);
  writeFileSync(path.join(env.fakeBin, "fakeedit"), FAKE_EDITOR);
  chmodSync(path.join(env.fakeBin, "git"), 0o755);
  chmodSync(path.join(env.fakeBin, "fakeedit"), 0o755);
  mkdirSync(path.join(env.xdg, "canvas-clone"), { recursive: true });
  writeFileSync(
    path.join(env.xdg, "canvas-clone", "config.json"),
    JSON.stringify({ canvasUrl: ORIGIN, canvasToken: "tok", editor: null })
  );
  writeFileSync(path.join(env.logs, "scenario.json"), JSON.stringify(SCENARIO));
  env.base = base;
  env.root = path.join(env.home, "canvas-clone", "grading");
  env.fetchLog = path.join(env.logs, "fetch.log");
  env.editorLog = path.join(env.logs, "editor.log");
  return env;
}

const children = new Set();
function killAll() {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  children.clear();
}

function run(env, args, { cwd = env.work } = {}) {
  const child = spawn(process.execPath, ["--import", FAKE_FETCH, BIN, ...args], {
    cwd,
    env: {
      HOME: env.home,
      XDG_CONFIG_HOME: env.xdg,
      PATH: env.fakeBin,
      NO_COLOR: "1",
      FAKE_CANVAS: path.join(env.logs, "scenario.json"),
      FAKE_FETCH_LOG: env.fetchLog,
      EDITOR_LOG: env.editorLog,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const out = { stdout: "", stderr: "" };
  child.stdout.on("data", (d) => (out.stdout += d));
  child.stderr.on("data", (d) => (out.stderr += d));
  // Vakthund: en CLI som aldri avslutter skal gi en feilende test, ikke en
  // test-suite som henger (åpne pipes holder ellers testprosessen i live).
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 20000);
  watchdog.unref();
  out.done = new Promise((resolve) =>
    child.on("close", (code, signal) => {
      clearTimeout(watchdog);
      resolve({ code, signal });
    })
  );
  out.child = child;
  children.add(child);
  return out;
}

async function waitFor(pred, what, ms = 15000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error(`tidsavbrudd: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const waitingForEnter = (p) => waitFor(() => /Trykk Enter/.test(p.stdout), "venter på Enter-melding");

function walk(dir) {
  if (!existsSync(dir)) return [];
  const result = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    result.push(p);
    if (e.isDirectory()) result.push(...walk(p));
  }
  return result;
}

function assertNoSentinelUnder(dir) {
  for (const p of walk(dir)) {
    assert.doesNotMatch(p, new RegExp(SENTINEL));
    if (statSync(p).isFile()) assert.doesNotMatch(readFileSync(p, "utf8"), new RegExp(SENTINEL), p);
  }
}

function sessions(env) {
  return existsSync(env.root) ? readdirSync(env.root) : [];
}

function fetchLog(env) {
  if (!existsSync(env.fetchLog)) return [];
  return readFileSync(env.fetchLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

test("e2e: bulk-kloning - øktmappe under HOME, hver elev egen mappe, alt slettet etter Enter, ingen body noe sted", { skip }, async () => {
  const env = setup();
  try {
    const p = run(env, ["--course", "1", "--all", "--open", "fakeedit"]);
    await waitingForEnter(p);

    // Under venting: én øktmappe med riktig innhold.
    const [s] = sessions(env);
    assert.match(s, /^\d{8}-\d{6}-\d+$/);
    const sp = path.join(env.root, s);
    assert.deepEqual(readdirSync(path.join(sp, "10")).sort(), ["ola_x", "ola_x-2", "perh_z", "uten_lenke.txt"]);
    assert.deepEqual(readdirSync(path.join(sp, "11")).sort(), ["ola_y", "ola_y-2", "uten_lenke.txt"]);
    // B1: samme eier+repo -> to mapper; Ola/ola -> to mapper med hvert sitt innhold.
    for (const d of ["ola_x", "ola_x-2"]) {
      assert.equal(readFileSync(path.join(sp, "10", d, "REPO_ID"), "utf8"), "https://github.com/ola/x.git");
    }
    assert.deepEqual(
      ["ola_y", "ola_y-2"].map((d) => readFileSync(path.join(sp, "11", d, "REPO_ID"), "utf8")).sort(),
      ["https://github.com/Ola/y.git", "https://github.com/ola/y.git"]
    );
    // Ugyldig lenke (../evil) -> uten lenke, aldri klonet.
    assert.match(readFileSync(path.join(sp, "11", "uten_lenke.txt"), "utf8"), /Eva Ond/);
    assert.match(readFileSync(path.join(sp, "10", "uten_lenke.txt"), "utf8"), /Lise Uten/);
    // Editoren fikk bare stier inni øktmappen.
    const opened = readFileSync(env.editorLog, "utf8").trim().split("\n");
    assert.equal(opened.length, 5);
    for (const o of opened) assert.ok(o.startsWith(sp + path.sep), o);
    assertNoSentinelUnder(env.home);

    p.child.stdin.write("\n");
    const { code } = await p.done;
    assert.equal(code, 0, p.stderr);

    // T5: advarsel om upålitelig kode ved --open.
    assert.match(p.stdout, /Elevrepoer er kode du ikke har skrevet selv/);
    // T-N3/S3: bare .gitignore + tom grading/ igjen.
    assert.deepEqual(readdirSync(path.join(env.home, "canvas-clone")).sort(), [".gitignore", "grading"]);
    assert.equal(readFileSync(path.join(env.home, "canvas-clone", ".gitignore"), "utf8"), "*\n");
    assert.deepEqual(readdirSync(env.root), []);
    assert.deepEqual(readdirSync(path.join(env.xdg, "canvas-clone")).sort(), ["cache.json", "config.json"]);
    // T3: ingenting i cwd.
    assert.deepEqual(readdirSync(env.work), []);
    // T-A: aldri i output eller filer.
    assert.doesNotMatch(p.stdout + p.stderr, new RegExp(SENTINEL));
    assertNoSentinelUnder(env.home);
    // Ingen elev-/GitHub-navn i noen fil under HOME (cache.json har bare kurs/oppgaver).
    for (const f of walk(env.home).filter((x) => statSync(x).isFile())) {
      assert.doesNotMatch(readFileSync(f, "utf8"), /Nordmann|ola\/|perh/, f);
    }
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e: --temp gir utfaset-melding, og øktmappen slettes når stdin lukkes (EOF)", { skip }, async () => {
  const env = setup();
  try {
    const p = run(env, ["--course", "1", "--all", "--open", "fakeedit", "--temp"]);
    await waitingForEnter(p);
    assert.equal(sessions(env).length, 1);
    assert.ok(existsSync(path.join(env.root, sessions(env)[0], "10", "uten_lenke.txt")));
    p.child.stdin.end();
    const { code } = await p.done;
    assert.equal(code, 0, p.stderr);
    assert.match(p.stderr, /--temp er utfaset/);
    assert.deepEqual(sessions(env), []);
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e: SIGINT under venting -> øktmappen slettet, exit 130", { skip }, async () => {
  const env = setup();
  try {
    const p = run(env, ["--course", "1", "--all", "--open", "fakeedit"]);
    await waitingForEnter(p);
    assert.equal(sessions(env).length, 1);
    p.child.kill("SIGINT");
    const { code } = await p.done;
    assert.equal(code, 130);
    assert.deepEqual(sessions(env), []);
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e: samtidig kjøring rører ikke levende økt; SIGKILL-et økt ryddes ved neste kjøring (--help)", { skip }, async () => {
  const env = setup();
  try {
    const a = run(env, ["--course", "1", "--all", "--open", "fakeedit"]);
    await waitingForEnter(a);
    const [aSession] = sessions(env);
    const aLog = path.join(env.root, aSession, "10", "uten_lenke.txt");
    assert.ok(existsSync(aLog));

    const b = run(env, ["--help"]);
    assert.equal((await b.done).code, 0);
    assert.ok(existsSync(aLog), "B slettet A sin levende økt");
    // T-N2: B sier tydelig fra om at A sin økt ble latt være.
    assert.match(b.stderr, /1 økt\(er\) fra andre kjøringer av canvas-clone ser ut til å pågå/);
    assert.deepEqual(sessions(env), [aSession]);

    a.child.kill("SIGKILL");
    await a.done;
    assert.deepEqual(sessions(env), [aSession], "SIGKILL skal ikke rekke å rydde");

    const c = run(env, ["--help"]);
    assert.equal((await c.done).code, 0);
    assert.match(c.stderr, /Ryddet 1 rester/);
    assert.deepEqual(sessions(env), []);
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e: ukjente filer/mapper under roten røres ikke og gir advarsel", { skip }, async () => {
  const env = setup();
  try {
    mkdirSync(path.join(env.root, "mitt-eget"), { recursive: true });
    writeFileSync(path.join(env.root, "notat.txt"), "x");
    const p = run(env, ["--help"]);
    assert.equal((await p.done).code, 0);
    assert.match(p.stderr, /2 fil\(er\)\/mappe\(r\) i .* er ikke øktmapper fra canvas-clone og ble ikke rørt/);
    assert.deepEqual(sessions(env).sort(), ["mitt-eget", "notat.txt"]);
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e: gammel ./grading i cwd gir advarsel og røres ikke", { skip }, async () => {
  const env = setup();
  try {
    const old = path.join(env.work, "grading", "10", "ola");
    mkdirSync(old, { recursive: true });
    writeFileSync(path.join(env.work, "grading", "10", "uten_lenke.txt"), "Ola Nordmann\tingen lenke\n");
    const p = run(env, ["--help"]);
    assert.equal((await p.done).code, 0);
    assert.match(p.stderr, /Eldre versjoner av canvas-clone/);
    assert.match(p.stderr, /rm -r \.\/grading/);
    assert.match(p.stderr, /Remove-Item -Recurse \.\\grading/);
    assert.ok(existsSync(old));
    assert.ok(existsSync(path.join(env.work, "grading", "10", "uten_lenke.txt")));
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e T1a: to innleveringer med samme GitHub-eier + --confirm uten TTY -> exit 1, ingen PUT", { skip }, async () => {
  const env = setup();
  try {
    const p = run(env, ["--course", "1", "--assignment", "10", "--github", "OLA", "--grade", "A", "--confirm"]);
    p.child.stdin.end();
    const { code } = await p.done;
    assert.equal(code, 1);
    assert.match(p.stderr, /Ola Nordmann/);
    assert.match(p.stderr, /Kari Nordmann/);
    assert.equal(fetchLog(env).filter((r) => r.method === "PUT").length, 0);
    assert.doesNotMatch(p.stdout + p.stderr, new RegExp(SENTINEL));
    assert.deepEqual(sessions(env), []);
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});

test("e2e T1: én elev -> PUT til riktig user_id, oppsummering med Canvas-navn", { skip }, async () => {
  const env = setup();
  try {
    const p = run(env, ["--course", "1", "--assignment", "10", "--github", "perh", "--grade", "B", "--confirm"]);
    p.child.stdin.end();
    const { code } = await p.done;
    assert.equal(code, 0, p.stderr);
    const puts = fetchLog(env).filter((r) => r.method === "PUT");
    assert.equal(puts.length, 1);
    assert.equal(puts[0].url, `${ORIGIN}/api/v1/courses/1/assignments/10/submissions/8`);
    assert.equal(new URLSearchParams(puts[0].body).get("submission[posted_grade]"), "B");
    assert.match(p.stdout, /Per Hansen \(GitHub: perh\)/);
    assert.doesNotMatch(p.stdout + p.stderr, new RegExp(SENTINEL));
  } finally {
    killAll();
    rmSync(env.base, { recursive: true, force: true });
  }
});
