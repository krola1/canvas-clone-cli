import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCategoryTree } from "../src/categories.js";

function a(id, name, needsGrading = 0) {
  return { id, name, dueAt: null, needsGrading };
}

test("buildCategoryTree: grupperer oppgaver med modul-nivå under fagretning -> modul", () => {
  const assignments = [a(1, "Frontend modul 1: Layout", 2), a(2, "Frontend modul 2: State", 0)];
  const { categories, uncategorized } = buildCategoryTree(assignments);

  assert.equal(uncategorized.length, 0);
  assert.equal(categories.length, 1);
  const [frontend] = categories;
  assert.equal(frontend.fagretning, "Frontend");
  assert.equal(frontend.hasSubmodules, true);
  assert.equal(frontend.all.length, 2);
  assert.equal(frontend.needsGrading, 2);
  assert.deepEqual([...frontend.modulMap.keys()].sort(), ["modul 1", "modul 2"]);
});

test("buildCategoryTree: ett-nivå fagretning (ingen modul) får hasSubmodules=false", () => {
  const assignments = [a(1, "SQL Oppgave 1", 1), a(2, "SQL Oppgave 2", 0)];
  const { categories } = buildCategoryTree(assignments);

  assert.equal(categories.length, 1);
  assert.equal(categories[0].fagretning, "SQL");
  assert.equal(categories[0].hasSubmodules, false);
  assert.equal(categories[0].all.length, 2);
});

test("buildCategoryTree: tier-mønster (Basic/Advanced/...) brukes som modul", () => {
  const assignments = [a(1, "Javascript Basic", 1)];
  const { categories } = buildCategoryTree(assignments);

  assert.equal(categories.length, 1);
  assert.equal(categories[0].fagretning, "Javascript");
  assert.equal(categories[0].hasSubmodules, true);
  assert.deepEqual([...categories[0].modulMap.keys()], ["Basic"]);
});

test("buildCategoryTree: en oppgave kan havne i flere fagretninger samtidig", () => {
  const assignments = [a(1, "Frontend modul 1 & Fullstack modul 1: Oppgave", 1)];
  const { categories } = buildCategoryTree(assignments);

  const names = categories.map((c) => c.fagretning).sort();
  assert.deepEqual(names, ["Frontend", "Fullstack"]);
  // Samme oppgave skal telle i begge fagretningene.
  assert.equal(categories[0].all.length, 1);
  assert.equal(categories[1].all.length, 1);
});

test("buildCategoryTree: oppgaver uten treff havner i uncategorized, ikke skjult", () => {
  const assignments = [a(1, "asdf 123 øæå", 3)];
  const { categories, uncategorized } = buildCategoryTree(assignments);

  assert.equal(categories.length, 0);
  assert.equal(uncategorized.length, 1);
  assert.equal(uncategorized[0].id, 1);
});

test("buildCategoryTree: tom liste gir tomt resultat", () => {
  const { categories, uncategorized } = buildCategoryTree([]);
  assert.deepEqual(categories, []);
  assert.deepEqual(uncategorized, []);
});
