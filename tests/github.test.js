import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRepo } from "../src/github.js";

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
