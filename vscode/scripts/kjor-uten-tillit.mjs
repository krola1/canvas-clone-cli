// Kjører røyktesten i et VS Code-vindu UTEN tillit (D0 i, kritikers B1).
// @vscode/test-electron sin runTests legger alltid til
// --disable-workspace-trust, så her startes VS Code direkte (uten shell) med
// en egen --user-data-dir under .vscode-test/ der øktmappen aldri er betrodd.
// D4: workspace-mappen er en ekte økt (med falskt elevrepo) i et eget HOME
// under .vscode-test/hjem-uten-tillit (vsc-tests/hjelpere/testhjem.mjs, som
// tømmer det via safeRemove). Ingen annen sletting her.
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { lagTesthjem } from "../vsc-tests/hjelpere/testhjem.mjs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, ".vscode-test");
const exe = await downloadAndUnzipVSCode({ version: "1.100.0", cachePath: cache });
const hjem = lagTesthjem("uten-tillit", { medOkt: true });

const args = [
  hjem.okt.sti,
  "--no-sandbox",
  "--disable-gpu-sandbox",
  "--disable-updates",
  "--skip-welcome",
  "--skip-release-notes",
  "--disable-extensions", // T19
  "--use-inmemory-secretstorage", // aldri lærerens nøkkelring (D3)
  `--user-data-dir=${join(cache, "user-data-uten-tillit")}`,
  `--extensions-dir=${join(cache, "extensions-uten-tillit")}`,
  `--extensionDevelopmentPath=${root}`,
  `--extensionTestsPath=${join(root, "vsc-tests", "uten-tillit", "index.js")}`,
];

const child = spawn(exe, args, { stdio: "inherit", env: { ...process.env, ...hjem.env } });
child.on("exit", (code, signal) => {
  console.log(`VS Code (uten tillit) avsluttet: kode ${code}, signal ${signal}`);
  process.exit(code ?? 1);
});
