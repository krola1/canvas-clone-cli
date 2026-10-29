import { mkdirSync, rmSync, readdirSync, lstatSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Alt som har med elevdata på disk å gjøre: hvor repoene ligger, hvordan
// mappene navngis, og hvordan de slettes. Dette er den ENESTE fila i
// prosjektet som kaller rmSync - all sletting går gjennom safeRemove(), som
// nekter å røre noe utenfor gradingRoot().

// ~/canvas-clone/grading - uavhengig av cwd, slik at elevrepoer aldri havner
// i et vilkårlig prosjekt (eller et git-repo) der læreren tilfeldigvis står.
export function gradingRoot(home = homedir()) {
  return path.join(home, "canvas-clone", "grading");
}

// ~/canvas-clone/.gitignore med "*", i tilfelle hjemmemappa (eller
// ~/canvas-clone) selv er et git-repo - da skal elevdata aldri kunne
// committes ved et uhell.
export function ensureBaseGitignore(root) {
  const base = path.dirname(root);
  mkdirSync(base, { recursive: true });
  const p = path.join(base, ".gitignore");
  if (!existsSync(p)) writeFileSync(p, "*\n");
}

function tryRealpath(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

function isInside(rootAbs, targetAbs, pathMod, caseInsensitive) {
  const r = caseInsensitive ? rootAbs.toLowerCase() : rootAbs;
  const t = caseInsensitive ? targetAbs.toLowerCase() : targetAbs;
  const rel = pathMod.relative(r, t);
  if (rel === "") return false; // selve roten
  if (pathMod.isAbsolute(rel)) return false; // annen stasjon (Windows)
  const first = rel.split(/[\\/]/)[0];
  if (first === "..") return false; // forelder eller søskenmappe (f.eks. grading2)
  return true;
}

// Kaster hvis p ikke ligger STRENGT inni root (roten selv avvises også).
// Roten (og forelderen til p) løses opp med realpath, slik at en symlenket
// hjemmemappe ikke gir falske avvisninger. p selv løses IKKE opp - er p en
// symlenke, er det lenken (ikke målet) som skal vurderes og slettes.
// pathMod/platform kan overstyres i tester (path.win32).
export function assertInside(root, p, { pathMod = path, platform = process.platform } = {}) {
  const caseInsensitive = platform === "win32";
  const rootAbs = pathMod.resolve(root);
  const targetAbs = pathMod.resolve(p);
  const real = pathMod === path;

  const rootReal = (real && tryRealpath(rootAbs)) || rootAbs;
  const parentReal = real ? tryRealpath(pathMod.dirname(targetAbs)) : null;
  const targetReal = parentReal ? pathMod.join(parentReal, pathMod.basename(targetAbs)) : targetAbs;

  if (isInside(rootReal, targetReal, pathMod, caseInsensitive)) return targetReal;
  // Fallback når forelderen ikke finnes (p finnes da heller ikke): sammenlign
  // uoppløste stier.
  if (!parentReal && isInside(rootAbs, targetAbs, pathMod, caseInsensitive)) return targetAbs;
  throw new Error(`refusing to touch path outside ${rootAbs}`);
}

function existsNoFollow(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

// Sletter p (rekursivt) bare hvis den ligger inni root. Følger aldri
// symlenker (rmSync fjerner selve lenken), verifiserer at p faktisk er borte
// etterpå, og kaster aldri - returnerer {ok, path, code}.
export function safeRemove(root, p) {
  let target;
  try {
    target = assertInside(root, p);
  } catch {
    return { ok: false, path: p, code: "OUTSIDE_ROOT" };
  }
  if (!existsNoFollow(target)) return { ok: true, path: target };
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    return { ok: false, path: target, code: err.code ?? "ERROR" };
  }
  if (existsNoFollow(target)) return { ok: false, path: target, code: "STILL_EXISTS" };
  return { ok: true, path: target };
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// Gjør et vilkårlig navn (kursnavn, eier_repo) trygt som mappenavn på
// Linux, macOS og Windows. $ ` ' ( ) fjernes også, slik at editorkommandoen
// som skrives ut på Windows (code "<sti>") ikke kan kjøre kode når den limes
// inn i PowerShell (der $(...) og `-escape virker inni "...").
export function sanitizeFolderName(name) {
  let s = String(name ?? "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[/\\:*?"<>|&^%!$`'()]/g, "")
    .trim()
    .slice(0, 50)
    .replace(/[. ]+$/, "");
  if (s === "" || s === "." || s === "..") return "_";
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s;
}

// <eier>_<repo>, små bokstaver, med -2, -3 ... ved kollisjon innenfor samme
// oppgavemappe i denne økta. `_` kan ikke forekomme i GitHub-eiernavn, så
// skillet mellom eier og repo er entydig.
export function repoFolderName(owner, repo, usedSet) {
  const base = sanitizeFolderName(`${owner}_${repo}`.toLowerCase());
  let candidate = base;
  for (let n = 2; usedSet.has(candidate); n++) candidate = `${base}-${n}`;
  usedSet.add(candidate);
  return candidate;
}

const SESSION_RE = /^(\d{8})-(\d{6})-(\d+)$/;

function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

export function sessionName(now = new Date(), pid = process.pid) {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}-${pid}`;
}

// PID-en i øktmappens navn er "låsen" - ingen egen låsfil eller journal.
export function sessionPid(name) {
  const m = SESSION_RE.exec(name);
  return m ? Number(m[3]) : null;
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// Lager <root>/<YYYYMMDD-HHMMSS>-<pid>/. Finnes den allerede (samme PID i
// samme sekund - forrige eier må være død), tømmes den først.
export function createSession(root, { now = new Date(), pid = process.pid } = {}) {
  mkdirSync(root, { recursive: true });
  const name = sessionName(now, pid);
  const p = path.join(root, name);
  try {
    mkdirSync(p);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    const res = safeRemove(root, p);
    if (!res.ok) throw err;
    mkdirSync(p);
  }
  return { name, path: p };
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// Rydder rester fra tidligere kjøringer. Kalles ETTER at egen øktmappe er
// laget. Sletter BARE ekte mapper med øktnavn (<YYYYMMDD-HHMMSS>-<pid>) der
// eierprosessen er død. Alt annet røres ikke, men rapporteres:
//   skippedAlive - øktmapper der eierprosessen ser ut til å leve (annen kjøring)
//   unknown      - antall filer/mapper/symlenker som ikke er øktmapper
//   rootSymlink  - roten eller forelderen (~/canvas-clone) er en symlenke;
//                  da slettes ingenting her (bare advarsel) - vi vet ikke
//                  sikkert hvor lenken peker
export function startupCleanup(root, ownName, { isAlive = pidAlive, ownPid = process.pid } = {}) {
  const removed = [];
  const failed = [];
  const skippedAlive = [];
  let unknown = 0;
  const rootSymlink = isSymlink(root) || isSymlink(path.dirname(root));
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return { removed, failed, skippedAlive, unknown, rootSymlink };
  }
  for (const entry of entries) {
    if (entry.name === ownName) continue;
    const pid = sessionPid(entry.name);
    if (pid === null || !entry.isDirectory()) {
      unknown++;
      continue;
    }
    if (pid !== ownPid && isAlive(pid)) {
      skippedAlive.push(entry.name);
      continue;
    }
    if (rootSymlink) continue;
    const res = safeRemove(root, path.join(root, entry.name));
    (res.ok ? removed : failed).push(res);
  }
  return { removed, failed, skippedAlive, unknown, rootSymlink };
}

export function dirHasContent(p) {
  try {
    return readdirSync(p).length > 0;
  } catch {
    return false;
  }
}
