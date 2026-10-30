// Konfig for @vscode/test-cli (`npm test` i vscode/). Testene ligger i
// vsc-tests/ og heter *.vsctest.js, slik at rot-`npm test` (`node --test`)
// ikke plukker dem opp (kritikers BF3).
//
// Merk: @vscode/test-electron legger alltid til --disable-workspace-trust,
// så disse kjøringene er "betrodd". Kjøringen uten tillit (D0 i) har egen
// starter: scripts/kjor-uten-tillit.mjs (`npm run test:uten-tillit`).
//
// D4: hver kjøring får eget HOME under .vscode-test/ (vsc-tests/hjelpere/testhjem.mjs),
// så øktroten ~/canvas-clone/vscode og ~/.vscode/argv.json er testens egne.
import { defineConfig } from "@vscode/test-cli";
import { lagTesthjem, ozoneArgs } from "./vsc-tests/hjelpere/testhjem.mjs";

// T19: andre installerte utvidelser skal ikke lastes.
// --use-inmemory-secretstorage: SecretStorage bare i minnet, så testene
// aldri rører lærerens nøkkelring eller en password-store fra argv.json (D0 c).
// --force-disable-user-env: VS Code henter ikke miljøet fra login-skallet, så
// PATH med den falske gitten (testhjem.mjs) står seg (D5).
// lagTesthjem krever xvfb-run på Linux og fjerner WAYLAND_DISPLAY (xvfbMiljo);
// --ozone-platform=x11 tvinger Xvfb også om argv.json ber om Wayland.
const launchArgs = ["--disable-extensions", "--use-inmemory-secretstorage", "--force-disable-user-env", ...ozoneArgs()];
// Laveste støttede versjon (engines.vscode ^1.100.0): CJS-bundelen skal lastes her (D0 h).
const version = "1.100.0";
const mocha = { ui: "tdd", timeout: 20000 };

const hoved = lagTesthjem("hoved");
const okt = lagTesthjem("oktvindu", { medOkt: true });
const bla = lagTesthjem("bla");
const panel = lagTesthjem("panel");

export default defineConfig([
  {
    // Hovedvinduet: aktivering, oppsett/token (D3), opprydding og åpning av økter (D4).
    label: "minimum",
    files: "vsc-tests/*.vsctest.js",
    version,
    workspaceFolder: "vsc-tests/fixtures/okt",
    launchArgs,
    env: hoved.env,
    mocha,
  },
  {
    // Hovedvinduet, D5: bla, klone og T12 med falsk Canvas og falsk git. Egen
    // kjøring (eget VS Code, eget HOME), så T9c-flagget og øktene herfra ikke
    // påvirker D4-testene over.
    label: "bla",
    files: "vsc-tests/bla/*.vsctest.js",
    version,
    workspaceFolder: "vsc-tests/fixtures/okt",
    launchArgs,
    env: bla.env,
    mocha,
  },
  {
    // Hovedvinduet, D6b: karakterpanelet (bare visning) med falsk Canvas. Egen
    // kjøring (eget VS Code, eget HOME), så panelets generasjoner og webview ikke
    // blandes med D5-testene.
    label: "panel",
    files: "vsc-tests/panel/*.vsctest.js",
    version,
    workspaceFolder: "vsc-tests/fixtures/okt",
    launchArgs,
    env: panel.env,
    mocha,
  },
  {
    // Øktvinduet (betrodd, fordi test-electron slår av Workspace Trust): T9d,
    // hjerteslag, «Ferdig», negativ T8/T9a-test med et falskt elevrepo.
    label: "oktvindu",
    files: "vsc-tests/oktvindu/*.vsctest.js",
    version,
    workspaceFolder: okt.okt.sti,
    launchArgs,
    env: okt.env,
    mocha,
  },
]);
