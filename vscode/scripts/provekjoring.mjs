#!/usr/bin/env node
// Prøverigg for økter og sletting (D4), med to EKTE VS Code-vinduer.
// Kjøres for hånd, IKKE en del av `npm test`, og kommer ikke med i .vsix
// (.vscodeignore er en hviteliste).
//
// Bruk (Linux, krever xvfb-run, sqlite3, Node 20.15+/22.2+ for `crc32` fra
// node:zlib, og at .vsix er bygget):
//   cd vscode
//   npm run package
//   node scripts/provekjoring.mjs                 # ferdig, arvet, kryss, omstart, sovn (ca. 15 min)
//   node scripts/provekjoring.mjs ferdig arvet    # bare noen scenarioer
//   node scripts/provekjoring.mjs t18             # git uten lærerens pålogging (trenger nett mot github.com)
//
// Scenarioer:
//   ferdig  - «Ferdig»-flyten med Reload Window, negativ T8/T9a med et falskt elevrepo,
//             Local History (med positiv kontroll i hovedvinduet), «Åpne nylig» og
//             sletting av workspaceStorage/<id>/ (T11b).
//   arvet   - tillit arvet fra ~/canvas-clone: øktvinduet er betrodd, T9d vises, «Ferdig» virker.
//   kryss   - øktvinduet lukkes uten «Ferdig»: økten og workspaceStorage slettes etter ca. 3 min.
//   omstart - VS Code avsluttes med øktvinduet åpent og startes igjen etter 75 s: det
//             gjenopprettede øktvinduet lukker seg selv, økten og workspaceStorage slettes.
//   sovn    - alle VS Code-prosessene stoppes (SIGSTOP) i 210 s og fortsetter (SIGCONT):
//             økten slettes ikke, øktvinduet fortsetter, og «Ferdig» sletter den etterpå.
//   t18     - kloning med GIT_ASKPASS, VSCODE_GIT_*, SSH_ASKPASS og en global git-config med
//             insteadOf til SSH i miljøet: privat/ukjent repo gir «uten tilgang», offentlig
//             repo klones over https, og askpass/ssh kalles aldri.
//
// Sikkerhet: alt ligger under vscode/.vscode-test/provekjoring/ (gitignorert), som tømmes
// ved start via safeRemove. VS Code startes med egen --user-data-dir, --extensions-dir og
// eget HOME der, så lærerens ~/.config/Code, ~/.vscode og ~/canvas-clone røres aldri.
// Ingen shell: alle prosesser startes med spawn/spawnSync og argumentliste.
// Prøvedriver-utvidelsen (lagt inn i riggen av dette skriptet) styrer vinduene og skriver
// fakta til drv/; skriptet sjekker resultatet og skriver OK/FEIL. Bare falske data.
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { safeRemove } from "../../src/storage.js";

const VSCODE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROSJEKT = path.join(VSCODE_DIR, "..");
const CACHE = path.join(VSCODE_DIR, ".vscode-test");
const RIGG = path.join(CACHE, "provekjoring");
const HJEM = path.join(RIGG, "hjem");
const U = path.join(RIGG, "userdata");
const X = path.join(RIGG, "ext");
const DRV = path.join(RIGG, "drv");
const HOVEDMAPPE = path.join(RIGG, "hovedmappe");
const ROT = path.join(HJEM, "canvas-clone", "vscode");
const DB = path.join(U, "User", "globalStorage", "state.vscdb");
const ALLE = ["ferdig", "arvet", "kryss", "omstart", "sovn"];
const KJENTE = [...ALLE, "t18"];

const pkg = JSON.parse(readFileSync(path.join(VSCODE_DIR, "package.json"), "utf8"));
const VSIX = path.join(VSCODE_DIR, `${pkg.name}-${pkg.version}.vsix`);
const vent = (ms) => new Promise((r) => setTimeout(r, ms));
const resultater = [];
const sjekk = (scenario, ok, tekst) => {
  resultater.push({ scenario, ok, tekst });
  console.log(`${ok ? "OK  " : "FEIL"} [${scenario}] ${tekst}`);
};

