import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractRepo, isValidOwner, isValidRepoName, cloneRepo } from "../src/github.js";

test("extractRepo: finner eier/repo fra en vanlig github.com-lenke", () => {
  assert.equal(extractRepo("Her er koden min: https://github.com/krola1/eksempel"), "krola1/eksempel");
});

test("extractRepo: fjerner .git-suffiks fra en github.com-lenke", () => {
  assert.equal(extractRepo("https://github.com/krola1/eksempel.git"), "krola1/eksempel");
});

test("extractRepo: utleder eier/repo fra bruker.github.io/repo", () => {
  assert.equal(extractRepo("Demo her: https://krola1.github.io/eksempel"), "krola1/eksempel");
});

test("extractRepo: antar bruker/bruker.github.io når pages-lenken er uten repo-sti", () => {
  assert.equal(extractRepo("Se https://krola1.github.io"), "krola1/krola1.github.io");
});

test("extractRepo: prioriterer github.com fremfor github.io når begge finnes", () => {
  assert.equal(
    extractRepo("Pages: https://krola1.github.io/eksempel Repo: https://github.com/krola1/annet-repo"),
    "krola1/annet-repo"
  );
});

test("extractRepo: returnerer null når ingen lenke finnes", () => {
  assert.equal(extractRepo("Ingen lenke her, bare tekst."), null);
});

test("extractRepo: returnerer null for tom/manglende tekst", () => {
  assert.equal(extractRepo(""), null);
  assert.equal(extractRepo(undefined), null);
});

// Regresjonstest for gist-bugen: en gist.github.com-lenke skal IKKE
// feiltolkes som en github.com/eier/repo-lenke (regexen matchet tidligere
// "github.com/..." som substreng av "gist.github.com/..."). Skal falle
// videre til github.io-sjekken (som heller ikke treffer), og dermed ende opp
// som "ingen lenke funnet" - samme vei som annen tekst uten gyldig lenke.
test("extractRepo: feiltolker ikke en gist.github.com-lenke som et repo", () => {
  assert.equal(extractRepo("Her er en gist: https://gist.github.com/krola1/abc123def456"), null);
});

test("extractRepo: gist.github.com-lenke blokkerer ikke en ekte github.com-lenke lenger ut i teksten", () => {
  assert.equal(
    extractRepo("Se gist https://gist.github.com/krola1/abc123 men repoet er https://github.com/krola1/ekte-repo"),
    "krola1/ekte-repo"
  );
});

test("isValidOwner: avviser _, ., bindestrek først/sist, doble bindestreker og >39 tegn", () => {
  assert.equal(isValidOwner("ola-dev"), true);
  assert.equal(isValidOwner("a".repeat(39)), true);
  assert.equal(isValidOwner("a".repeat(40)), false);
  assert.equal(isValidOwner("ola_dev"), false);
  assert.equal(isValidOwner("ola.dev"), false);
  assert.equal(isValidOwner("-ola"), false);
  assert.equal(isValidOwner("ola-"), false);
  assert.equal(isValidOwner("ola--dev"), false);
  assert.equal(isValidOwner(""), false);
  assert.equal(isValidOwner(".."), false);
});

test("isValidRepoName: avviser ., .., bindestrek først og ugyldige tegn", () => {
  assert.equal(isValidRepoName("mitt_repo.v2-x"), true);
  assert.equal(isValidRepoName("."), false);
  assert.equal(isValidRepoName(".."), false);
  assert.equal(isValidRepoName("-x"), false);
  assert.equal(isValidRepoName("a".repeat(101)), false);
  assert.equal(isValidRepoName("a b"), false);
});

test("extractRepo: ugyldige lenker gir null (uten lenke)", () => {
  assert.equal(extractRepo("https://github.com/../x"), null);
  assert.equal(extractRepo("https://github.com/ola/.."), null);
  assert.equal(extractRepo("https://github.com/ola/."), null);
  assert.equal(extractRepo("https://github.com/-ola/x"), null);
  assert.equal(extractRepo("https://github.com/ola/-x"), null);
  assert.equal(extractRepo("https://github.com/ola_dev/x"), null);
  assert.equal(extractRepo(`https://github.com/${"a".repeat(40)}/x`), null);
});

test("extractRepo: ugyldig lenke først, gyldig lenke senere -> gyldig", () => {
  assert.equal(extractRepo("https://github.com/../x og https://github.com/ola/ekte"), "ola/ekte");
  assert.equal(extractRepo("https://github.com/-x/y https://ola.github.io/side"), "ola/side");
});

function withFakeGit(script, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-fakegit-"));
  const git = path.join(dir, "git");
  writeFileSync(git, `#!${process.execPath}\n${script}\n`);
  chmodSync(git, 0o755);
  const savedPath = process.env.PATH;
  process.env.PATH = dir;
  try {
    return fn(dir);
  } finally {
    process.env.PATH = savedPath;
    rmSync(dir, { recursive: true, force: true });
  }
}

test(
  "cloneRepo: git drept av SIGINT -> interrupted, ingen gh, halvferdig mappe ryddet",
  { skip: process.platform === "win32" ? "POSIX-skript" : false },
  () => {
    withFakeGit(
      `const fs=require("node:fs");const d=process.argv[process.argv.length-1];fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+"/halv","x");process.kill(process.pid,"SIGINT");`,
      (dir) => {
        // En falsk gh som ville lagt igjen et spor hvis den ble kalt.
        const gh = path.join(dir, "gh");
        writeFileSync(gh, `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(path.join(dir, "gh-kalt"))},"1")\n`);
        chmodSync(gh, 0o755);
        const root = mkdtempSync(path.join(tmpdir(), "cc-root-"));
        try {
          const dest = path.join(root, "s", "ola_x");
          mkdirSync(path.dirname(dest), { recursive: true });
          const res = cloneRepo("ola/x", dest, root);
          assert.equal(res.ok, false);
          assert.equal(res.interrupted, true);
          assert.equal(existsSync(dest), false);
          assert.equal(existsSync(path.join(dir, "gh-kalt")), false);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    );
  }
);

test(
  "cloneRepo: sender -- før url, og avviser ugyldig repo uten å kalle git",
  { skip: process.platform === "win32" ? "POSIX-skript" : false },
  () => {
    withFakeGit(
      `const fs=require("node:fs");const a=process.argv.slice(2);const d=a[a.length-1];fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+"/args.json",JSON.stringify(a));`,
      () => {
        const root = mkdtempSync(path.join(tmpdir(), "cc-root-"));
        try {
          const dest = path.join(root, "ola_x");
          assert.deepEqual(cloneRepo("ola/x", dest, root), { ok: true, via: "git" });
          const args = JSON.parse(readFileSync(path.join(dest, "args.json"), "utf8"));
          assert.deepEqual(args, ["clone", "--quiet", "--", "https://github.com/ola/x.git", dest]);
          assert.equal(cloneRepo("../x", path.join(root, "y"), root).ok, false);
          assert.equal(existsSync(path.join(root, "y")), false);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    );
  }
);
