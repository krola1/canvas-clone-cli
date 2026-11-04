// Ren logikk for lenken til elevens GitHub Pages (0.2.0). Ingen import av
// `vscode` her, slik at alt kan testes med `node --test`
// (tests/vscode-pages.test.js; .mjs fordi vscode/package.json ikke har
// "type": "module"). VS Code-delen (Uri, åpning i nettleseren) ligger i ./pages-vindu.js.
//
// Flyten:
//   1. Læreren velger en innlevering i trevisningen, eller panelet bindes til en
//      (bla-vindu.js / panel-vindu.js). Da, og bare da, kalles `sjekk.sjekk(eier, repo)`.
//   2. Ett uautentisert `GET https://api.github.com/repos/{eier}/{repo}` per eier/repo
//      (høyst 2 samtidig). Bare `has_pages` leses fra svaret.
//   3. `lenkeFor(sub, sjekk.status(eier, repo))` sier om lenken vises: «bekreftet»,
//      «ikke sjekket» (gjettet), eller ingen lenke (GitHub sier nei).
//
// Tilsynets krav (risikovurderinger 2026-11-04):
// - P2: URL-en bygges bare av eier/repo fra innleveringen (`pagesMal`), aldri av
//   `html_url`/`cname` fra API-et. `erGyldigPagesUri` sjekkes rett før åpning.
// - P4: ingen Authorization, ingen token, fast User-Agent, `redirect: "manual"`;
//   bare 200 (med has_pages som boolean) og 404 tolkes. Rate limit (429, eller 403
//   med x-ratelimit-remaining 0) gir en sperre i minnet. Ingen eier/repo eller svartekst i feil eller logg (T11).
// - P5: status bare i en Map i minnet, aldri på disk eller i VS Code-state.
import { isValidOwner, isValidRepoName } from "../../src/github.js";

export const API_BASE = "https://api.github.com";
export const USER_AGENT = "canvas-clone-vscode";
export const PAGES_SAMTIDIGHET = 2;
// Sperre når GitHub sier rate limit uten `x-ratelimit-reset` (Lars 2026-11-04).
export const SPERRE_UTEN_RESET_MS = 60 * 60 * 1000;

// Verten må være nøyaktig «<eier med små bokstaver>.github.io» (P2).
export const PAGES_VERT = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}\.github\.io$/;

// Status for ett eier/repo: "bekreftet" (has_pages true), "ingen" (has_pages false
// eller 404), "ikke_sjekket" (alt annet). `undefined` = ikke sjekket ennå.
export const STATUS = Object.freeze({ bekreftet: "bekreftet", ingen: "ingen", ikkeSjekket: "ikke_sjekket" });

// { authority, path } for Pages-siden til eier/repo, eller null. Brukerside
// (repo «ola.github.io» hos «ola») -> "/", ellers "/<repo>/". Stien er følsom for
// store/små bokstaver på github.io (D0-notatet, Pages-funn), så repo-navnet
// brukes slik det står; verten skrives med små bokstaver.
export function pagesMal(owner, repo) {
  if (!isValidOwner(owner) || !isValidRepoName(repo)) return null;
  const authority = `${owner.toLowerCase()}.github.io`;
  if (!PAGES_VERT.test(authority)) return null;
  const path = repo.toLowerCase() === authority ? "/" : `/${repo}/`;
  return { authority, path };
}

// Ren tekst for visning (tooltip), samme mal som lenken som åpnes.
export function pagesTekst(mal) {
  return mal ? `https://${mal.authority}${mal.path}` : null;
}

// Eier og repo fra «eier/repo» (sub.repo eller binding.repo), validert, eller null.
export function delRepo(repo) {
  if (typeof repo !== "string") return null;
  const deler = repo.split("/");
  if (deler.length !== 2) return null;
  const [owner, name] = deler;
  return isValidOwner(owner) && isValidRepoName(name) ? { owner, repo: name } : null;
}

// Sjekken rett før åpning i nettleseren (P2). `u` er et vscode.Uri (scheme, authority,
// path, query, fragment) eller en streng. Bare https, vert etter PAGES_VERT,
// ingen userinfo/port, sti "/" eller "/<gyldig repo>/", ingen query/fragment.
export function erGyldigPagesUri(u) {
  let deler;
  if (typeof u === "string") {
    let url;
    try {
      url = new URL(u);
    } catch {
      return false;
    }
    if (url.username || url.password || url.port) return false;
    // URL normaliserer (store bokstaver i verten, %2e%2e, standardport); strengen
    // må allerede være på normalform.
    if (u !== url.href) return false;
    deler = { scheme: url.protocol.replace(/:$/, ""), authority: url.host, path: url.pathname, query: url.search, fragment: url.hash };
  } else if (u && typeof u === "object") {
    deler = { scheme: u.scheme, authority: u.authority, path: u.path, query: u.query, fragment: u.fragment };
  } else {
    return false;
  }
  if (deler.scheme !== "https") return false;
  if (typeof deler.authority !== "string" || !PAGES_VERT.test(deler.authority)) return false;
  if (deler.query !== "" || deler.fragment !== "") return false;
  if (deler.path === "/") return true;
  const m = typeof deler.path === "string" ? deler.path.match(/^\/([^/]+)\/$/) : null;
  return Boolean(m && isValidRepoName(m[1]));
}