// --- Forutsetninger og vakter --------------------------------------------------
const scenarioer = process.argv.slice(2).length ? process.argv.slice(2) : ALLE;
for (const s of scenarioer) if (!KJENTE.includes(s)) throw new Error(`ukjent scenario: ${s} (kjente: ${KJENTE.join(", ")})`);
if (process.platform !== "linux") throw new Error("riggen virker bare på Linux (xvfb-run, /proc)");
for (const [prog, arg] of [["xvfb-run", "--help"], ["sqlite3", "--version"]]) {
  if (spawnSync(prog, [arg], { stdio: "ignore" }).error) throw new Error(`fant ikke ${prog}`);
}
if (!existsSync(VSIX)) throw new Error(`fant ikke ${VSIX} - kjør \`npm run package\` først`);
for (const d of [HJEM, U, X, ROT]) {
  if (!path.resolve(d).startsWith(RIGG + path.sep)) throw new Error(`${d} ligger utenfor riggen`);
}
if (path.resolve(HJEM) === path.resolve(homedir())) throw new Error("HOME i riggen er lærerens ekte HOME");

// --- Riggen: tøm og bygg opp ------------------------------------------------------
mkdirSync(CACHE, { recursive: true });
const tomt = safeRemove(CACHE, RIGG);
if (!tomt.ok) throw new Error(`kunne ikke tømme ${RIGG}: ${tomt.code}`);
for (const d of [HJEM, U, X, DRV, HOVEDMAPPE, path.dirname(DB)]) mkdirSync(d, { recursive: true });

const skrivKjorbar = (fil, innhold) => {
  writeFileSync(fil, innhold);
  chmodSync(fil, 0o755);
};
skrivKjorbar(path.join(RIGG, "askpass.sh"), `#!/bin/sh\ntouch "${DRV}/ASKPASS_KALT"\necho hemmelig\n`);
skrivKjorbar(path.join(RIGG, "ssh.sh"), `#!/bin/sh\ntouch "${DRV}/SSH_KALT"\nexit 1\n`);
writeFileSync(path.join(RIGG, "gitconfig"), '[url "git@github.com:"]\n\tinsteadOf = https://github.com/\n');

// Applikasjonslagringen lages på forhånd, slik at T9c-advarselen (modal, ingen kan
// trykke under xvfb) er «vist» og riggen kan bruke den ekte canvasClone._apneOkt.
sql(
  "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);" +
    `INSERT INTO ItemTable(key, value) VALUES('krola1.canvas-clone-vscode', '{"canvasClone.oktAdvarselVist":true}');`,
);

function sql(setning) {
  const r = spawnSync("sqlite3", [DB, setning], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`sqlite3 feilet: ${r.stderr}`);
  return r.stdout;
}

// --- Prøvedriver-utvidelsen -----------------------------------------------------
const DRIVER_PKG = {
  name: "provedriver",
  publisher: "proeve",
  version: "0.0.1",
  license: "MIT",
  engines: { vscode: "^1.100.0" },
  main: "./extension.js",
  activationEvents: ["onStartupFinished"],
  capabilities: { untrustedWorkspaces: { supported: true }, virtualWorkspaces: false },
};

