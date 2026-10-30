// D7b: sjekksumfila for .vsix (vscode/scripts/sjekksum.mjs). Formatet skal
// være det `sha256sum -c` godtar, og filnavnet det `vsce package` gir pakken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vsixFilnavn, sjekksumFilnavn, sha256Hex, sjekksumLinje } from "../vscode/scripts/sjekksum.mjs";

test("vsixFilnavn og sjekksumFilnavn følger <name>-<version>.vsix(.sha256)", () => {
  const vsix = vsixFilnavn({ name: "canvas-clone-vscode", version: "0.1.0" });
  assert.equal(vsix, "canvas-clone-vscode-0.1.0.vsix");
  assert.equal(sjekksumFilnavn(vsix), "canvas-clone-vscode-0.1.0.vsix.sha256");
  assert.throws(() => vsixFilnavn({ name: "x" }));
  assert.throws(() => vsixFilnavn(null));
});

test("sha256Hex gir kjent sum (tom streng og 'abc')", () => {
  assert.equal(sha256Hex(Buffer.alloc(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sjekksumLinje: <hash>, to mellomrom, filnavn, linjeskift", () => {
  const hex = sha256Hex(Buffer.from("abc"));
  assert.equal(sjekksumLinje(hex, "a.vsix"), `${hex}  a.vsix\n`);
  assert.match(sjekksumLinje(hex, "a.vsix"), /^[0-9a-f]{64} {2}[^\s/\\]+\n$/);
});

test("sjekksumLinje avviser ugyldig hash og filnavn med mappe eller linjeskift", () => {
  const hex = "a".repeat(64);
  assert.throws(() => sjekksumLinje("A".repeat(64), "a.vsix"));
  assert.throws(() => sjekksumLinje("a".repeat(63), "a.vsix"));
  assert.throws(() => sjekksumLinje(hex, ""));
  assert.throws(() => sjekksumLinje(hex, "dist/a.vsix"));
  assert.throws(() => sjekksumLinje(hex, "dist\\a.vsix"));
  assert.throws(() => sjekksumLinje(hex, "a.vsix\nb"));
});
