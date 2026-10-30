// finnGit i VS Code-utvidelsen (vscode/src/git-sti.mjs, D5 / D0 j): full sti
// til git uten skall, med Program Files på Windows og xcode-select-sjekken på
// macOS. Filsystemet og xcode-select byttes ut, så testene virker på alle OS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { finnGit, iPath } from "../vscode/src/git-sti.mjs";

const finnes = (...stier) => (p) => stier.includes(p);

test("Linux: første git i PATH; relative PATH-oppføringer hoppes over", () => {
  const env = { PATH: ".:/opt/a:/usr/bin" };
  assert.equal(finnGit({ env, platform: "linux", erFil: finnes("/usr/bin/git", "./git") }), "/usr/bin/git");
  assert.equal(finnGit({ env, platform: "linux", erFil: finnes("/opt/a/git", "/usr/bin/git") }), "/opt/a/git");
  assert.equal(finnGit({ env, platform: "linux", erFil: finnes() }), null);
  assert.equal(finnGit({ env: {}, platform: "linux", erFil: finnes("/usr/bin/git") }), null);
});

test("macOS: /usr/bin/git brukes bare med Command Line Tools; annen git uten sjekk", () => {
  const env = { PATH: "/usr/bin:/opt/homebrew/bin" };
  const erFil = finnes("/usr/bin/git");
  assert.equal(finnGit({ env, platform: "darwin", erFil, harCommandLineTools: () => false }), null);
  assert.equal(finnGit({ env, platform: "darwin", erFil, harCommandLineTools: () => true }), "/usr/bin/git");
  let spurt = false;
  const brew = finnGit({
    env: { PATH: "/opt/homebrew/bin:/usr/bin" },
    platform: "darwin",
    erFil: finnes("/opt/homebrew/bin/git", "/usr/bin/git"),
    harCommandLineTools: () => (spurt = true),
  });
  assert.equal(brew, "/opt/homebrew/bin/git");
  assert.equal(spurt, false);
});

test("Windows: Git for Windows under Program Files først, så git.exe i PATH (aldri .cmd)", () => {
  const env = {
    ProgramW6432: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\l\\AppData\\Local",
    Path: "C:\\tools;C:\\Windows",
  };
  assert.equal(
    finnGit({ env, platform: "win32", erFil: finnes("C:\\Program Files\\Git\\cmd\\git.exe", "C:\\tools\\git.exe") }),
    "C:\\Program Files\\Git\\cmd\\git.exe",
  );
  assert.equal(
    finnGit({ env, platform: "win32", erFil: finnes("C:\\Users\\l\\AppData\\Local\\Programs\\Git\\cmd\\git.exe") }),
    "C:\\Users\\l\\AppData\\Local\\Programs\\Git\\cmd\\git.exe",
  );
  assert.equal(finnGit({ env, platform: "win32", erFil: finnes("C:\\tools\\git.exe", "C:\\tools\\git.cmd") }), "C:\\tools\\git.exe");
  assert.equal(finnGit({ env, platform: "win32", erFil: finnes("C:\\tools\\git.cmd") }), null);
  assert.equal(iPath("git.exe", { env: { PATH: "relativ;C:\\x" }, platform: "win32", erFil: finnes("relativ\\git.exe") }), null);
});
