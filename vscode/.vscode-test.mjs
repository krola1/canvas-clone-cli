// Konfig for @vscode/test-cli (`npm test` i vscode/). Testene ligger i
// vsc-tests/ og heter *.vsctest.js, slik at rot-`npm test` (`node --test`)
// ikke plukker dem opp (kritikers BF3).
//
// Merk: @vscode/test-electron legger alltid til --disable-workspace-trust,
// så denne kjøringen er "betrodd". Kjøringen uten tillit (D0 i) har egen
// starter: scripts/kjor-uten-tillit.mjs (`npm run test:uten-tillit`).
import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    label: "minimum",
    files: "vsc-tests/*.vsctest.js",
    // Laveste støttede versjon (engines.vscode ^1.100.0): CJS-bundelen skal
    // lastes her (D0 h).
    version: "1.100.0",
    workspaceFolder: "vsc-tests/fixtures/okt",
    // T19: andre installerte utvidelser skal ikke lastes.
    // --use-inmemory-secretstorage: SecretStorage bare i minnet, så testene
    // aldri rører lærerens nøkkelring eller en password-store fra
    // ~/.vscode/argv.json (som leses uansett --user-data-dir, se D0 c).
    launchArgs: ["--disable-extensions", "--use-inmemory-secretstorage"],
    mocha: { ui: "tdd", timeout: 20000 },
  },
]);
