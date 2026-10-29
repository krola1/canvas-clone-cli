// Kjører røyktesten i et VS Code-vindu UTEN tillit (D0 i, kritikers B1).
// @vscode/test-electron sin runTests legger alltid til
// --disable-workspace-trust, så her startes VS Code direkte (uten shell) med
// en egen --user-data-dir under .vscode-test/ der øktmappen aldri er betrodd.
// Ingen sletting her (prosjektregel: all sletting via src/storage.js).
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, ".vscode-test");
const exe = await downloadAndUnzipVSCode({ version: "1.100.0", cachePath: cache });

const args = [
  join(root, "vsc-tests", "fixtures", "okt"),
  "--no-sandbox",
  "--disable-gpu-sandbox",
  "--disable-updates",
  "--skip-welcome",
  "--skip-release-notes",
  "--disable-extensions", // T19
  `--user-data-dir=${join(cache, "user-data-uten-tillit")}`,
  `--extensions-dir=${join(cache, "extensions-uten-tillit")}`,
  `--extensionDevelopmentPath=${root}`,
  `--extensionTestsPath=${join(root, "vsc-tests", "uten-tillit", "index.js")}`,
];

const child = spawn(exe, args, { stdio: "inherit" });
child.on("exit", (code, signal) => {
  console.log(`VS Code (uten tillit) avsluttet: kode ${code}, signal ${signal}`);
  process.exit(code ?? 1);
});
