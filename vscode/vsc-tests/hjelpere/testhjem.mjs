// Eget HOME for VS Code-testkjøringene (D4), under vscode/.vscode-test/hjem-<navn>/.
// - Øktroten (~/canvas-clone/vscode) blir da testens egen, så hovedvinduets
//   opprydding i testene aldri ser lærerens ekte økter.
// - VS Code leser ~/.vscode/argv.json fra dette HOME, ikke lærerens (D3-funn).
// Mappen tømmes ved start av hver kjøring via safeRemove (prosjektregelen:
// all sletting via src/storage.js). Bare falske data (T19).
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
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
  return { hjem, okt, env: { HOME: hjem, USERPROFILE: hjem } };
}
