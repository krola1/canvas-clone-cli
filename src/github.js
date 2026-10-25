import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

// Plukker ut "eier/repo" fra en tekstblobb (innleveringens url+body).
// Prioriterer en direkte github.com-lenke. Mangler den, men det finnes en
// github.io (GH Pages)-lenke, utledes repoet derfra:
//   bruker.github.io/mitt-repo -> bruker/mitt-repo
//   bruker.github.io          -> bruker/bruker.github.io (brukerens Pages-repo)
//
// Negativ lookbehind på "gist." foran "github.com" - ellers ville
// gist.github.com/<bruker>/<gist-id> blitt feiltolket som et vanlig
// github.com/eier/repo-treff (siden "github.com/..." er en substreng av
// "gist.github.com/..."). En gist-lenke skal i stedet falle videre til
// github.io-sjekken (som heller ikke treffer), og endte opp som "ingen
// lenke funnet" - samme vei som annen tekst uten gyldig repo-lenke.
export function extractRepo(text) {
  if (!text) return null;

  const direct = text.match(/(?<!gist\.)github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  if (direct) return direct[1].replace(/\.git$/, "");

  const pages = text.match(/([A-Za-z0-9_.-]+)\.github\.io(\/[A-Za-z0-9_.-]+)?/);
  if (pages) {
    const owner = pages[1];
    const rest = pages[2]?.replace(/^\//, "");
    return rest ? `${owner}/${rest}` : `${owner}/${owner}.github.io`;
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

// Kloner "eier/repo" til dest. Prøver vanlig `git clone` først (fungerer for
// offentlige repo uten noen ekstra avhengighet); faller tilbake til
// `gh repo clone` (hvis gh er installert) for private repo.
export function cloneRepo(repo, dest) {
  const url = `https://github.com/${repo}.git`;
  let res = spawnSync("git", ["clone", "--quiet", url, dest], { encoding: "utf8" });
  if (res.status === 0) return { ok: true, via: "git" };

  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });

  if (hasGh()) {
    res = spawnSync("gh", ["repo", "clone", repo, dest, "--", "-q"], { encoding: "utf8" });
    if (res.status === 0) return { ok: true, via: "gh" };
  }

  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  return { ok: false, error: res.stderr?.trim() || "ukjent feil" };
}
