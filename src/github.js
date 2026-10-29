import { spawn, spawnSync } from "node:child_process";
import { safeRemove } from "./storage.js";

// GitHub-brukernavn: 1-39 tegn, alfanumerisk og enkle bindestreker, ikke
// bindestrek først/sist. `_` og `.` er aldri lov - derfor er `_` et entydig
// skille i mappenavnet <eier>_<repo> (storage.js: repoFolderName).
export function isValidOwner(owner) {
  return typeof owner === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(owner);
}

// Repo-navn: [A-Za-z0-9._-]{1,100}, men ikke "." / ".." og ikke bindestrek
// først (ville blitt tolket som et flagg av git/gh).
export function isValidRepoName(repo) {
  return (
    typeof repo === "string" &&
    /^[A-Za-z0-9._-]{1,100}$/.test(repo) &&
    repo !== "." &&
    repo !== ".." &&
    !repo.startsWith("-")
  );
}

function validPair(owner, repo) {
  return isValidOwner(owner) && isValidRepoName(repo) ? `${owner}/${repo}` : null;
}

// Plukker ut "eier/repo" fra en tekstblobb (innleveringens url+body).
// Returnerer første GYLDIGE treff (ugyldige eier-/repo-navn hoppes over),
// og prioriterer direkte github.com-lenker. Mangler de, men det finnes en
// github.io (GH Pages)-lenke, utledes repoet derfra:
//   bruker.github.io/mitt-repo -> bruker/mitt-repo
//   bruker.github.io          -> bruker/bruker.github.io (brukerens Pages-repo)
// Ingen gyldige treff -> null ("uten lenke"). Teksten selv returneres,
// logges eller vises aldri.
//
// Negativ lookbehind på "gist." foran "github.com" - ellers ville
// gist.github.com/<bruker>/<gist-id> blitt feiltolket som et vanlig
// github.com/eier/repo-treff.
export function extractRepo(text) {
  if (!text) return null;

  for (const m of text.matchAll(/(?<!gist\.)github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g)) {
    const found = validPair(m[1], m[2].replace(/\.git$/, ""));
    if (found) return found;
  }

  for (const m of text.matchAll(/([A-Za-z0-9-]+)\.github\.io(\/[A-Za-z0-9_.-]+)?/g)) {
    const owner = m[1];
    const rest = m[2]?.replace(/^\//, "");
    const found = validPair(owner, rest ? rest : `${owner}.github.io`);
    if (found) return found;
  }

  return null;
}

// Speiler git-oppslaget i ensureConfig/--setup: varsler tydelig hvis git
// (selve verktøyet kloning er bygget på) mangler på maskinen.
export function hasGit() {
  try {
    return spawnSync("git", ["--version"]).status === 0;
  } catch {
    return false;
  }
}

// --- Kloning uten lærerens påloggingsdata (tilsynets T18) ---------------------
// Elevrepoene er offentlige (Lars, 2026-10-29), så kloning skal aldri bruke
// lærerens GitHub-pålogging: ingen credential-hjelpere (GCM, osxkeychain,
// `gh auth setup-git`), ingen askpass (heller ikke VS Codes), ingen ekstra
// HTTP-headere, ingen omskriving til SSH eller til en URL med innebygd token.
// Et privat eller utilgjengelig repo feiler derfor (havner under «uten
// tilgang»/uten_lenke.txt) i stedet for å spørre. Skolens proxy/CA i
// lærerens git-config beholdes bevisst (ikke GIT_CONFIG_GLOBAL/NOSYSTEM).
// Bare selve kjøringen skiller cloneRepo (CLI) og cloneRepoAsync (utvidelsen).

// "eier/repo" -> { owner, name }, eller null hvis ugyldig.
export function parseRepo(repo) {
  const [owner, name, ...extra] = String(repo).split("/");
  if (extra.length > 0 || !validPair(owner, name)) return null;
  return { owner, name };
}

export function cloneUrl({ owner, name }) {
  return `https://github.com/${owner}/${name}.git`;
}

// Miljøvariabler som kan gi git påloggingsdata, et annet repo eller config
// utenfor -c-flaggene våre. GIT_CONFIG_PARAMETERS og GIT_CONFIG_COUNT/KEY/VALUE
// er samme mekanisme som `git -c`, og ville ellers kunnet overstyre den.
const STRIPPED_ENV = [
  /^GIT_ASKPASS$/,
  /^SSH_ASKPASS/,
  /^VSCODE_GIT_/,
  /^GIT_DIR$/,
  /^GIT_WORK_TREE$/,
  /^GIT_INDEX_FILE$/,
  /^GIT_CONFIG_PARAMETERS$/,
  /^GIT_CONFIG_COUNT$/,
  /^GIT_CONFIG_KEY_/,
  /^GIT_CONFIG_VALUE_/,
];

// Kopi av env uten variablene over, med GIT_TERMINAL_PROMPT=0 og en tom
// GIT_ASKPASS (satt-men-tom stopper hele askpass-kjeden: core.askPass og
// SSH_ASKPASS prøves ikke). LANGUAGE=C og LC_MESSAGES=C gir engelske
// git-meldinger, slik at classifyCloneError treffer uansett lærerens språk:
// LANGUAGE går foran et arvet LC_ALL for meldinger i gettext (verifisert med
// git 2.56, LC_ALL=en_US.UTF-8 + LANGUAGE=de), mens LC_MESSAGES dekker når
// locale ellers er C. LC_ALL røres ikke (styrer også tegnsett/LC_CTYPE).
// Windows-env er case-insensitive, derfor sammenlignes navnene i store
// bokstaver.
export function sanitizedGitEnv(env = process.env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    const upper = key.toUpperCase();
    if (STRIPPED_ENV.some((re) => re.test(upper))) continue;
    if (upper === "GIT_TERMINAL_PROMPT" || upper === "LANGUAGE" || upper === "LC_MESSAGES") continue;
    out[key] = value;
  }
  out.GIT_TERMINAL_PROMPT = "0";
  out.GIT_ASKPASS = "";
  out.LANGUAGE = "C";
  out.LC_MESSAGES = "C";
  return out;
}

