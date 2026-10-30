// Eget HOME for VS Code-testkjøringene (D4), under vscode/.vscode-test/hjem-<navn>/.
// - Øktroten (~/canvas-clone/vscode) blir da testens egen, så hovedvinduets
//   opprydding i testene aldri ser lærerens ekte økter.
// - VS Code leser ~/.vscode/argv.json fra dette HOME, ikke lærerens (D3-funn).
// Mappen tømmes ved start av hver kjøring via safeRemove (prosjektregelen:
// all sletting via src/storage.js). Bare falske data (T19).
// D5: XDG_CONFIG_HOME peker inn i testhjemmet, så kurscachen (src/cache.js)
// aldri havner i lærerens ekte config-mappe. En falsk git ligger først i PATH
// (utenom Windows, der spawn uten skall ikke kan kjøre et skript som git), og
// VS Code startes med --force-disable-user-env, så login-skallet ikke kan
// bytte PATH. Den falske gitten gjør aldri nettkall.
import { mkdirSync, writeFileSync, utimesSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeRemove } from "../../../src/storage.js";
import { vscodeRot, opprettOkt, oktUndermappenavn, OKT_MARKOR } from "../../src/okter.mjs";

const vscodeDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cache = path.join(vscodeDir, ".vscode-test");

export const ELEVREPO = oktUndermappenavn("falsk-elev_falskt-repo");

// Et falskt elevrepo med alle fem `.vscode`-filene (negativ T8/T9a-test):
// hvis VS Code leste dem, ville innstillingene endret seg, tasken/launch-
// konfigurasjonen dukket opp, og task/MCP-serveren skrevet en fil i økten.
function lagElevrepo(oktSti) {
  const repo = path.join(oktSti, ELEVREPO);
  const vsc = path.join(repo, ".vscode");
  mkdirSync(vsc, { recursive: true });
  writeFileSync(path.join(repo, "index.js"), "// falsk elevkode (testdata)\nconsole.log('hei');\n");
  writeFileSync(path.join(repo, "AGENTS.md"), "Falsk instruks til KI-agenter (testdata).\n");
  const skriv = (fil) => ["-e", `require('fs').writeFileSync(${JSON.stringify(path.join(oktSti, fil))}, 'x')`];
  const json = (navn, data) => writeFileSync(path.join(vsc, navn), JSON.stringify(data, null, 2));
  json("settings.json", {
    "editor.tabSize": 7,
    "workbench.localHistory.enabled": true,
    "canvasClone.elevInnstilling": "elev",
  });
  json("tasks.json", {
    version: "2.0.0",
    tasks: [
      {
        label: "ELEVTASK",
        type: "process",
        command: process.execPath,
        args: skriv("ELEV_TASK_KJORTE"),
        runOptions: { runOn: "folderOpen" },
      },
    ],
  });
  json("launch.json", {
    version: "0.2.0",
    configurations: [{ name: "ELEVLAUNCH", type: "node", request: "launch", program: "index.js" }],
  });
  json("extensions.json", { recommendations: ["falsk.anbefalt-utvidelse"] });
  json("mcp.json", { servers: { elev: { type: "stdio", command: process.execPath, args: skriv("ELEV_MCP_KJORTE") } } });
  return repo;
}

// Falsk git for kloning i testene (D5): lager mappen og skriver URL-en i
// REPO_ID, logger argumentene og noen miljøvariabler til ~/falsk-git.log.
// «elevvakt-privat» gir «Repository not found» (uten tilgang), «elevvakt-feil»
// en annen feil med en stderr som aldri skal vises (T11).
const FALSK_GIT = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("git version 0.0.0-falsk"); process.exit(0); }
if (!a.includes("clone")) process.exit(1);
const dest = a[a.length - 1];
const url = a[a.length - 2];
const env = { GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT, GIT_ASKPASS: process.env.GIT_ASKPASS };
fs.appendFileSync(path.join(require("node:os").homedir(), "falsk-git.log"), JSON.stringify({ args: a, env }) + "\\n");
if (url.includes("elevvakt-privat")) {
  process.stderr.write("remote: Repository not found.\\nfatal: repository not found\\n");
  process.exit(128);
}
if (url.includes("elevvakt-feil")) {
  process.stderr.write("fatal: HEMMELIG-STDERR-VAKT unable to access\\n");
  process.exit(128);
}
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, "REPO_ID"), url);
process.exit(0);
`;

// Grafikk for testene (D5-rettingen): VS Code skal alltid havne i Xvfb, aldri på
// lærerens skjerm. xvfb-run setter DISPLAY og XAUTHORITY, men WAYLAND_DISPLAY fra
// lærerens skall arves likevel, og med en ozone-innstilling som «auto» (argv.json
// eller miljøet) ville Electron da valgt Wayland. Derfor:
// - på Linux kreves det at vi kjører under xvfb-run (XAUTHORITY fra xvfb-run),
//   ellers stopper testene før VS Code startes (DISPLAY ville vært lærerens)
// - WAYLAND_DISPLAY og ELECTRON_OZONE_PLATFORM_HINT fjernes (undefined fjerner
//   variabelen når miljøet slås sammen og sendes til spawn)
// - ozoneArgs() tvinger X11 på Linux.
export function xvfbMiljo(env = process.env, platform = process.platform) {
  if (platform === "linux" && !/[\\/]xvfb-run\.[^/\\]+[\\/]/.test(env.XAUTHORITY ?? "")) {
    throw new Error("VS Code-testene må kjøres med `xvfb-run -a` (ellers kunne vinduer åpnes på skjermen din).");
  }
  return { WAYLAND_DISPLAY: undefined, ELECTRON_OZONE_PLATFORM_HINT: undefined };
}

export function ozoneArgs(platform = process.platform) {
  return platform === "linux" ? ["--ozone-platform=x11"] : [];
}

// Skriver den falske gitten til <bin>/git (også brukt av prøveriggen). Gir stien.
export function lagFalskGit(bin) {
  mkdirSync(bin, { recursive: true });
  const git = path.join(bin, "git");
  writeFileSync(git, FALSK_GIT);
  chmodSync(git, 0o755);
  return git;
}

export function lagTesthjem(navn, { medOkt = false } = {}) {
  mkdirSync(cache, { recursive: true });
  const hjem = path.join(cache, `hjem-${navn}`);
  const res = safeRemove(cache, hjem);
  if (!res.ok) throw new Error(`kunne ikke tømme ${hjem}: ${res.code}`);
  mkdirSync(hjem);
  let okt = null;
  if (medOkt) {
    okt = opprettOkt(vscodeRot(hjem));
    lagElevrepo(okt.sti);
    // Hjerteslag i framtiden: testvinduet skal alltid få fortsette økten selv
    // om oppstarten tar tid (nedlasting i CI). Øktvinduet setter det til nå
    // ved første slag.
    const fram = new Date(Date.now() + 3_600_000);
    utimesSync(path.join(okt.sti, OKT_MARKOR), fram, fram);
  }
  const env = { HOME: hjem, USERPROFILE: hjem, XDG_CONFIG_HOME: path.join(hjem, ".config"), ...xvfbMiljo() };
  let falskGit = null;
  if (process.platform !== "win32") {
    const bin = path.join(hjem, "falsk-bin");
    falskGit = lagFalskGit(bin);
    env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ""}`;
  }
  return { hjem, okt, falskGit, env };
}