const DRIVER_JS = String.raw`// Prøvedriver (bare i riggen). Styrer hoved- og øktvindu etter drv/scenario.json.
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const DRV = process.env.DRV_DIR;
const logg = (...a) => fs.appendFileSync(path.join(DRV, "logg.txt"),
  new Date().toISOString() + " [" + process.pid + "] " + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n");
const fakta = (k, v) => fs.writeFileSync(path.join(DRV, "fakta-" + k + ".json"), JSON.stringify(v));
const vent = (ms) => new Promise((r) => setTimeout(r, ms));
const kjor = (id, ...a) => vscode.commands.executeCommand(id, ...a);
const flagg = (n) => path.join(DRV, "flagg-" + n);
const harFlagg = (n) => fs.existsSync(flagg(n));
const settFlagg = (n) => fs.writeFileSync(flagg(n), "x");
async function ventPaaFlagg(n, ms = 900000) { const s = Date.now() + ms; while (!harFlagg(n) && Date.now() < s) await vent(500); return harFlagg(n); }
const historikk = () => { const h = path.join(process.env.DRV_USERDATA, "User", "History"); return fs.existsSync(h) ? fs.readdirSync(h) : []; };

function lagElevrepo(okt) {
  const repo = path.join(okt, "falsk-elev_falskt-repo"); const v = path.join(repo, ".vscode");
  fs.mkdirSync(v, { recursive: true });
  fs.writeFileSync(path.join(repo, "notat.txt"), "falsk elevfil\n");
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "falsk instruks\n");
  const skriv = (f) => ["-e", "require('fs').writeFileSync(" + JSON.stringify(path.join(DRV, f)) + ",'x')"];
  const j = (n, d) => fs.writeFileSync(path.join(v, n), JSON.stringify(d));
  j("settings.json", { "editor.tabSize": 7, "workbench.localHistory.enabled": true });
  j("tasks.json", { version: "2.0.0", tasks: [{ label: "ELEVTASK", type: "process", command: process.execPath, args: skriv("ELEV_TASK_KJORTE"), runOptions: { runOn: "folderOpen" } }] });
  j("launch.json", { version: "0.2.0", configurations: [{ name: "ELEVLAUNCH", type: "node", request: "launch", program: "x.js" }] });
  j("extensions.json", { recommendations: ["falsk.anbefalt"] });
  j("mcp.json", { servers: { elev: { type: "stdio", command: process.execPath, args: skriv("ELEV_MCP_KJORTE") } } });
}

async function lagre(u, tekst) {
  if (!fs.existsSync(u.fsPath)) fs.writeFileSync(u.fsPath, "");
  const d = await vscode.workspace.openTextDocument(u); await vscode.window.showTextDocument(d);
  const e = new vscode.WorkspaceEdit(); e.insert(u, new vscode.Position(0, 0), tekst + " " + Date.now() + "\n");
  await vscode.workspace.applyEdit(e); await d.save();
}

// Følger økten til den er slettet, og kjører en rydding etterpå (skanner workspaceStorage).
async function ventPaaSletting(okt, maksMs) {
  const start = Date.now(); let ferdigSett = null;
  while (Date.now() - start < maksMs) {
    const fm = path.join(okt, ".canvas-clone-ferdig");
    if (!ferdigSett && fs.existsSync(fm)) { ferdigSett = Date.now(); logg("HOVED ser ferdig-markør"); }
    if (!fs.existsSync(okt)) break;
    await kjor("canvasClone._rydd");
    await vent(1000);
  }
  const slettet = !fs.existsSync(okt);
  fakta("slettet", { slettet, msEtterFerdig: ferdigSett ? Date.now() - ferdigSett : null, sekunder: Math.round((Date.now() - start) / 1000) });
  await vent(1000);
  logg("HOVED rydd etter sletting", await kjor("canvasClone._rydd"));
  await vent(2000);
}

async function hoved(sc) {
  logg("HOVED start", sc.navn);
  if (sc.navn === "t18") {
    fakta("env", Object.keys(process.env).filter((k) => /ASKPASS|^VSCODE_GIT|^GIT_/.test(k)));
    const gh = await import(pathToFileURL(path.join(process.env.DRV_PROSJEKT, "src", "github.js")).href);
    const root = path.join(DRV, "klonerot"); fs.mkdirSync(root, { recursive: true });
    const a = await gh.cloneRepoAsync("krola1/finnes-ikke-d4-proeve-xyz", path.join(root, "privat"), root);
    const b = await gh.cloneRepoAsync("octocat/Hello-World", path.join(root, "offentlig"), root);
    fakta("t18", { privat: a.reason ?? (a.ok ? "ok" : "?"), offentlig: b.ok ? "ok" : b.reason });
    return kjor("workbench.action.quit");
  }
  if (sc.navn === "omstart" && harFlagg("omstartet")) {
    const okt = fs.readFileSync(flagg("okt"), "utf8");
    const m1 = fs.statSync(path.join(okt, ".canvas-clone-okt")).mtimeMs;
    await vent(12000);
    const m2 = fs.existsSync(okt) ? fs.statSync(path.join(okt, ".canvas-clone-okt")).mtimeMs : null;
    fakta("omstart", { ingenHjerteslagEtterOmstart: m2 === null || m2 === m1 });
    await ventPaaSletting(okt, 400000);
    return kjor("workbench.action.quit");
  }
  // Positiv kontroll for Local History: lagring i hovedvinduet skal gi oppføring.
  await lagre(vscode.Uri.file(path.join(DRV, "kontroll-hoved.txt")), "hoved");
  await vent(3000);
  fakta("historikkHoved", historikk());
  await kjor("workbench.action.closeAllEditors");

  const okt = await kjor("canvasClone._nyOkt");
  fs.writeFileSync(flagg("okt"), okt.sti);
  lagElevrepo(okt.sti);
  logg("HOVED _apneOkt", await kjor("canvasClone._apneOkt", okt.sti));
  if (sc.navn === "omstart") {
    await ventPaaFlagg("okt-klar", 120000);
    await vent(2000);
    settFlagg("omstartet");
    return kjor("workbench.action.quit");
  }
  await ventPaaSletting(okt.sti, sc.navn === "sovn" || sc.navn === "kryss" ? 900000 : 180000);
  return kjor("workbench.action.quit");
}

async function oktvindu(sc, t) {
  const okt = vscode.workspace.workspaceFolders[0].uri.fsPath;
  logg("ØKT start", { trusted: vscode.workspace.isTrusted, tilstand: t });
  if (!t.gjenopptatt) { logg("ØKT ikke gjenopptatt"); return; }
  if (sc.navn === "omstart") { settFlagg("okt-klar"); return; }
  if (sc.navn === "ferdig" && !harFlagg("reloadet")) { settFlagg("reloadet"); return kjor("workbench.action.reloadWindow"); }
  if (sc.navn === "ferdig") fakta("reload", { gjenopptatt: t.gjenopptatt });
  if (sc.navn === "arvet") fakta("arvet", { trusted: vscode.workspace.isTrusted, tillitsadvarselVist: t.tillitsadvarselVist });
  const repoFil = vscode.Uri.file(path.join(okt, "falsk-elev_falskt-repo", "notat.txt"));
  await lagre(repoFil, "endret");
  await lagre(vscode.Uri.file(path.join(DRV, "kontroll-okt.txt")), "endret");
  fakta("innstillinger", {
    tabSize: vscode.workspace.getConfiguration("editor", repoFil).get("tabSize"),
    localHistory: vscode.workspace.getConfiguration("workbench.localHistory", repoFil).get("enabled"),
  });
  await kjor("workbench.action.closeAllEditors");
  await vent(5000);
  if (sc.navn === "kryss") { logg("ØKT lukker vinduet uten «Ferdig»"); return kjor("workbench.action.closeWindow"); }
  if (sc.navn === "sovn") {
    settFlagg("okt-klar");
    await ventPaaFlagg("vaaknet");
    await vent(10000);
    fakta("sovn", { finnesEtterVaakne: fs.existsSync(okt), tilstand: await kjor("canvasClone._okt") });
    await vent(30000);
  }
  logg("ØKT Ferdig", await kjor("canvasClone.ferdig"));
}

exports.activate = async () => {
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(DRV, "scenario.json"), "utf8"));
    await vscode.extensions.getExtension("krola1.canvas-clone-vscode").activate();
    const t = await kjor("canvasClone._okt");
    if (t.rolle === "okt") await oktvindu(sc, t); else await hoved(sc);
  } catch (e) { logg("FEIL", String(e && e.stack || e)); }
};
exports.deactivate = () => {};
`;

