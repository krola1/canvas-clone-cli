// T18: git clone uten lærerens påloggingsdata. Ingen nettverk - git er et
// lite Node-skript som skriver ned argumentene og miljøet det fikk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseRepo, cloneUrl, sanitizedGitEnv, buildCloneArgs, cloneRepo, cloneRepoAsync, classifyCloneError } from "../src/github.js";

const URL = "https://github.com/ola/x.git";

test("parseRepo/cloneUrl: gyldig eier/repo gir https-URL, ugyldig gir null", () => {
  assert.deepEqual(parseRepo("ola/x"), { owner: "ola", name: "x" });
  assert.equal(cloneUrl(parseRepo("ola/x")), URL);
  for (const bad of ["../x", "ola/x/y", "ola", "-ola/x", "ola/-x", "ola/..", "ola_dev/x", ""]) {
    assert.equal(parseRepo(bad), null, bad);
  }
});

test("sanitizedGitEnv: fjerner askpass, VS Code-git, repo-overstyring og -c via env", () => {
  const env = sanitizedGitEnv({
    PATH: "/usr/bin",
    HOME: "/home/x",
    HTTPS_PROXY: "http://proxy:3128",
    GIT_SSL_CAINFO: "/etc/ca.pem",
    GIT_ASKPASS: "/usr/share/code/askpass.sh",
    SSH_ASKPASS: "/usr/bin/ssh-askpass",
    SSH_ASKPASS_REQUIRE: "force",
    VSCODE_GIT_ASKPASS_MAIN: "a",
    VSCODE_GIT_ASKPASS_NODE: "b",
    VSCODE_GIT_IPC_HANDLE: "c",
    GIT_DIR: "/elsewhere/.git",
    GIT_WORK_TREE: "/elsewhere",
    GIT_INDEX_FILE: "/elsewhere/index",
    GIT_CONFIG_PARAMETERS: "'credential.helper'='store'",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "store",
    GIT_TERMINAL_PROMPT: "1",
    LC_ALL: "nb_NO.UTF-8",
    LANGUAGE: "nb:no",
    LC_MESSAGES: "nb_NO.UTF-8",
  });
  assert.deepEqual(env, {
    PATH: "/usr/bin",
    HOME: "/home/x",
    HTTPS_PROXY: "http://proxy:3128",
    GIT_SSL_CAINFO: "/etc/ca.pem",
    // LC_ALL røres ikke; LANGUAGE går foran den for meldinger.
    LC_ALL: "nb_NO.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    LANGUAGE: "C",
    LC_MESSAGES: "C",
  });
});

