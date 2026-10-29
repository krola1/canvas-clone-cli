import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { configDir, isHttpsUrl, ensureConfig } from "../src/config.js";
import { createStrings } from "../src/strings.js";

// configDir() leser process.env direkte ved hvert kall (ingen caching), så
// den er testbar ved å sette/fjerne env-variabler rundt hvert kall - uten å
// måtte mocke node:os (platform()/homedir() er bundet ved import-tidspunkt i
// config.js, og lar seg ikke mocke utenfra på en pålitelig måte - testen
// dekker derfor XDG-stien eksplisitt, og faller tilbake til den faktiske
// plattformens standardsti for "ingen XDG_CONFIG_HOME satt").

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("configDir: bruker XDG_CONFIG_HOME/canvas-clone når XDG_CONFIG_HOME er satt", () => {
  withEnv({ XDG_CONFIG_HOME: "/tmp/mitt-xdg-config" }, () => {
    assert.equal(configDir(), join("/tmp/mitt-xdg-config", "canvas-clone"));
  });
});

test("configDir: faller tilbake til plattformens standardsti når XDG_CONFIG_HOME ikke er satt", () => {
  withEnv({ XDG_CONFIG_HOME: undefined }, () => {
    const dir = configDir();
    if (platform() === "win32") {
      assert.equal(dir, join(process.env.APPDATA || homedir(), "canvas-clone"));
    } else if (platform() === "darwin") {
      assert.equal(dir, join(homedir(), "Library", "Application Support", "canvas-clone"));
    } else {
      assert.equal(dir, join(homedir(), ".config", "canvas-clone"));
    }
  });
});

test("configDir: ulike XDG_CONFIG_HOME-verdier gir ulike stier", () => {
  const a = withEnv({ XDG_CONFIG_HOME: "/tmp/a" }, () => configDir());
  const b = withEnv({ XDG_CONFIG_HOME: "/tmp/b" }, () => configDir());
  assert.notEqual(a, b);
});

test("isHttpsUrl: bare https:// godtas", () => {
  assert.equal(isHttpsUrl("https://skole.instructure.com"), true);
  assert.equal(isHttpsUrl("http://skole.instructure.com"), false);
  assert.equal(isHttpsUrl("HTTP://x"), false);
  assert.equal(isHttpsUrl("skole.instructure.com"), false);
  assert.equal(isHttpsUrl("https://"), false);
});

test("ensureConfig: eksisterende http://-config avvises med beskjed om --setup", async () => {
  const xdg = mkdtempSync(join(tmpdir(), "cc-config-"));
  try {
    mkdirSync(join(xdg, "canvas-clone"));
    writeFileSync(
      join(xdg, "canvas-clone", "config.json"),
      JSON.stringify({ canvasUrl: "http://skole.example", canvasToken: "tok" })
    );
    const t = createStrings(false);
    await withEnv({ XDG_CONFIG_HOME: xdg }, () =>
      assert.rejects(ensureConfig({ t }), /--setup/)
    );
  } finally {
    rmSync(xdg, { recursive: true, force: true });
  }
});