// En .vsix er en zip. Skrives for hånd uten komprimering (ingen ny avhengighet).
function lagZip(filer) {
  const deler = [];
  const sentral = [];
  let offset = 0;
  for (const [navn, innhold] of filer) {
    const data = Buffer.from(innhold);
    const navnBuf = Buffer.from(navn, "utf8");
    const crc = crc32(data);
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4);
    lokal.writeUInt16LE(0x0800, 6);
    lokal.writeUInt16LE(0, 8);
    lokal.writeUInt32LE(0x00210000, 10);
    lokal.writeUInt32LE(crc, 14);
    lokal.writeUInt32LE(data.length, 18);
    lokal.writeUInt32LE(data.length, 22);
    lokal.writeUInt16LE(navnBuf.length, 26);
    lokal.writeUInt16LE(0, 28);
    const sent = Buffer.alloc(46);
    sent.writeUInt32LE(0x02014b50, 0);
    sent.writeUInt16LE(20, 4);
    sent.writeUInt16LE(20, 6);
    sent.writeUInt16LE(0x0800, 8);
    sent.writeUInt16LE(0, 10);
    sent.writeUInt32LE(0x00210000, 12);
    sent.writeUInt32LE(crc, 16);
    sent.writeUInt32LE(data.length, 20);
    sent.writeUInt32LE(data.length, 24);
    sent.writeUInt16LE(navnBuf.length, 28);
    sent.writeUInt32LE(offset, 42);
    deler.push(lokal, navnBuf, data);
    sentral.push(sent, navnBuf);
    offset += lokal.length + navnBuf.length + data.length;
  }
  const sentralBuf = Buffer.concat(sentral);
  const slutt = Buffer.alloc(22);
  slutt.writeUInt32LE(0x06054b50, 0);
  slutt.writeUInt16LE(filer.length, 8);
  slutt.writeUInt16LE(filer.length, 10);
  slutt.writeUInt32LE(sentralBuf.length, 12);
  slutt.writeUInt32LE(offset, 16);
  return Buffer.concat([...deler, sentralBuf, slutt]);
}

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${DRIVER_PKG.name}" Version="${DRIVER_PKG.version}" Publisher="${DRIVER_PKG.publisher}" />
    <DisplayName>${DRIVER_PKG.name}</DisplayName>
    <Description xml:space="preserve">Prøvedriver for canvas-clone (bare riggen)</Description>
    <Tags></Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${DRIVER_PKG.engines.vscode}" /></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
