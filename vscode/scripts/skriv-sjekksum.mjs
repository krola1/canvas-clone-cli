// Skriver SHA-256 av den faktiske .vsix-fila til <pakke>.vsix.sha256 ved siden
// av den, i formatet `sha256sum -c` godtar (D7b, tilsynets T14). Siste steg i
// scripts/release-check.mjs; kan også kjøres alene etter pakkesjekken.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vsixFilnavn, sjekksumFilnavn, sha256Hex, sjekksumLinje } from "./sjekksum.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const vsix = vsixFilnavn(pkg);
const vsixSti = join(root, vsix);
if (!existsSync(vsixSti)) {
  console.error(`fant ikke ${vsixSti} - kjør \`npm run package\` først`);
  process.exit(1);
}
const linje = sjekksumLinje(sha256Hex(readFileSync(vsixSti)), vsix);
const sjekksumSti = join(root, sjekksumFilnavn(vsix));
writeFileSync(sjekksumSti, linje);
console.log(`${linje.trimEnd()}\nskrevet til ${sjekksumSti}`);