// Lenken for en innlevering (eller binding) med `repo` = «eier/repo», gitt
// statusen fra sjekken. { tilstand: "bekreftet" | "ikke_sjekket", mal } eller null.
export function lenkeFor(sub, status) {
  const r = delRepo(sub?.repo);
  if (!r) return null;
  const mal = pagesMal(r.owner, r.repo);
  if (!mal) return null;
  if (status === STATUS.ingen) return null;
  return { tilstand: status === STATUS.bekreftet ? "bekreftet" : "ikke_sjekket", mal };
}

// Nøkkel i Map-en: GitHub skiller ikke på store/små bokstaver i eier og repo.
export const pagesNokkel = (owner, repo) => `${owner}/${repo}`.toLowerCase();

// Sjekken mot GitHub, én per vindu (extension.js). `fetch` slås opp av kalleren
// ved hvert kall (kritiker 2026-11-04: ellers bruker VS Code-testene ekte fetch).
// `naa()` gir tiden i ms (falsk klokke i testene).
export function lagPagesSjekk({ fetch, naa = () => Date.now(), apiBase = API_BASE, samtidighet = PAGES_SAMTIDIGHET } = {}) {
  let statuser = new Map(); // nøkkel -> Promise<status> | status
  let sperretTil = 0;
  const lyttere = new Set();
  let aktive = 0;
  const ko = [];

  const varsle = (nokkel) => {
    for (const f of lyttere) {
      try {
        f(nokkel);
      } catch {
        // en lytter skal ikke stoppe de andre
      }
    }
  };
  const sperret = () => naa() < sperretTil;

  async function plass() {
    if (aktive < samtidighet) {
      aktive++;
      return;
    }
    await new Promise((r) => ko.push(r));
  }
  function slipp() {
    const neste = ko.shift();
    if (neste) neste();
    else aktive--;
  }

  function settSperre(res) {
    const reset = Number(res.headers?.get?.("x-ratelimit-reset"));
    const til = Number.isFinite(reset) && reset > 0 ? reset * 1000 : naa() + SPERRE_UTEN_RESET_MS;
    sperretTil = Math.max(sperretTil, til);
  }

  // Gir { status, lagre }. `lagre: false` ved rate limit, så neste valg prøver igjen.
  async function hent(owner, repo) {
    let res;
    try {
      res = await fetch(`${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        method: "GET",
        headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
        redirect: "manual",
      });
    } catch {
      return { status: STATUS.ikkeSjekket, lagre: true };
    }
    const remaining = res.headers?.get?.("x-ratelimit-remaining");
    // Rate limit: 429, eller 403 med `x-ratelimit-remaining: 0` (leveranse-kritiker
    // 2026-11-04). Annen 403 (f.eks. repo sperret av GitHub) gjelder bare dette
    // repoet: «ikke sjekket», ingen sperre.
    if (res.status === 429 || (res.status === 403 && remaining === "0")) {
      settSperre(res);
      return { status: STATUS.ikkeSjekket, lagre: false };
    }
    if (remaining === "0") settSperre(res);
    if (res.status === 404) return { status: STATUS.ingen, lagre: true };
    if (res.status !== 200) return { status: STATUS.ikkeSjekket, lagre: true };
    let data;
    try {
      data = await res.json();
    } catch {
      return { status: STATUS.ikkeSjekket, lagre: true };
    }
    if (data?.has_pages === true) return { status: STATUS.bekreftet, lagre: true };
    if (data?.has_pages === false) return { status: STATUS.ingen, lagre: true };
    return { status: STATUS.ikkeSjekket, lagre: true };
  }

  return {
    // Status som den er nå (undefined = ikke sjekket ennå eller pågår).
    status(owner, repo) {
      const v = statuser.get(pagesNokkel(owner, repo));
      return typeof v === "string" ? v : undefined;
    },
    // Sjekker eier/repo én gang (til tom()). Gir et løfte om statusen.
    sjekk(owner, repo) {
      if (!isValidOwner(owner) || !isValidRepoName(repo)) return Promise.resolve(STATUS.ikkeSjekket);
      const nokkel = pagesNokkel(owner, repo);
      const kjent = statuser.get(nokkel);
      if (kjent !== undefined) return Promise.resolve(kjent);
      if (sperret()) return Promise.resolve(STATUS.ikkeSjekket);
      const map = statuser;
      const lofte = (async () => {
        await plass();
        let r;
        try {
          r = sperret() ? { status: STATUS.ikkeSjekket, lagre: false } : await hent(owner, repo);
        } finally {
          slipp();
        }
        // tom() i mellomtiden: svaret forkastes, ingen varsling.
        if (map !== statuser) return r.status;
        if (r.lagre) {
          map.set(nokkel, r.status);
          varsle(nokkel);
        } else {
          map.delete(nokkel);
        }
        return r.status;
      })();
      map.set(nokkel, lofte);
      return lofte;
    },
    // «Oppdater fra Canvas»: alle statuser glemmes (sperren for rate limit står).
    tom() {
      statuser = new Map();
      varsle(null);
    },
    // `fn(nokkel)` når en status er klar; `nokkel` er null etter tom().
    onEndret(fn) {
      lyttere.add(fn);
      return { dispose: () => lyttere.delete(fn) };
    },
    get sperretTil() {
      return sperretTil;
    },
  };
}