test("sanitizedGitEnv: navn sammenlignes uten hensyn til store/små bokstaver (Windows)", () => {
  const env = sanitizedGitEnv({ Path: "C:\\Git\\cmd", git_askpass: "x", Vscode_Git_Ipc_Handle: "y", git_terminal_prompt: "1", Language: "nb" });
  assert.deepEqual(env, { Path: "C:\\Git\\cmd", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", LANGUAGE: "C", LC_MESSAGES: "C" });
});

test("sanitizedGitEnv: endrer ikke input, og bruker process.env som standard", () => {
  const input = { GIT_ASKPASS: "x" };
  sanitizedGitEnv(input);
  assert.deepEqual(input, { GIT_ASKPASS: "x" });
  assert.equal(sanitizedGitEnv().GIT_TERMINAL_PROMPT, "0");
});

test("buildCloneArgs: -c-isolasjon før clone, -- før url, ingen GIT_CONFIG_GLOBAL/NOSYSTEM", () => {
  const args = buildCloneArgs(URL, "/d/ola_x");
  assert.deepEqual(args, [
    "-c", "credential.helper=",
    "-c", "core.askPass=",
    "-c", "http.extraHeader=",
    "-c", `http.${URL}.extraHeader=`,
    "-c", `url.${URL}.insteadOf=${URL}`,
    "-c", "protocol.allow=never",
    "-c", "protocol.https.allow=always",
    "clone", "--quiet", "--", URL, "/d/ola_x",
  ]);
  assert.ok(!args.join(" ").includes("GIT_CONFIG"));
});

function withFakeGit(script, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-fakegit-"));
  const git = path.join(dir, "git");
  writeFileSync(git, `#!${process.execPath}\n${script}\n`);
  chmodSync(git, 0o755);
  const saved = { PATH: process.env.PATH, GIT_ASKPASS: process.env.GIT_ASKPASS, VSCODE_GIT_IPC_HANDLE: process.env.VSCODE_GIT_IPC_HANDLE };
  process.env.PATH = dir;
  process.env.GIT_ASKPASS = "/lekker/askpass";
  process.env.VSCODE_GIT_IPC_HANDLE = "/lekker/ipc";
  const root = mkdtempSync(path.join(tmpdir(), "cc-root-"));
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  };
  let result;
  try {
    result = fn({ dir, root, git });
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

// Skriver argv og relevante env-variabler til <dest>/seen.json.
const RECORD = `const fs=require("node:fs");const a=process.argv.slice(2);const d=a[a.length-1];fs.mkdirSync(d,{recursive:true});
const e={};for(const k of Object.keys(process.env))if(/ASKPASS|^VSCODE_GIT|^GIT_TERMINAL_PROMPT$|^GIT_CONFIG|^GIT_DIR$|^LANGUAGE$|^LC_MESSAGES$/i.test(k))e[k]=process.env[k];
fs.writeFileSync(d+"/seen.json",JSON.stringify({a,e}));`;

const posixOnly = { skip: process.platform === "win32" ? "POSIX-skript" : false };

test("cloneRepo (sync): git får isolasjonsargumentene og sanert miljø", posixOnly, () => {
  withFakeGit(RECORD, ({ root }) => {
    const dest = path.join(root, "ola_x");
    assert.deepEqual(cloneRepo("ola/x", dest, root), { ok: true, via: "git" });
    const seen = JSON.parse(readFileSync(path.join(dest, "seen.json"), "utf8"));
    assert.deepEqual(seen.a, buildCloneArgs(URL, dest));
    assert.deepEqual(seen.e, { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", LANGUAGE: "C", LC_MESSAGES: "C" });
  });
});

test("cloneRepoAsync: samme argumenter og miljø som cloneRepo", posixOnly, () =>
  withFakeGit(RECORD, async ({ root }) => {
    const dest = path.join(root, "ola_x");
    assert.deepEqual(await cloneRepoAsync("ola/x", dest, root), { ok: true, via: "git" });
    const seen = JSON.parse(readFileSync(path.join(dest, "seen.json"), "utf8"));
    assert.deepEqual(seen.a, buildCloneArgs(URL, dest));
    assert.deepEqual(seen.e, { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", LANGUAGE: "C", LC_MESSAGES: "C" });
  })
);

test("cloneRepoAsync: ugyldig repo kaller ikke git", posixOnly, () =>
  withFakeGit(`require("node:fs").writeFileSync(require("node:path").dirname(process.argv[1])+"/kalt","1")`, async ({ dir, root }) => {
    assert.deepEqual(await cloneRepoAsync("../x", path.join(root, "y"), root), { ok: false, error: "invalid repo" });
    assert.equal(existsSync(path.join(root, "y")), false);
    assert.equal(existsSync(path.join(dir, "kalt")), false);
  })
);

test("cloneRepoAsync: feil fra git gir stderr som feilmelding og rydder halvferdig mappe", posixOnly, () =>
  withFakeGit(
    `const fs=require("node:fs");const d=process.argv[process.argv.length-1];fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+"/halv","x");process.stderr.write("fatal: could not read Username\\n");process.exit(128);`,
    async ({ root }) => {
      const dest = path.join(root, "s", "ola_x");
      mkdirSync(path.dirname(dest), { recursive: true });
      assert.deepEqual(await cloneRepoAsync("ola/x", dest, root), { ok: false, error: "fatal: could not read Username", reason: "no_access" });
      assert.equal(existsSync(dest), false);
    }
  )
);

test("cloneRepoAsync: AbortSignal dreper git, rydder mappen og gir aborted", posixOnly, () =>
  withFakeGit(
    `const fs=require("node:fs");const d=process.argv[process.argv.length-1];fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+"/halv","x");setInterval(()=>{},1000);`,
    async ({ root }) => {
      const dest = path.join(root, "s", "ola_x");
      mkdirSync(path.dirname(dest), { recursive: true });
      const ac = new AbortController();
      const p = cloneRepoAsync("ola/x", dest, root, { signal: ac.signal });
      // Vent til git faktisk har startet og laget mappen.
      for (let i = 0; i < 200 && !existsSync(path.join(dest, "halv")); i++) await new Promise((r) => setTimeout(r, 10));
      ac.abort();
      assert.deepEqual(await p, { ok: false, aborted: true });
      assert.equal(existsSync(dest), false);
    }
  )
);

test("cloneRepoAsync: allerede avbrutt signal starter ikke git", posixOnly, () =>
  withFakeGit(RECORD, async ({ root }) => {
    const dest = path.join(root, "ola_x");
    assert.deepEqual(await cloneRepoAsync("ola/x", dest, root, { signal: AbortSignal.abort() }), { ok: false, aborted: true });
    assert.equal(existsSync(dest), false);
  })
);

test("cloneRepoAsync: git som ikke finnes gir feilkode, ikke unntak", () =>
  withFakeGit(RECORD, async ({ root }) => {
    const res = await cloneRepoAsync("ola/x", path.join(root, "ola_x"), root, { gitPath: path.join(root, "finnes-ikke-git") });
    assert.deepEqual(res, { ok: false, error: "ENOENT", reason: "failed" });
  })
);

test("classifyCloneError: privat/slettet/ukjent repo -> no_access, alt annet -> failed", () => {
  for (const msg of [
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    "fatal: could not read Password for 'https://github.com': terminal prompts disabled",
    "remote: Repository not found.\nfatal: repository 'https://github.com/ola/x.git/' not found",
    "fatal: Authentication failed for 'https://github.com/ola/x.git/'",
    "fatal: unable to access 'https://github.com/ola/x.git/': The requested URL returned error: 403",
    "fatal: unable to access 'https://github.com/ola/x.git/': The requested URL returned error: 404",
    "error: The requested URL returned error: 401",
  ]) {
    assert.equal(classifyCloneError(msg), "no_access", msg);
  }
  for (const msg of [
    "fatal: unable to access 'https://github.com/ola/x.git/': Could not resolve host: github.com",
    "fatal: unable to access 'https://github.com/ola/x.git/': The requested URL returned error: 500",
    "fatal: could not create work tree dir '/x': No space left on device",
    "fatal: unable to access 'https://github.com/ola/x.git/': The requested URL returned error: 4040",
    "",
    undefined,
  ]) {
    assert.equal(classifyCloneError(msg), "failed", String(msg));
  }
});

test("cloneRepo (sync): git exit 128 uten tilgang -> no_access, mappen ryddet, gh kalles ikke", posixOnly, () => {
  withFakeGit(
    `const fs=require("node:fs");const d=process.argv[process.argv.length-1];fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+"/halv","x");process.stderr.write("fatal: could not read Username for 'https://github.com': terminal prompts disabled\\n");process.exit(128);`,
    ({ dir, root }) => {
      // En falsk gh som ville lagt igjen et spor hvis den ble kalt.
      writeFileSync(path.join(dir, "gh"), `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(path.join(dir, "gh-kalt"))},"1")\n`);
      chmodSync(path.join(dir, "gh"), 0o755);
      const dest = path.join(root, "s", "ola_x");
      mkdirSync(path.dirname(dest), { recursive: true });
      const res = cloneRepo("ola/x", dest, root);
      assert.equal(res.ok, false);
      assert.equal(res.reason, "no_access");
      assert.equal(existsSync(dest), false);
      assert.equal(existsSync(path.join(dir, "gh-kalt")), false);
    }
  );
});

test("cloneRepo (sync): annen git-feil -> failed med stderr i error", posixOnly, () => {
  withFakeGit(
    `process.stderr.write("fatal: unable to access: Could not resolve host: github.com\\n");process.exit(128);`,
    ({ root }) => {
      assert.deepEqual(cloneRepo("ola/x", path.join(root, "ola_x"), root), {
        ok: false,
        error: "fatal: unable to access: Could not resolve host: github.com",
        reason: "failed",
      });
    }
  );
});
