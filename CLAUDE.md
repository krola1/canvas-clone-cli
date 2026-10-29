@.claude/docs/STATUS.md

# canvas-clone-cli

Interaktivt Node.js-CLI: velg kurs/fagretning/modul/oppgave i Canvas, klon
elevenes GitHub-repo til en øktmappe per kjøring,
`~/canvas-clone/grading/<YYYYMMDD-HHMMSS>-<pid>/<assignment_id>/<eier>_<repo>/`
(`<økt>/<kurs>/<assignment_id>/...` ved bulk på tvers av kurs), åpne valgfritt
i editor etterpå. Øktmappen slettes alltid (Enter, Ctrl-C/Esc, EOF; rester
etter krasj ryddes ved neste kjøring). Full bruksbeskrivelse: `README.md`.

Generelle preferanser (fish-kompatible kommandoer, `set -Eeuo pipefail` i
bash-scripts, norsk i svar, spør ved uklarhet) arves fra global
`~/.claude/CLAUDE.md` og gjentas ikke her.

## Konvensjoner

- Ren ESM (`"type": "module"`), Node ≥18, **ingen build-steg** (ingen
  transpilering/bundling) for CLI-et og `src/`. Unntak: VS Code-utvidelsen i
  `vscode/` bundles med esbuild (`npm run build` der), se `DECISIONS.md`
  (2026-10-29).
- Minimalt avhengighetssett: `@inquirer/prompts` (interaktivitet), `ora`
  (spinnere). Vurder nøye før en tredje avhengighet legges til.
- All brukervendt tekst ligger samlet i `src/strings.js` (norsk/engelsk via
  `joeMode`) — ikke hardkod tekststrenger andre steder i koden.
- All sletting går gjennom `safeRemove()` i `src/storage.js` — ingen
  `rmSync` andre steder. `exec`/`execSync` og `shell: true` er forbudt;
  `execFile`/`spawn` med argumentliste er tillatt (tilsynets T6+/T-N4).
  Gjelder også `vscode/` (T17).
- Innleveringens fritekst (`body`) brukes bare i `listSubmissions`/
  `extractRepo` og skal aldri skrives, logges eller vises (tilsynets T-A).
- Config og cache er ren JSON på disk (XDG-sti), ikke OS-keychain. Se
  `.claude/docs/DECISIONS.md` for begrunnelse og åpne spørsmål rundt dette.

## Kommandoer

```fish
npm install          # installer avhengigheter
npm install -g .     # symlink inn i global npm-bin, kommandoen `canvas-clone` blir tilgjengelig
canvas-clone --help  # full flagg-referanse
canvas-clone --setup # kjør førstegangsoppsettet på nytt
npm test             # kjør testsuiten (node:test, inkl. e2e i tests/e2e.test.js)
npm run release-check # npm ci + npm audit før deling
```

Ingen lint-script finnes ennå (se `.claude/docs/STATUS.md`, teknisk gjeld).

## Arkitektur i hovedtrekk

```
bin/canvas-clone.js   FSM-orkestrator: fase-basert navigasjon (course → category →
                       submodule → assignment → fetch_submissions → clone_scope /
                       bulk_fetch), flagg-parsing, Esc/venstre-pil-håndtering, kloning.
src/canvas.js          Canvas API: kurs+oppgaver, innleveringer, paginering (Link-header).
src/categories.js      Gjetter fagretning/modul fra oppgavenavn via regex (ingen ekte
                        Canvas-kategori-metadata finnes).
src/github.js           Plukker "eier/repo" ut av innleveringstekst (validerer eier/repo
                        etter GitHubs regler), kloner med git uten lærerens pålogging
                        (T18: sanert miljø + -c-flagg; cloneRepo sync, cloneRepoAsync),
                        skiller «uten tilgang» fra andre klonefeil. Ingen gh.
src/storage.js          Lagringsrot, øktmapper (PID i navnet er låsen), oppstartsrydding,
                        mappenavn (<eier>_<repo>, -2 ved kollisjon), safeRemove.
src/grading.js          T1: alle treff på GitHub-eier, valg ved tvetydighet, navn ved duplikat.
src/editor.js           Åpner en mappe i VS Code/Zed (win32: skriver ut kommandoen).
src/config-store.js     Config-fil (XDG/macOS/Windows-sti): lesing/skriving, uten prompts.
src/config.js           Førstegangsoppsett (prompts); re-eksporterer config-store.js.
src/workflow.js         Ren logikk: bulk-filter, mappesti, uten_lenke.txt-format,
                        cross-course-kurs. Delt med VS Code-utvidelsen.
src/cache.js            TTL-basert kurs-/oppgavecache, nøkkelsatt på canvasUrl.
src/concurrency.js      mapWithConcurrency — delt samtidighetsgrense for Canvas-kall.
src/strings.js          All brukervendt tekst, norsk/engelsk via joeMode.
tests/e2e*.test.js      CLI som egen prosess: falsk fetch (tests/helpers/fake-fetch.mjs),
                        falsk git/editor, HOME/XDG til tmp. Hoppes over på win32.
```

Detaljert begrunnelse for disse valgene: `.claude/docs/DECISIONS.md`. Nå-tilstand,
kjente mangler og teknisk gjeld: `.claude/docs/STATUS.md` (importert øverst i denne
filen). Åpne spørsmål om veien videre: `.claude/docs/ROADMAP.md`.

## Arbeidsmåte

- Sjekk `.claude/docs/DECISIONS.md` før større endringer. Si fra hvis oppgaven
  strider mot en beslutning der, før du endrer noe.
- Når brukeren korrigerer deg på noe som trolig gjelder igjen, foreslå en
  regel til denne filen.
- Teknisk gjeld og andre funn utenfor oppgaven noteres under "Observasjoner"
  i `.claude/docs/STATUS.md` — ikke fiks dem uoppfordret.
- Når dere tar en arkitekturbeslutning, foreslå en oppføring i
  `.claude/docs/DECISIONS.md`.
- Når en økt avsluttes, bruk `avslutt-okt`-skillen.

## Subagenter og skills på prosjektnivå

- `.claude/agents/samsvars-sjekker.md` — review-subagent, leser diff mot
  denne filen + `.claude/docs/DECISIONS.md`, endrer ingenting selv.
- `.claude/skills/avslutt-okt/` — oppdaterer `.claude/docs/STATUS.md` og foreslår
  nye `.claude/docs/DECISIONS.md`-oppføringer ved økt-slutt.

Disse er prosjektlokale og uavhengige av rollehierarkiet i `~/dotfiles`
(`~/dotfiles/CLAUDE.md` m.fl.) — ingen navnekollisjon med agentene/skillet
der (`cli-qa-reviewer`, `stow-pakke-sjekker`, `feature-bygger`,
`maskin-hjelper`, `ny-subagent`).