`;
const CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>
`;
const DRIVER_VSIX = path.join(RIGG, "provedriver.vsix");
writeFileSync(
  DRIVER_VSIX,
  lagZip([
    ["extension.vsixmanifest", MANIFEST],
    ["[Content_Types].xml", CONTENT_TYPES],
    ["extension/package.json", JSON.stringify(DRIVER_PKG, null, 2)],
    ["extension/extension.js", DRIVER_JS],
  ]),
);

// --- VS Code ---------------------------------------------------------------------
const exe = await downloadAndUnzipVSCode({ version: "1.100.0", cachePath: CACHE });
const cli = path.join(path.dirname(exe), "bin", "code");
const ENV = {
  ...process.env,
  HOME: HJEM,
  USERPROFILE: HJEM,
  DRV_DIR: DRV,
  DRV_PROSJEKT: PROSJEKT,
  DRV_USERDATA: U,
  GIT_ASKPASS: path.join(RIGG, "askpass.sh"),
  SSH_ASKPASS: path.join(RIGG, "askpass.sh"),
  VSCODE_GIT_IPC_HANDLE: path.join(RIGG, "ipc.sock"),
  VSCODE_GIT_ASKPASS_MAIN: path.join(RIGG, "askpass.sh"),
  VSCODE_GIT_ASKPASS_NODE: path.join(RIGG, "askpass.sh"),
  GIT_CONFIG_GLOBAL: path.join(RIGG, "gitconfig"),
  GIT_SSH_COMMAND: path.join(RIGG, "ssh.sh"),
};
const inst = spawnSync(
  cli,
  ["--user-data-dir", U, "--extensions-dir", X, "--install-extension", VSIX, "--install-extension", DRIVER_VSIX, "--force"],
  { env: ENV, encoding: "utf8" },
);
if (inst.status !== 0) throw new Error(`installasjon feilet: ${inst.stderr}`);

