import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

// Ren config-lagring: sti, lesing og skriving av config.json. Ingen prompts,
// ingen konsoll og ingen avhengigheter utenfor Node, slik at den kan brukes
// både av CLI-et (via config.js, som legger oppsett-wizarden oppå) og av
// VS Code-utvidelsen uten å dra inn @inquirer/ora.

export function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "canvas-clone");
  if (platform() === "win32") return join(process.env.APPDATA || homedir(), "canvas-clone");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "canvas-clone");
  return join(homedir(), ".config", "canvas-clone");
}

// Bare https:// godtas - API-tokenet sendes i hver forespørsel.
export function isHttpsUrl(url) {
  return typeof url === "string" && /^https:\/\/.+/.test(url);
}

export const configPath = () => join(configDir(), "config.json");

// Settings som kan overstyres ved å redigere config.json manuelt - trenger
// ikke gjennom oppsett-wizarden, som bare spør om det mest nødvendige.
const DEFAULT_SETTINGS = {
  cacheTtlMinutes: 15,
  displayName: "github", // "github" | "canvas"
  bulkCloneFilter: "needs_grading", // "needs_grading" | "all" - brukt når du bulk-kloner en hel fagretning/kurs
  joeMode: false,
};

export function loadConfig() {
  const p = configPath();
  if (!existsSync(p)) return null;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(p, "utf8")) };
}

export function saveConfig(config) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const p = configPath();
  writeFileSync(p, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(p, 0o600);
  } catch {
    // Windows ignorerer POSIX-rettigheter - ikke kritisk der.
  }
}
