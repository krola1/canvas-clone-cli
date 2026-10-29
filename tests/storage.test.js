import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, chmodSync, symlinkSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  gradingRoot,
  assertInside,
  safeRemove,
  sanitizeFolderName,
  repoFolderName,
  createSession,
  sessionPid,
  startupCleanup,
  ensureBaseGitignore,
} from "../src/storage.js";

function tmp() {
  return mkdtempSync(path.join(tmpdir(), "cc-storage-"));
}

test("gradingRoot: ~/canvas-clone/grading, uavhengig av cwd", () => {
  assert.equal(gradingRoot("/home/x"), path.join("/home/x", "canvas-clone", "grading"));
});

test("ensureBaseGitignore: lager ~/canvas-clone/.gitignore med *", () => {
  const home = tmp();
  try {
    ensureBaseGitignore(gradingRoot(home));
    assert.equal(existsSync(path.join(home, "canvas-clone", ".gitignore")), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("assertInside: godtar sti inni roten", () => {
  const root = tmp();
  try {
    assert.ok(assertInside(root, path.join(root, "a", "b")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("assertInside: avviser roten selv, forelder, søskenmappe grading2 og absolutt sti utenfor", () => {
  const base = tmp();
  const root = path.join(base, "grading");
  mkdirSync(root);
  try {
    assert.throws(() => assertInside(root, root));
    assert.throws(() => assertInside(root, path.join(root, "..")));
    assert.throws(() => assertInside(root, base));
    assert.throws(() => assertInside(root, path.join(base, "grading2")));
    assert.throws(() => assertInside(root, path.join(base, "grading2", "x")));
    assert.throws(() => assertInside(root, "/etc"));
    assert.throws(() => assertInside(root, path.join(root, "a", "..", "..", "x")));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("assertInside (path.win32): case-insensitiv, avviser annen stasjon og grading2", () => {
  const opts = { pathMod: path.win32, platform: "win32" };
  const root = "C:\\Users\\Ola\\canvas-clone\\grading";
  assert.ok(assertInside(root, "c:\\users\\ola\\CANVAS-CLONE\\Grading\\20261027-120000-1\\x", opts));
  assert.throws(() => assertInside(root, "C:\\Users\\Ola\\canvas-clone\\grading", opts));
  assert.throws(() => assertInside(root, "c:\\users\\ola\\canvas-clone\\GRADING", opts));
  assert.throws(() => assertInside(root, "C:\\Users\\Ola\\canvas-clone\\grading2\\x", opts));
  assert.throws(() => assertInside(root, "D:\\Users\\Ola\\canvas-clone\\grading\\x", opts));
  assert.throws(() => assertInside(root, "C:\\Users\\Ola\\canvas-clone\\grading\\..\\x", opts));
});

test("safeRemove: sletter mappe inni roten og verifiserer at den er borte", () => {
  const root = tmp();
  try {
    const p = path.join(root, "s", "a");
    mkdirSync(p, { recursive: true });
    writeFileSync(path.join(p, "f.txt"), "x");
    const res = safeRemove(root, path.join(root, "s"));
    assert.equal(res.ok, true);
    assert.equal(existsSync(path.join(root, "s")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("safeRemove: nekter sti utenfor roten og rører den ikke", () => {
  const base = tmp();
  const root = path.join(base, "grading");
  const outside = path.join(base, "grading2");
  mkdirSync(root);
  mkdirSync(outside);
  try {
    const res = safeRemove(root, outside);
    assert.equal(res.ok, false);
    assert.equal(res.code, "OUTSIDE_ROOT");
    assert.equal(existsSync(outside), true);
    assert.equal(safeRemove(root, root).ok, false);
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("safeRemove: følger ikke symlenke - fjerner lenken, ikke målet", () => {
  const base = tmp();
  const root = path.join(base, "grading");
  const target = path.join(base, "viktig");
  mkdirSync(root);
  mkdirSync(target);
  writeFileSync(path.join(target, "data.txt"), "behold");
  try {
    symlinkSync(target, path.join(root, "lenke"));
    const res = safeRemove(root, path.join(root, "lenke"));
    assert.equal(res.ok, true);
    assert.equal(existsSync(path.join(target, "data.txt")), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("safeRemove: ikke-eksisterende sti er ok", () => {
  const root = tmp();
  try {
    assert.equal(safeRemove(root, path.join(root, "finnes-ikke")).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "safeRemove: returnerer {ok:false} når sletting feiler (skrivebeskyttet mappe)",
  { skip: process.getuid?.() === 0 || process.platform === "win32" ? "kjører som root / Windows" : false },
  () => {
    const root = tmp();
    const locked = path.join(root, "s", "låst");
    mkdirSync(locked, { recursive: true });
    writeFileSync(path.join(locked, "f.txt"), "x");
    chmodSync(locked, 0o500);
    try {
      const res = safeRemove(root, path.join(root, "s"));
      assert.equal(res.ok, false);
      assert.ok(res.code);
    } finally {
      chmodSync(locked, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  }
);

test("sanitizeFolderName: farlige navn blir trygge", () => {
  assert.equal(sanitizeFolderName(".."), "_");
  assert.equal(sanitizeFolderName("."), "_");
  assert.equal(sanitizeFolderName(""), "_");
  assert.equal(sanitizeFolderName("a/b\\c:d*e?f\"g<h>i|j&k^l%m!n"), "abcdefghijklmn");
  assert.equal(sanitizeFolderName("navn\x00\x1f\x7fx"), "navnx");
  assert.equal(sanitizeFolderName("slutt. . "), "slutt");
  assert.equal(sanitizeFolderName("CON"), "_CON");
  assert.equal(sanitizeFolderName("lpt1.txt"), "_lpt1.txt");
  assert.equal(sanitizeFolderName("x".repeat(80)).length, 50);
  assert.equal(sanitizeFolderName("Kurs 2026: Frontend"), "Kurs 2026 Frontend");
});

test("sanitizeFolderName: fjerner PowerShell-farlige tegn ($ ` ' ( )) - utskrevet editorkommando kan ikke kjøre kode", () => {
  assert.equal(sanitizeFolderName("$(Remove-Item x)"), "Remove-Item x");
  assert.equal(sanitizeFolderName("a`$b'c(d)e"), "abcde");
  assert.equal(sanitizeFolderName("ola_x$env:USERPROFILE"), "ola_xenvUSERPROFILE");
  for (const ch of ["$", "`", "'", "(", ")"]) {
    assert.ok(!sanitizeFolderName(`kurs${ch}navn`).includes(ch), ch);
  }
});

test("repoFolderName: eier_repo i små bokstaver, -2/-3 ved kollisjon", () => {
  const used = new Set();
  assert.equal(repoFolderName("ola", "x", used), "ola_x");
  assert.equal(repoFolderName("ola", "x", used), "ola_x-2");
  assert.equal(repoFolderName("ola", "x", used), "ola_x-3");
});

test("repoFolderName: Ola/ola kolliderer og får hver sin mappe", () => {
  const used = new Set();
  const a = repoFolderName("Ola", "x", used);
  const b = repoFolderName("ola", "x", used);
  assert.equal(a, "ola_x");
  assert.equal(b, "ola_x-2");
});

test("repoFolderName: a-b + c og a + b-c gir ulike mapper", () => {
  const used = new Set();
  assert.notEqual(repoFolderName("a-b", "c", used), repoFolderName("a", "b-c", used));
});

test("createSession/sessionPid: navn <YYYYMMDD-HHMMSS>-<pid>", () => {
  const root = path.join(tmp(), "grading");
  try {
    const s = createSession(root, { now: new Date(2026, 9, 27, 9, 5, 3), pid: 4242 });
    assert.equal(s.name, "20261027-090503-4242");
    assert.equal(existsSync(s.path), true);
    assert.equal(sessionPid(s.name), 4242);
    assert.equal(sessionPid("tilfeldig"), null);
    assert.equal(sessionPid("20261027-090503"), null);
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
});

test("startupCleanup: hopper over egen mappe og levende PID, sletter død PID, rører ikke ugyldige navn og løse filer", () => {
  const root = path.join(tmp(), "grading");
  try {
    const own = createSession(root, { pid: 100 });
    mkdirSync(path.join(root, "20260101-000000-200")); // levende
    mkdirSync(path.join(root, "20260101-000000-300")); // død
    mkdirSync(path.join(root, "20260101-000000-300", "aid", "ola_x"), { recursive: true });
    mkdirSync(path.join(root, "ugyldig-navn"));
    writeFileSync(path.join(root, "løs-fil.txt"), "x");
    const alive = new Set([200]);
    const res = startupCleanup(root, own.name, { isAlive: (pid) => alive.has(pid), ownPid: 100 });
    assert.deepEqual(
      readdirSync(root).sort(),
      [own.name, "20260101-000000-200", "ugyldig-navn", "løs-fil.txt"].sort()
    );
    assert.equal(res.removed.length, 1);
    assert.equal(res.failed.length, 0);
    assert.equal(res.unknown, 2);
    assert.equal(res.rootSymlink, false);
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
});

test("startupCleanup: rapporterer øktmapper med levende PID som ikke ble rørt", () => {
  const root = path.join(tmp(), "grading");
  try {
    const own = createSession(root, { pid: 100 });
    mkdirSync(path.join(root, "20260101-000000-200"));
    mkdirSync(path.join(root, "20260101-000000-201"));
    const res = startupCleanup(root, own.name, { isAlive: () => true, ownPid: 100 });
    assert.deepEqual(res.skippedAlive.sort(), ["20260101-000000-200", "20260101-000000-201"]);
    assert.equal(res.removed.length, 0);
    assert.equal(res.unknown, 0);
    assert.equal(readdirSync(root).length, 3);
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
});

test(
  "startupCleanup: symlenke med øktnavn slettes ikke (verken lenken eller målet), telles som ukjent",
  { skip: process.platform === "win32" ? "symlenker krever rettigheter på Windows" : false },
  () => {
    const base = tmp();
    const root = path.join(base, "grading");
    const outside = path.join(base, "utenfor");
    try {
      const own = createSession(root, { pid: 100 });
      mkdirSync(outside);
      writeFileSync(path.join(outside, "viktig.txt"), "x");
      symlinkSync(outside, path.join(root, "20260101-000000-300"));
      const res = startupCleanup(root, own.name, { isAlive: () => false, ownPid: 100 });
      assert.equal(res.removed.length, 0);
      assert.equal(res.unknown, 1);
      assert.ok(readdirSync(root).includes("20260101-000000-300"));
      assert.equal(existsSync(path.join(outside, "viktig.txt")), true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
);

test(
  "startupCleanup: roten eller forelderen er en symlenke -> ingenting slettes, rootSymlink=true",
  { skip: process.platform === "win32" ? "symlenker krever rettigheter på Windows" : false },
  () => {
    for (const linkAt of ["root", "parent"]) {
      const base = tmp();
      try {
        const real = path.join(base, "ekte");
        let root;
        if (linkAt === "root") {
          mkdirSync(real);
          mkdirSync(path.join(base, "canvas-clone"));
          root = path.join(base, "canvas-clone", "grading");
          symlinkSync(real, root);
        } else {
          mkdirSync(path.join(real, "grading"), { recursive: true });
          symlinkSync(real, path.join(base, "canvas-clone"));
          root = path.join(base, "canvas-clone", "grading");
        }
        const own = createSession(root, { pid: 100 });
        mkdirSync(path.join(root, "20260101-000000-300")); // død
        const res = startupCleanup(root, own.name, { isAlive: () => false, ownPid: 100 });
        assert.equal(res.rootSymlink, true, linkAt);
        assert.equal(res.removed.length, 0, linkAt);
        assert.ok(readdirSync(root).includes("20260101-000000-300"), linkAt);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    }
  }
);

test("startupCleanup: annen mappe med EGEN pid (forrige eier død) slettes", () => {
  const root = path.join(tmp(), "grading");
  try {
    const own = createSession(root, { pid: 100, now: new Date(2026, 0, 2) });
    mkdirSync(path.join(root, "20260101-000000-100"));
    startupCleanup(root, own.name, { isAlive: () => true, ownPid: 100 });
    assert.deepEqual(readdirSync(root), [own.name]);
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
});

test("startupCleanup: egen mappe lages før gjennomgang - en ny økt ser den og lar den være", () => {
  const root = path.join(tmp(), "grading");
  try {
    const a = createSession(root, { pid: process.pid });
    writeFileSync(path.join(a.path, "uten_lenke.txt"), "x");
    const b = createSession(root, { pid: 999999 });
    startupCleanup(root, b.name, { ownPid: 999999 }); // ekte pidAlive: process.pid lever
    assert.equal(existsSync(path.join(a.path, "uten_lenke.txt")), true);
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
});