function start(mappe) {
  const args = ["-a", "-s", "-screen 0 1280x1024x24", exe, `--user-data-dir=${U}`, `--extensions-dir=${X}`,
    "--no-sandbox", "--disable-gpu-sandbox", "--disable-updates", "--skip-welcome", "--skip-release-notes",
    "--use-inmemory-secretstorage"];
  if (mappe) args.push(mappe);
  const barn = spawn("xvfb-run", args, { env: ENV, stdio: "ignore" });
  const ferdig = new Promise((resolve) => barn.on("exit", (kode) => resolve(kode)));
  const frist = setTimeout(() => barn.kill("SIGTERM"), 20 * 60_000);
  return { barn, ferdig: ferdig.finally(() => clearTimeout(frist)) };
}

// Etterkommere av en prosess (fra /proc), uten Xvfb/xvfb-run.
function etterkommere(rot) {
  const foreldre = new Map();
  for (const p of readdirSync("/proc").filter((n) => /^\d+$/.test(n))) {
    try {
      const stat = readFileSync(`/proc/${p}/stat`, "utf8");
      const etter = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const comm = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
      foreldre.set(Number(p), { ppid: Number(etter[1]), comm });
    } catch {
      // prosessen forsvant
    }
  }
  const ut = [];
  const besok = (pid) => {
    for (const [barn, info] of foreldre) {
      if (info.ppid !== pid) continue;
      if (!/^Xvfb|^xvfb-run/.test(info.comm)) ut.push(barn);
      besok(barn);
    }
  };
  besok(rot);
  return ut;
}

const lesFakta = (k) => {
  try {
    return JSON.parse(readFileSync(path.join(DRV, `fakta-${k}.json`), "utf8"));
  } catch {
    return undefined;
  }
};
const finnes = (n) => existsSync(path.join(DRV, n));
async function ventPaa(fil, ms) {
  const slutt = Date.now() + ms;
  while (!finnes(fil) && Date.now() < slutt) await vent(500);
  return finnes(fil);
}
function tomDrv() {
  for (const n of readdirSync(DRV)) if (n !== "logg.txt") safeRemove(DRV, path.join(DRV, n));
}

function okter() {
  return existsSync(ROT) ? readdirSync(ROT) : [];
}
function wsForOkter() {
  const wsRot = path.join(U, "User", "workspaceStorage");
  if (!existsSync(wsRot)) return [];
  return readdirSync(wsRot).filter((id) => {
    try {
      return readFileSync(path.join(wsRot, id, "workspace.json"), "utf8").includes("/canvas-clone/vscode/");
    } catch {
      return false;
    }
  });
}
function historikkMed(tekst) {
  const h = path.join(U, "User", "History");
  if (!existsSync(h)) return [];
  return readdirSync(h).filter((d) => {
    try {
      return readFileSync(path.join(h, d, "entries.json"), "utf8").includes(tekst);
    } catch {
      return false;
    }
  });
}
function felleskontroll(sc) {
  sjekk(sc, okter().length === 0, `øktroten er tom (${okter().join(", ") || "ingen"})`);
  sjekk(sc, wsForOkter().length === 0, `ingen workspaceStorage peker på en økt (${wsForOkter().join(", ") || "ingen"})`);
  sjekk(sc, historikkMed("/canvas-clone/vscode/").length === 0, "ingen Local History-oppføringer fra økter");
  const nylig = sql("select value from ItemTable where key='history.recentlyOpenedPathsList'");
  sjekk(sc, !nylig.includes("/canvas-clone/vscode/"), "ingen økt i «Åpne nylig»");
  sjekk(sc, !finnes("ELEV_TASK_KJORTE") && !finnes("ELEV_MCP_KJORTE"), "ingen task/MCP-server fra elevrepoet kjørte");
}

