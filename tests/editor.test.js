import { test } from "node:test";
import assert from "node:assert/strict";
import { planOpen } from "../src/editor.js";

test("planOpen win32: skriver ut kommandoen, starter aldri en prosess", () => {
  const plan = planOpen("code", "C:\\Users\\Ola\\canvas-clone\\grading\\s\\1\\ola_x", "win32");
  assert.equal(plan.spawn, undefined);
  assert.equal(plan.print, 'code "C:\\Users\\Ola\\canvas-clone\\grading\\s\\1\\ola_x"');
});

test("planOpen win32: også for andre editorer og full sti", () => {
  const plan = planOpen("C:\\Program Files\\Zed\\zed.exe", "C:\\x", "win32");
  assert.equal(plan.spawn, undefined);
  assert.ok(plan.print);
});

test("planOpen POSIX: spawn med editor og sti som eget argument (uten shell)", () => {
  for (const platform of ["linux", "darwin"]) {
    assert.deepEqual(planOpen("code", "/home/ola/x", platform), { spawn: ["code", ["/home/ola/x"]] });
    assert.deepEqual(planOpen("/usr/local/bin/zed", "/tmp/a b;rm -rf ~", platform), {
      spawn: ["/usr/local/bin/zed", ["/tmp/a b;rm -rf ~"]],
    });
  }
});
