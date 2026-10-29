import { input, password, select, confirm } from "@inquirer/prompts";
import { whoAmI } from "./canvas.js";
import { hasGit } from "./github.js";
import { configDir, isHttpsUrl, configPath, loadConfig, saveConfig } from "./config-store.js";

// Lagringen (sti, lesing, skriving) ligger i config-store.js, som ikke har
// prompts eller konsoll. Re-eksportert her så eksisterende importer virker.
export { configDir, isHttpsUrl, loadConfig, saveConfig };

async function promptCredentials(existing, signal, t) {
  const canvasUrl = (
    await input(
      {
        message: t.canvasUrlMessage(),
        default: existing?.canvasUrl,
        validate: (v) => isHttpsUrl(v) || t.canvasUrlValidate(),
      },
      { signal }
    )
  ).replace(/\/+$/, "");

  console.log(t.tokenExpiryTip());
  const canvasToken = await password(
    {
      message: t.canvasTokenMessage(),
      mask: "*",
      validate: (v) => v.length > 0 || t.canvasTokenValidate(),
    },
    { signal }
  );

  process.stdout.write(t.checkingToken());
  const result = await whoAmI({ canvasUrl, canvasToken });
  if (!result.ok) {
    console.log(t.tokenCheckFailed());
    if (result.reason === "network") throw new Error(t.tokenCheckNetworkError(result.detail));
    if (result.reason === "invalid_token") throw new Error(t.tokenInvalid());
    throw new Error(t.tokenCheckOtherError(result.detail));
  }
  console.log(t.loggedInAs(result.user.name));

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
  if (!hasGit()) console.log(t.gitMissingWarning());

  const existing = loadConfig();
  if (!forceSetup && existing?.canvasUrl && existing?.canvasToken) {
    if (!isHttpsUrl(existing.canvasUrl)) throw new Error(t.errConfigNotHttps());
    return existing;
  }

  console.log(t.setupIntro());
  const credentials = await promptCredentials(existing, signal, t);
  const config = { ...existing, ...credentials };
  saveConfig(config);
  console.log(t.savedTo(configPath()));
  return config;
}