console.log(`Rigg: ${RIGG}\nScenarioer: ${scenarioer.join(", ")}`);
for (const sc of scenarioer) {
  console.log(`\n===== ${sc} ${new Date().toISOString()}`);
  tomDrv();
  writeFileSync(path.join(DRV, "scenario.json"), JSON.stringify({ navn: sc }));
  if (sc === "arvet") {
    const verdi = JSON.stringify({ uriTrustInfo: [{ uri: { $mid: 1, scheme: "file", path: path.join(HJEM, "canvas-clone") }, trusted: true }] });
    sql(`insert or replace into ItemTable(key,value) values('content.trust.model.key','${verdi}')`);
  }
  const v = start(HOVEDMAPPE);
  if (sc === "sovn") {
    if (await ventPaa("flagg-okt-klar", 120_000)) {
      await vent(3000);
      const pids = etterkommere(v.barn.pid);
      console.log(`SIGSTOP på ${pids.length} prosesser i 210 s (simulert hvilemodus)`);
      for (const p of pids) process.kill(p, "SIGSTOP");
      await vent(210_000);
      for (const p of pids) process.kill(p, "SIGCONT");
      await vent(1000);
      writeFileSync(path.join(DRV, "flagg-vaaknet"), "x");
    }
  }
  await v.ferdig;
  if (sc === "omstart") {
    console.log("VS Code avsluttet med øktvinduet åpent; venter 75 s og starter igjen uten argumenter");
    await vent(75_000);
    await start().ferdig;
  }
  if (sc === "arvet") sql("delete from ItemTable where key='content.trust.model.key'");

  const slettet = lesFakta("slettet");
  if (sc === "t18") {
    const t = lesFakta("t18");
    sjekk(sc, t?.privat === "no_access", `privat/ukjent repo: ${t?.privat}`);
    sjekk(sc, t?.offentlig === "ok", `offentlig repo med insteadOf→ssh: ${t?.offentlig}`);
    sjekk(sc, !finnes("ASKPASS_KALT") && !finnes("SSH_KALT"), "askpass og ssh ble aldri kalt");
    sjekk(sc, (lesFakta("env") ?? []).includes("GIT_ASKPASS"), "GIT_ASKPASS fantes i utvidelsesverten (prøven gjelder)");
    continue;
  }
  sjekk(sc, slettet?.slettet === true, `økten ble slettet (${JSON.stringify(slettet)})`);
  felleskontroll(sc);
  if (sc === "ferdig") {
    sjekk(sc, lesFakta("reload")?.gjenopptatt === true, "økten fortsatte etter Reload Window");
    const inn = lesFakta("innstillinger");
    sjekk(sc, inn?.tabSize !== 7 && inn?.localHistory === false, `elevrepoets settings.json ble ikke lest (${JSON.stringify(inn)})`);
    sjekk(sc, (lesFakta("historikkHoved") ?? []).length > 0, "positiv kontroll: lagring i hovedvinduet ga Local History");
    sjekk(sc, historikkMed("kontroll-okt.txt").length === 0, "lagring i øktvinduet (også utenfor økten) ga ingen Local History");
    sjekk(sc, typeof slettet?.msEtterFerdig === "number" && slettet.msEtterFerdig < 15_000, `slettet raskt etter «Ferdig» (${slettet?.msEtterFerdig} ms)`);
  }
  if (sc === "arvet") {
    const a = lesFakta("arvet");
    sjekk(sc, a?.trusted === true && a?.tillitsadvarselVist === true, `øktvinduet var betrodd og T9d ble vist (${JSON.stringify(a)})`);
  }
  if (sc === "omstart") sjekk(sc, lesFakta("omstart")?.ingenHjerteslagEtterOmstart === true, "det gjenopprettede øktvinduet slo ikke");
  if (sc === "sovn") {
    const s = lesFakta("sovn");
    sjekk(sc, s?.finnesEtterVaakne === true && s?.tilstand?.gjenopptatt === true, "økten fantes og fortsatte etter «hvilemodus»");
  }
}

const feil = resultater.filter((r) => !r.ok);
console.log(`\n${resultater.length - feil.length}/${resultater.length} sjekker OK. Logg: ${path.join(DRV, "logg.txt")}`);
process.exit(feil.length ? 1 : 0);
