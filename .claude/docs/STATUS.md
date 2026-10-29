# STATUS.md

Sist oppdatert: 2026-10-29 (tilsynets tiltak og personvern-opprydding:
øktmappe under `~/canvas-clone/grading/` og sletting alltid, mappe per
innlevering, T1/T1a ved karaktersetting, bare https, Windows skriver ut
editorkommando — se `DECISIONS.md`, oppføringene fra 2026-10-27).

## Nå-tilstand

- Interaktivt CLI er ferdig og i bruk: velg kurs → fagretning → modul →
  oppgave, klon elevenes GitHub-repo enkeltvis eller i bulk, åpne i editor.
- Pushet til `https://github.com/krola1/canvas-clone-cli`, `main` spores mot
  `origin/main`.
- **Øktmappe og sletting alltid:** repoer klones til
  `~/canvas-clone/grading/<YYYYMMDD-HHMMSS>-<pid>/`, som slettes ved Enter,
  Ctrl-C/Esc, EOF og feil; rester etter krasj ryddes ved neste kjøring.
  Oppstartsryddingen sletter bare øktmapper med død PID; ukjente filer/mapper
  under roten røres ikke (advarsel), levende økter fra andre kjøringer meldes,
  og er roten eller `~/canvas-clone` en symlenke ryddes ingenting (advarsel).
  `--temp` er utfaset (no-op med melding). Gamle `./grading` i cwd gir bare
  advarsel. Ny `src/storage.js` er eneste fil som sletter.
- **Karaktersetting (T1/T1a):** `--github` velger aldri første treff ved
  samme eier; Canvas-navn i bekreftelsen. Ny `src/grading.js`.
- **Tester:** `npm test` = 85 tester (2026-10-29), inkl. `tests/storage.test.js`,
  `tests/grading.test.js`, `tests/editor.test.js` og `tests/e2e.test.js`
  (CLI som egen prosess med falsk Canvas/git/editor; hoppes over på win32).
  `npm run release-check` (`npm ci` + `npm audit`) finnes.
- **Lars' manuelle sjekkliste før deling (ikke verifisert ennå):**
  - Karaktersetting på én ufarlig oppgave i ekte Canvas (forhåndsvisning
    først, så `--confirm`).
  - Kloning og sletting (Enter og Ctrl-C) på Windows og macOS.
  - At Windows skriver ut «Åpne med» i stedet for å starte editoren.
  - Enter, Ctrl-C og Esc under ventingen i en ekte terminal (etter
    `stdin.destroy`-rettingen).
  - Ctrl-C midt i en bulk-kloning (forventet: reagerer trolig først etter at
    kloningen er ferdig, men data slettes).
- Tidligere: **Automatisert testsuite** (`npm test`, `node --test`, 29 tester):
  `tests/github.test.js` (`extractRepo`, inkl. gist-regresjon),
  `tests/canvas.test.js` (`whoAmI` sine tre feilklasser, mocket `fetch`),
  `tests/categories.test.js` (`buildCategoryTree`), `tests/cache.test.js`
  (`isFresh`/`ageMinutes`), `tests/config.test.js` (`configDir()` via
  `XDG_CONFIG_HOME`). Alle grønne.
- ~~`--temp`-flagget~~ — erstattet av sletting alltid (se over). Ventingen på
  Enter i terminalen (ikke `code --wait`) er beholdt.
- **Cross-course bulk-kloning er bygget** — `--all-courses`-flagg og
  «🌐 Bulk-klon på tvers av flere kurs»-menyvalg. Fagretning/modul-
  navigasjonen er uendret, bare med data fra flere kurs slått sammen.
  Mappestruktur når dette er brukt: `<økt>/<kurs>/<assignment_id>/<eier>_<repo>/`
  — se ny `DECISIONS.md`-oppføring for begrunnelse og det skjønnsmessige
  valget rundt hvor "kurs faktisk brukt" trekkes.
- **Distribusjonsrobusthet:** `whoAmI` skiller nå nettverksfeil / ugyldig
  token / annen feil i tre distinkte meldinger (brukt i `--setup`), og
  `hasGit()` varsler tydelig hvis `git` mangler på maskinen. Egen
  "Feilsøking"-seksjon i README.
- 3 kjente bugfikser (se `DECISIONS.md`-historikk og commit-historikk):
  gist-lenker ble tidligere feiltolket som repo-lenker, `whoAmI` skilte ikke
  nettverksfeil fra ugyldig token, og allerede klonede repo manglet i
  "åpne i editor"-lista ved bulk-kloning.
- `git status`: uncommittede endringer i applikasjonskoden (denne økten) —
  bevisst latt stå uncommitted for review, se commit-historikk for forrige
  rene tilstand.

## Kjente mangler

- **Gruppeinnleveringer håndteres ikke spesielt** — `studentName`/eierskap er
  bare personen som faktisk leverte i Canvas (dokumentert i README under
  "Kjente begrensninger").
- **Kategorisering er gjetning, ikke ekte data.** Regex på oppgavenavn traff
  ca. 88 % (255/290) i kurs 557 på byggetidspunktet — resten havner synlig i
  "(Ukategorisert)". Ingen alternativ finnes siden Canvas ikke har ekte
  fagkategori-metadata på oppgaver.
- **Testdekning av orkestreringen er delvis:** `tests/e2e.test.js` dekker
  flagg-flytene (bulk-kloning med `--open`, venting/sletting, SIGINT,
  samtidige kjøringer, `--github`). Den interaktive navigasjonen (inquirer-
  prompts) og Esc er fortsatt bare manuelt verifisert.

## Teknisk gjeld

- Ingen CI/build-pipeline.
- Ingen typesjekking (ren JS, ingen TypeScript eller JSDoc-typer).
- `package-lock.json` er committet; `npm run release-check` kjører `npm ci` +
  `npm audit`, men bare når noen kjører den for hånd (ingen CI).

## Observasjoner

- `assignmentCount` i `doneBulk`-meldingen telte tidligere unike
  `assignmentId` alene. I cross-course-modus kan samme `assignmentId` finnes
  i flere kurs (nettopp grunnen til at mappestrukturen trenger kurset i
  stien) — dette ble oppdaget og rettet underveis i cross-course-arbeidet
  (nøkkelen er nå `courseName::assignmentId` når `crossCourse` er aktiv), så
  det er ikke lenger en observasjon, bare nevnt her for sporbarhet.
- `apiGetAll` sin feilmelding ved HTTP-feil viser hele URL-en (kurs-/oppgave-
  ID-er, ingen elevdata). Ufarlig, men kunne vært kortere. (2026-10-27)
- Avslutning etter Enter: `rl.close()` pauser bare stdin, og var stdin en pipe
  som ikke ble lukket (skript, e2e-testene), hang prosessen etter at øktmappen
  var slettet. Rettet ved å kalle `process.stdin.destroy()` når ventingen er
  over. (2026-10-29)
