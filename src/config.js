import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { input, password, select, confirm } from "@inquirer/prompts";
import { whoAmI } from "./canvas.js";

export function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "canvas-clone");
  if (platform() === "win32") return join(process.env.APPDATA || homedir(), "canvas-clone");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "canvas-clone");
  return join(homedir(), ".config", "canvas-clone");
}

const configPath = () => join(configDir(), "config.json");

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

async function promptCredentials(existing, signal, t) {
  const canvasUrl = (
    await input(
      {
        message: t.canvasUrlMessage(),
        default: existing?.canvasUrl,
        validate: (v) => /^https?:\/\/.+/.test(v) || t.canvasUrlValidate(),
      },
      { signal }
    )
  ).replace(/\/+$/, "");

  const canvasToken = await password(
    {
      message: t.canvasTokenMessage(),
      mask: "*",
      validate: (v) => v.length > 0 || t.canvasTokenValidate(),
    },
    { signal }
  );

  process.stdout.write(t.checkingToken());
  const me = await whoAmI({ canvasUrl, canvasToken });
  if (!me) {
    console.log(t.tokenCheckFailed());
    throw new Error(t.tokenInvalid());
  }
  console.log(t.loggedInAs(me.name));

  const editor = await select(
    {
      message: t.editorPreferenceMessage(),
      default: existing?.editor ?? "code",
      choices: [
        { name: t.editorVsCode(), value: "code" },
        { name: t.editorZed(), value: "zed" },
        { name: t.editorAskEveryTime(), value: null },
      ],
    },
    { signal }
  );

  const joeMode = await confirm({ message: t.joeModeSetupMessage(), default: false }, { signal });

  return { canvasUrl, canvasToken, editor, joeMode };
}

export async function ensureConfig({ forceSetup = false, signal, t } = {}) {
  let config = forceSetup ? null : loadConfig();
  if (config?.canvasUrl && config?.canvasToken) return config;

  console.log(t.setupIntro());
  config = await promptCredentials(config, signal, t);
  saveConfig(config);
  console.log(t.savedTo(configPath()));
  return config;
}
