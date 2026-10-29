import { spawnSync } from "node:child_process";
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

function hasGh() {
  try {
    return spawnSync("gh", ["--version"]).status === 0;
  } catch {
    return false;
  }
}

// Speiler hasGh() - brukt i ensureConfig/--setup for å varsle tydelig hvis
// git (selve verktøyet kloning er bygget på) mangler på maskinen.
export function hasGit() {
  try {
    return spawnSync("git", ["--version"]).status === 0;
  } catch {
    return false;
  }
}

// Kloner "eier/repo" til dest (som må ligge inni root). Prøver vanlig
// `git clone` først (fungerer for offentlige repo uten noen ekstra
// avhengighet); faller tilbake til `gh repo clone` (hvis gh er installert)
// for private repo. Blir git/gh drept av et signal (typisk Ctrl-C), prøves
// ikke gh, og {ok:false, interrupted:true} returneres. Halvferdige mapper
// ryddes via safeRemove (aldri utenfor root).
export function cloneRepo(repo, dest, root) {
  const [owner, name, ...extra] = String(repo).split("/");
  if (extra.length > 0 || !validPair(owner, name)) return { ok: false, error: "invalid repo" };

  const url = `https://github.com/${owner}/${name}.git`;
  let res = spawnSync("git", ["clone", "--quiet", "--", url, dest], { encoding: "utf8" });
  if (res.status === 0) return { ok: true, via: "git" };
  safeRemove(root, dest);
  if (res.signal) return { ok: false, interrupted: true };

  if (hasGh()) {
    res = spawnSync("gh", ["repo", "clone", `${owner}/${name}`, dest, "--", "-q"], { encoding: "utf8" });
    if (res.status === 0) return { ok: true, via: "gh" };
    safeRemove(root, dest);
    if (res.signal) return { ok: false, interrupted: true };
  }

  return { ok: false, error: res.stderr?.trim() || res.error?.code || "ukjent feil" };
}
