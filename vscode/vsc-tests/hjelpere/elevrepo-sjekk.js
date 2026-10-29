// Negativ T8/T9a-test, felles for øktvinduet med og uten tillit: det falske
// elevrepoet (vsc-tests/hjelpere/testhjem.mjs) har settings.json, tasks.json
// (runOn: folderOpen), launch.json, extensions.json og mcp.json i
// <økt>/<repo>/.vscode/. Ingen av dem skal ha effekt. Positiv kontroll: vår
// egen <økt>/.vscode/settings.json leses.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const ELEVREPO = "falsk-elev_falskt-repo";

function stier() {
  const okt = vscode.workspace.workspaceFolders[0].uri;
  const repo = vscode.Uri.joinPath(okt, ELEVREPO);
  return { okt, repo, fil: vscode.Uri.joinPath(repo, "index.js") };
}

function sjekkInnstillinger() {
  const { okt, repo, fil } = stier();
  for (const ressurs of [fil, repo]) {
    const lh = vscode.workspace.getConfiguration("workbench.localHistory", ressurs);
    assert.equal(lh.get("enabled"), false, "localHistory skal være av (vår settings.json)");
    assert.equal(lh.inspect("enabled").workspaceFolderValue, false, "positiv kontroll: øktens settings.json leses");
    assert.notEqual(vscode.workspace.getConfiguration("editor", ressurs).get("tabSize"), 7);
    assert.equal(vscode.workspace.getConfiguration("canvasClone", ressurs).get("elevInnstilling"), undefined);
  }
  const launch = vscode.workspace.getConfiguration("launch", okt).get("configurations") ?? [];
  assert.ok(!launch.some((c) => c?.name === "ELEVLAUNCH"), "launch.json fra elevrepoet ble lest");
  const launchRepo = vscode.workspace.getConfiguration("launch", repo).get("configurations") ?? [];
  assert.ok(!launchRepo.some((c) => c?.name === "ELEVLAUNCH"), "launch.json fra elevrepoet ble lest (ressurs)");
  const anbefalt = vscode.workspace.getConfiguration("extensions", okt).get("recommendations");
  assert.ok(!(anbefalt ?? []).includes("falsk.anbefalt-utvidelse"));
}

async function sjekkTasks() {
  const tasks = await vscode.tasks.fetchTasks();
  assert.ok(!tasks.some((t) => t.name === "ELEVTASK"), "tasks.json fra elevrepoet ble lest");
}

function sjekkIngenKjoring() {
  const { okt } = stier();
  for (const fil of ["ELEV_TASK_KJORTE", "ELEV_MCP_KJORTE"]) {
    assert.equal(fs.existsSync(path.join(okt.fsPath, fil)), false, `${fil}: elevkode kjørte`);
  }
}

module.exports = { ELEVREPO, stier, sjekkInnstillinger, sjekkTasks, sjekkIngenKjoring };
