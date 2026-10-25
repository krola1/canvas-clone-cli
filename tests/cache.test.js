import { test } from "node:test";
import assert from "node:assert/strict";
import { isFresh, ageMinutes } from "../src/cache.js";

test("isFresh: null/udefinert entry er aldri fersk", () => {
  assert.equal(isFresh(null, 15), false);
  assert.equal(isFresh(undefined, 15), false);
});

test("isFresh: entry innenfor TTL er fersk", () => {
  const entry = { fetchedAt: Date.now() - 1000 }; // 1 sekund siden
  assert.equal(isFresh(entry, 15), true);
});

test("isFresh: entry eldre enn TTL er ikke fersk", () => {
  const entry = { fetchedAt: Date.now() - 20 * 60 * 1000 }; // 20 minutter siden
  assert.equal(isFresh(entry, 15), false);
});

test("isFresh: akkurat på TTL-grensen regnes som ikke lenger fersk", () => {
  const entry = { fetchedAt: Date.now() - 15 * 60 * 1000 };
  assert.equal(isFresh(entry, 15), false);
});

test("ageMinutes: runder av til nærmeste minutt", () => {
  const entry = { fetchedAt: Date.now() - 90 * 1000 }; // 1.5 minutter siden
  assert.equal(ageMinutes(entry), 2);
});

test("ageMinutes: akkurat nå gir 0", () => {
  const entry = { fetchedAt: Date.now() };
  assert.equal(ageMinutes(entry), 0);
});
