import { test } from "node:test";
import assert from "node:assert/strict";
import { findByGithub, resolveGradeTarget, labelWithDuplicates, displayName } from "../src/grading.js";
import { createStrings } from "../src/strings.js";

const subs = [
  { studentName: "Ola Nordmann", owner: "oladev", userId: 1 },
  { studentName: "Kari Nordmann", owner: "OlaDev", userId: 2 },
  { studentName: "Per Hansen", owner: "perh", userId: 3 },
  { studentName: "Uten Lenke", owner: null, userId: 4 },
];

test("findByGithub: finner ALLE treff, case-insensitivt", () => {
  const m = findByGithub(subs, "OLADEV");
  assert.deepEqual(
    m.map((s) => s.userId),
    [1, 2]
  );
  assert.deepEqual(findByGithub(subs, "perh").map((s) => s.userId), [3]);
  assert.deepEqual(findByGithub(subs, "ingen"), []);
  assert.deepEqual(findByGithub(subs, ""), []);
});

test("resolveGradeTarget: none / single", () => {
  assert.equal(resolveGradeTarget({ matches: [], isTTY: true, confirm: true }).kind, "none");
  const single = resolveGradeTarget({ matches: [subs[2]], isTTY: false, confirm: true });
  assert.equal(single.kind, "single");
  assert.equal(single.target.userId, 3);
});

test("resolveGradeTarget: flere treff uten TTY -> abort-ambiguous, uansett --confirm", () => {
  const two = [subs[0], subs[1]];
  assert.equal(resolveGradeTarget({ matches: two, isTTY: false, confirm: true }).kind, "abort-ambiguous");
  assert.equal(resolveGradeTarget({ matches: two, isTTY: false, confirm: false }).kind, "abort-ambiguous");
});

test("resolveGradeTarget: flere treff med TTY -> preview uten --confirm, choose med", () => {
  const two = [subs[0], subs[1]];
  assert.equal(resolveGradeTarget({ matches: two, isTTY: true, confirm: false }).kind, "preview-ambiguous");
  assert.equal(resolveGradeTarget({ matches: two, isTTY: true, confirm: true }).kind, "choose");
});

test("labelWithDuplicates: Canvas-navn i parentes bare ved duplikat visningsnavn", () => {
  const list = [
    { studentName: "Ola Nordmann", owner: "ola" },
    { studentName: "Kari Nordmann", owner: "ola" },
    { studentName: "Per Hansen", owner: "perh" },
  ];
  assert.deepEqual(labelWithDuplicates(list, { displayName: "github" }), [
    "ola (Ola Nordmann)",
    "ola (Kari Nordmann)",
    "perh",
  ]);
});

test("labelWithDuplicates: med displayName=canvas og like Canvas-navn brukes GitHub-navnet som skille", () => {
  const list = [
    { studentName: "Ola Nordmann", owner: "ola1" },
    { studentName: "Ola Nordmann", owner: "ola2" },
    { studentName: "Per Hansen", owner: "perh" },
  ];
  assert.deepEqual(labelWithDuplicates(list, { displayName: "canvas" }), [
    "Ola Nordmann (ola1)",
    "Ola Nordmann (ola2)",
    "Per Hansen",
  ]);
});

test("displayName: github er default, canvas på forespørsel, Canvas-navn som fallback", () => {
  assert.equal(displayName(subs[0], {}), "oladev");
  assert.equal(displayName(subs[0], { displayName: "canvas" }), "Ola Nordmann");
  assert.equal(displayName(subs[3], {}), "Uten Lenke");
});

test("gradeConfirmSummary: viser Canvas-navn (GitHub: x) på begge språk", () => {
  for (const joe of [false, true]) {
    const t = createStrings(joe);
    const summary = t.gradeConfirmSummary(t.gradeStudentLabel("Ola Nordmann", "oladev"), "Oppg", "Kurs", "A", "");
    assert.match(summary, /Ola Nordmann \(GitHub: oladev\)/);
  }
});
