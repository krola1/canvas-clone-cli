// Ende-til-ende: et privat/slettet repo havner i uten_lenke.txt som «uten
// tilgang», ikke som en rå klone-feil. Samme oppsett som tests/e2e.test.js
// (falsk fetch, falsk git i en egen PATH, HOME/XDG i tmp), men i egen fil så
// den eksisterende e2e-testen står uendret.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, "..", "bin", "canvas-clone.js");
const FAKE_FETCH = pathToFileURL(path.join(here, "helpers", "fake-fetch.mjs")).href;

const [major, minor] = process.versions.node.split(".").map(Number);
const skip =
  process.platform === "win32"
    ? "POSIX-skript (Windows testes manuelt)"
    : major < 18 || (major === 18 && minor < 18)
      ? "--import krever Node >= 18.18"
      : false;

const ORIGIN = "https://canvas.test";
const sub = (userId, name, url) => ({
  user_id: userId,
  user: { name },
  workflow_state: "submitted",
  grade: null,
  score: null,
  url,
});
const SCENARIO = {
  origin: ORIGIN,
  courses: [{ id: 1, name: "Testkurs" }],
  assignments: {
    1: [{ id: 10, name: "Oppgave A", due_at: null, needs_grading_count: 3, submission_types: ["online_url"] }],
  },
  submissions: {
    "1:10": [
      sub(1, "Ola Offentlig", "https://github.com/ola/x"),
      sub(2, "Pia Privat", "https://github.com/pia/hemmelig"),
      sub(3, "Nils Nett", "https://github.com/nils/nett"),
    ],
  },
};

// pia/* oppfører seg som et privat repo uten pålogging, nils/* som nettverksfeil.
const FAKE_GIT = `#!${process.execPath}
const fs = require("node:fs");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("git version 0.0.0-fake"); process.exit(0); }
if (a.includes("clone")) {
  const dest = a[a.length - 1];
  const url = a[a.length - 2];
  fs.mkdirSync(dest, { recursive: true });
  if (url.includes("/pia/")) {
    process.stderr.write("fatal: could not read Username for 'https://github.com': terminal prompts disabled\\n");
    process.exit(128);
  }
  if (url.includes("/nils/")) {
    process.stderr.write("fatal: unable to access: Could not resolve host: github.com\\n");
    process.exit(128);
  }
  fs.writeFileSync(dest + "/REPO_ID", url);
  process.exit(0);
}
process.exit(1);
`;
const FAKE_EDITOR = `#!${process.execPath}\n`;

test("e2e: privat repo -> «uten tilgang» i uten_lenke.txt og utskrift; nettverksfeil beholder klone-feil", { skip }, async () => {
  const base = mkdtempSync(path.join(tmpdir(), "cc-e2e-na-"));
  const home = path.join(base, "home");
  const xdg = path.join(home, ".config");
  const fakeBin = path.join(base, "fakebin");
  const work = path.join(base, "work");
  const logs = path.join(base, "logs");
  let child;
  try {
    for (const d of [home, xdg, fakeBin, work, logs, path.join(xdg, "canvas-clone")]) mkdirSync(d, { recursive: true });
    writeFileSync(path.join(fakeBin, "git"), FAKE_GIT);
    writeFileSync(path.join(fakeBin, "fakeedit"), FAKE_EDITOR);
    chmodSync(path.join(fakeBin, "git"), 0o755);
    chmodSync(path.join(fakeBin, "fakeedit"), 0o755);
    writeFileSync(
      path.join(xdg, "canvas-clone", "config.json"),
      JSON.stringify({ canvasUrl: ORIGIN, canvasToken: "tok", editor: null })
    );
    writeFileSync(path.join(logs, "scenario.json"), JSON.stringify(SCENARIO));
    const root = path.join(home, "canvas-clone", "grading");

    child = spawn(process.execPath, ["--import", FAKE_FETCH, BIN, "--course", "1", "--all", "--open", "fakeedit"], {
      cwd: work,
      env: {
        HOME: home,
        XDG_CONFIG_HOME: xdg,
        PATH: fakeBin,
        NO_COLOR: "1",
        FAKE_CANVAS: path.join(logs, "scenario.json"),
        FAKE_FETCH_LOG: path.join(logs, "fetch.log"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = { stdout: "", stderr: "" };
    child.stdout.on("data", (d) => (out.stdout += d));
    child.stderr.on("data", (d) => (out.stderr += d));
    const done = new Promise((resolve) => child.on("close", (code) => resolve(code)));
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 20000);
    watchdog.unref();

    const start = Date.now();
    while (!/Trykk Enter/.test(out.stdout)) {
      if (Date.now() - start > 15000) throw new Error(`tidsavbrudd: venter på Enter-melding\n${out.stdout}\n${out.stderr}`);
      await new Promise((r) => setTimeout(r, 25));
    }

    const [session] = readdirSync(root);
    const dir = path.join(root, session, "10");
    assert.deepEqual(readdirSync(dir).sort(), ["ola_x", "uten_lenke.txt"]);
    const log = readFileSync(path.join(dir, "uten_lenke.txt"), "utf8");
    assert.match(log, /^pia\tuten tilgang: pia\/hemmelig \(privat, slettet eller feilstavet repo\)$/m);
    assert.match(log, /^nils\tklone-feil: nils\/nett \(fatal: unable to access: Could not resolve host: github\.com\)$/m);
    assert.doesNotMatch(log, /terminal prompts disabled/);
    const all = out.stdout + out.stderr;
    assert.match(all, /Uten tilgang til pia\/hemmelig/);
    assert.doesNotMatch(all, /terminal prompts disabled/);

    child.stdin.write("\n");
    assert.equal(await done, 0, out.stderr);
    clearTimeout(watchdog);
    assert.deepEqual(readdirSync(root), []);
    assert.equal(existsSync(path.join(work, "grading")), false);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    rmSync(base, { recursive: true, force: true });
  }
});