// Argumentene til git. `-c` leses sist, etter system/global/lokal config.
// - credential.helper= tømmer hjelperlista (også credential.<url>.helper).
// - http.extraHeader= tømmer bare den generelle lista; en URL-spesifikk
//   http.<url>.extraHeader har høyere presedens og overlever den (verifisert
//   mot git 2.56 i D1). Derfor også en tom http.<klone-url>.extraHeader, som
//   er den mest spesifikke nøkkelen som kan matche og dermed tømmer alt.
// - url.<klone-url>.insteadOf=<klone-url>: lengste insteadOf-treff vinner, så
//   en regel som skriver github.com om til https://<token>@github.com/ (eller
//   til SSH) slår ikke inn (verifisert mot git 2.56 i D1).
// - protocol.allow=never + protocol.https.allow=always: bare https, også etter
//   eventuell omskriving.
export function buildCloneArgs(url, dest) {
  return [
    "-c", "credential.helper=",
    "-c", "core.askPass=",
    "-c", "http.extraHeader=",
    "-c", `http.${url}.extraHeader=`,
    "-c", `url.${url}.insteadOf=${url}`,
    "-c", "protocol.allow=never",
    "-c", "protocol.https.allow=always",
    "clone", "--quiet", "--", url, dest,
  ];
}

// Skiller "uten tilgang" (privat, slettet eller feilstavet repo - GitHub
// svarer 401/404, og uten pålogging kan git ikke spørre) fra andre klonefeil
// (nettverk, disk). Bare git sin stderr leses; den vises aldri her.
const NO_ACCESS_PATTERNS = [
  /could not read Username/i,
  /could not read Password/i,
  /terminal prompts disabled/i,
  /Repository not found/i,
  /Authentication failed/i,
  /The requested URL returned error: 40[134]\b/i,
];

export function classifyCloneError(stderr) {
  const text = String(stderr ?? "");
  return NO_ACCESS_PATTERNS.some((re) => re.test(text)) ? "no_access" : "failed";
}

// Felles tolkning av hvordan git avsluttet. Halvferdige mapper ryddes via
// safeRemove (aldri utenfor root).
function finishClone({ status, signal, stderr, error }, dest, root) {
  if (status === 0) return { ok: true, via: "git" };
  safeRemove(root, dest);
  if (signal) return { ok: false, interrupted: true };
  // `reason` er et tillegg: eksisterende kallere som bare leser `error`, virker
  // som før. Utvidelsen skal bruke `reason` og ikke vise `error` (rå stderr
  // med repo-URL, T11).
  return {
    ok: false,
    error: stderr?.trim() || error?.code || "ukjent feil",
    reason: classifyCloneError(stderr),
  };
}

// Kloner "eier/repo" til dest (som må ligge inni root), synkront (CLI-et).
// Blir git drept av et signal (typisk Ctrl-C), returneres
// {ok:false, interrupted:true}.
export function cloneRepo(repo, dest, root) {
  const parsed = parseRepo(repo);
  if (!parsed) return { ok: false, error: "invalid repo" };
  const url = cloneUrl(parsed);
  const res = spawnSync("git", buildCloneArgs(url, dest), { encoding: "utf8", env: sanitizedGitEnv() });
  return finishClone(res, dest, root);
}

// Samme som cloneRepo, men asynkront og avbrytbart (VS Code-utvidelsen).
// Ingen shell. `gitPath` lar utvidelsen bruke en git den har funnet selv
// (D0 j). Avbrytes `signal`, drepes git, mappen ryddes og
// {ok:false, aborted:true} returneres.
export function cloneRepoAsync(repo, dest, root, { signal, gitPath = "git" } = {}) {
  const parsed = parseRepo(repo);
  if (!parsed) return Promise.resolve({ ok: false, error: "invalid repo" });
  if (signal?.aborted) return Promise.resolve({ ok: false, aborted: true });
  const url = cloneUrl(parsed);

  return new Promise((resolve) => {
    let stderr = "";
    let spawnError = null;
    let settled = false;
    const child = spawn(gitPath, buildCloneArgs(url, dest), {
      env: sanitizedGitEnv(),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const onAbort = () => child.kill();
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => {
      if (stderr.length < 64 * 1024) stderr += d;
    });
    const done = (status, sig) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        safeRemove(root, dest);
        resolve({ ok: false, aborted: true });
        return;
      }
      resolve(finishClone({ status, signal: sig, stderr, error: spawnError }, dest, root));
    };
    child.on("error", (err) => {
      spawnError = err;
      done(null, null);
    });
    child.on("close", (code, sig) => done(code, sig));
  });
}
