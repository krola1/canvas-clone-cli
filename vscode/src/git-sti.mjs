// Finner git for kloning i utvidelsen (D0 j, plan-punkt 9). Ren logikk uten
// `vscode`-import (tests/vscode-git-sti.test.js). Gir en full sti (eller null),
// slik at spawn aldri trenger et skall eller å gjette .exe/.cmd på Windows.
//
// Rekkefølge, som VS Codes git-utvidelse:
// - Windows: Git for Windows under %ProgramW6432%, %ProgramFiles(x86)%,
//   %ProgramFiles% og %LocalAppData%\Programs (\Git\cmd\git.exe), så git.exe i PATH.
//   Bare .exe: spawn uten skall kan ikke kjøre .cmd/.bat.
// - macOS: git i PATH. Er det /usr/bin/git (en shim som åpner en
//   installasjonsdialog uten Command Line Tools), brukes den bare hvis
//   `xcode-select -p` lykkes.
// - Linux og andre: git i PATH.
// `vscode.git` sitt API brukes ikke: det finnes bare når git-utvidelsen er
// aktiv (ikke i Restricted Mode, ikke med git.enabled av), og det ville gjort
// utvidelsen avhengig av en annen utvidelses aktivering.
import { statSync, accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function erKjorbarFil(p, platform) {
  try {
    if (!statSync(p).isFile()) return false;
    if (platform !== "win32") accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function envVerdi(env, navn, platform) {
  if (platform !== "win32") return env[navn];
  const n = Object.keys(env).find((k) => k.toUpperCase() === navn.toUpperCase());
  return n ? env[n] : undefined;
}

// Første kjørbare `navn` i PATH, eller null.
export function iPath(navn, { env = process.env, platform = process.platform, erFil = erKjorbarFil } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const verdi = envVerdi(env, "PATH", platform) ?? "";
  for (const mappe of verdi.split(platform === "win32" ? ";" : ":")) {
    if (!mappe || !p.isAbsolute(mappe)) continue; // relative PATH-oppføringer (f.eks. «.») godtas ikke
    const kandidat = p.join(mappe, navn);
    if (erFil(kandidat, platform)) return kandidat;
  }
  return null;
}

function xcodeSelectOk() {
  try {
    return spawnSync("xcode-select", ["-p"], { stdio: "ignore", windowsHide: true }).status === 0;
  } catch {
    return false;
  }
}

export function finnGit({
  env = process.env,
  platform = process.platform,
  erFil = erKjorbarFil,
  harCommandLineTools = xcodeSelectOk,
} = {}) {
  if (platform === "win32") {
    const p = path.win32;
    const kandidater = [];
    for (const navn of ["ProgramW6432", "ProgramFiles(x86)", "ProgramFiles"]) {
      const rot = envVerdi(env, navn, platform);
      if (rot) kandidater.push(p.join(rot, "Git", "cmd", "git.exe"));
    }
    const lokal = envVerdi(env, "LocalAppData", platform);
    if (lokal) kandidater.push(p.join(lokal, "Programs", "Git", "cmd", "git.exe"));
    for (const k of kandidater) if (erFil(k, platform)) return k;
    return iPath("git.exe", { env, platform, erFil });
  }
  const funnet = iPath("git", { env, platform, erFil });
  if (platform === "darwin" && funnet === "/usr/bin/git" && !harCommandLineTools()) return null;
  return funnet;
}
