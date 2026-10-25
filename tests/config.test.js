import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { configDir } from "../src/config.js";

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
