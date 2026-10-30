// Ren logikk for sjekksummen til .vsix-fila (D7b, tilsynets T14). Brukes av
// scripts/skriv-sjekksum.mjs og testes i tests/vscode-sjekksum.test.js.
//
// Formatet er det `sha256sum -c` godtar: "<64 hex>  <filnavn>\n" (to mellomrom
// = tekstmodus). Filnavnet står uten mappe, slik at fila sjekkes der den ligger
// sammen med .vsix-fila. Ingen nye avhengigheter: node:crypto.
import { createHash } from "node:crypto";

/** Navnet `vsce package` gir pakken: `<name>-<version>.vsix`. */
export function vsixFilnavn(pkg) {
  if (!pkg || typeof pkg.name !== "string" || typeof pkg.version !== "string" || !pkg.name || !pkg.version) {
    throw new Error("package.json mangler name eller version");
  }
  return `${pkg.name}-${pkg.version}.vsix`;
}

/** Sjekksumfila ligger ved siden av pakken: `<pakke>.vsix.sha256`. */
export function sjekksumFilnavn(vsixNavn) {
  return `${vsixNavn}.sha256`;
}

/** SHA-256 av innholdet, som 64 små hex-tegn. */
export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Én linje i formatet `sha256sum -c` godtar. */
export function sjekksumLinje(hex, filnavn) {
  if (typeof hex !== "string" || !/^[0-9a-f]{64}$/.test(hex)) throw new Error("ugyldig SHA-256 (skal være 64 små hex-tegn)");
  if (typeof filnavn !== "string" || !filnavn || /[\\/\r\n]/.test(filnavn)) {
    throw new Error("ugyldig filnavn (bare navnet, uten mappe eller linjeskift)");
  }
  return `${hex}  ${filnavn}\n`;
}
