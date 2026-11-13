// 0.4.0 (plan G3, tilsynets O4 revidert): den felles definisjonen av «levert» i
// VS Code-utvidelsen (vscode/src/levert.mjs), og en statisk sjekk av at ingen kode i
// vscode/src/ lenger bruker Canvas sin `unsubmitted`-tilstand (kommentarer unntatt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { erLevert } from "../vscode/src/levert.mjs";

test("erLevert: sann bare når submittedAt er en ikke-tom streng; ingen reserveregel via workflowState", () => {
  assert.equal(erLevert({ submittedAt: "2026-11-01T08:00:00Z" }), true);
  assert.equal(erLevert({ submittedAt: "2026-11-01T08:00:00Z", workflowState: "unsubmitted" }), true);
  assert.equal(erLevert({ submittedAt: null }), false);
  assert.equal(erLevert({ submittedAt: null, workflowState: "graded", currentGrade: "B" }), false, "karakter uten innlevering");
  assert.equal(erLevert({ submittedAt: null, workflowState: "submitted" }), false);
  assert.equal(erLevert({ submittedAt: "" }), false);
  assert.equal(erLevert({ submittedAt: 0 }), false);
  assert.equal(erLevert({ submittedAt: true }), false);
});

test("erLevert: kaster når submittedAt mangler (undefined) eller innleveringen mangler — aldri en gjetning", () => {
  assert.throws(() => erLevert({ workflowState: "submitted" }), /submittedAt/);
  assert.throws(() => erLevert({ submittedAt: undefined, workflowState: "graded" }), /submittedAt/);
  assert.throws(() => erLevert(undefined), TypeError);
  assert.throws(() => erLevert(null), TypeError);
  // Feilmeldingen har ingen elevdata (den kan havne i en «uventet feil»-melding).
  try {
    erLevert({ studentName: "ELEV-VAKT", workflowState: "submitted" });
  } catch (err) {
    assert.ok(!String(err.message).includes("ELEV-VAKT"));
  }
});

// Fjerner kommentarer: blokkommentarer, linjer som starter med `//`, og `//` etter
// kode når det står med mellomrom foran (ikke `https://` i en streng).
function utenKommentarer(kilde) {
  return kilde
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((linje) => (/^\s*\/\//.test(linje) ? "" : linje.replace(/\s\/\/\s.*$/, "")))
    .join("\n");
}

test("statisk (plan G3): «unsubmitted» finnes ikke i koden i vscode/src/ (kommentarer unntatt)", () => {
  const mappe = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vscode", "src");
  const filer = readdirSync(mappe).filter((f) => /\.(m?js)$/.test(f));
  assert.ok(filer.includes("levert.mjs") && filer.includes("bla.mjs") && filer.includes("panel.mjs"), "testen må faktisk se på filene");
  const treff = filer.filter((f) => /unsubmitted/.test(utenKommentarer(readFileSync(path.join(mappe, f), "utf8"))));
  assert.deepEqual(treff, []);
  // Vakt for selve fjerningen: kode med ordet blir funnet, kommentarer ikke.
  assert.match(utenKommentarer('const a = s.workflowState === "unsubmitted"; // x'), /unsubmitted/);
  assert.doesNotMatch(utenKommentarer("// unsubmitted\n/* unsubmitted */\nconst u = \"https://x\"; // unsubmitted"), /unsubmitted/);
});
