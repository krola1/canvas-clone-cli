# STATUS.md

Sist oppdatert: 2026-10-25 (bugfikser + testoppsett + distribusjonsrobusthet +
`--temp` + cross-course bulk-kloning — se `DECISIONS.md` for cross-course
mappestruktur-valget).

## Nå-tilstand

- Interaktivt CLI er ferdig og i bruk: velg kurs → fagretning → modul →
  oppgave, klon elevenes GitHub-repo enkeltvis eller i bulk, åpne i editor.
- Pushet til `https://github.com/krola1/canvas-clone-cli`, `main` spores mot
  `origin/main`.
- **Automatisert testsuite finnes nå** (`npm test`, `node --test`, 29 tester):
  `tests/github.test.js` (`extractRepo`, inkl. gist-regresjon),
  `tests/canvas.test.js` (`whoAmI` sine tre feilklasser, mocket `fetch`),
  `tests/categories.test.js` (`buildCategoryTree`), `tests/cache.test.js`
  (`isFresh`/`ageMinutes`), `tests/config.test.js` (`configDir()` via
  `XDG_CONFIG_HOME`). Alle grønne.
- **`--temp`-flagget er bygget** — klon midlertidig, vent på Enter i
  terminalen (ikke `code --wait`/Zed-ekvivalent, som besluttet i
  `DECISIONS.md`), rydd opp repoene som ble klonet i den kjøringen.
- **Cross-course bulk-kloning er bygget** — `--all-courses`-flagg og
  «🌐 Bulk-klon på tvers av flere kurs»-menyvalg. Fagretning/modul-
  navigasjonen er uendret, bare med data fra flere kurs slått sammen.
  Mappestruktur når dette er brukt: `grading/<kurs>/<assignment_id>/<bruker>/`
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
- **Testdekningen dekker rene funksjoner og `whoAmI`** — selve
  orkestreringskoden i `bin/canvas-clone.js` (navigasjonsflyten,
  cross-course-sammenslåingen, `--temp`-oppryddingen) er verifisert manuelt
  (lesing + ende-til-ende røyktest mot en fake Canvas-server/fake
  `git`/`code`), men har ingen automatiserte tester. Ville krevd en god del
  mer mocking-infrastruktur (inquirer-prompts, `spawnSync`, `fetch`) enn det
  som fantes fra før.

## Teknisk gjeld

- Ingen CI/build-pipeline.
- Ingen typesjekking (ren JS, ingen TypeScript eller JSDoc-typer).
- `package-lock.json` er committet, men ingen `npm ci`/lockfile-verifisering
  kjøres noe sted automatisk.

## Observasjoner

- `assignmentCount` i `doneBulk`-meldingen telte tidligere unike
  `assignmentId` alene. I cross-course-modus kan samme `assignmentId` finnes
  i flere kurs (nettopp grunnen til at mappestrukturen trenger kurset i
  stien) — dette ble oppdaget og rettet underveis i cross-course-arbeidet
  (nøkkelen er nå `courseName::assignmentId` når `crossCourse` er aktiv), så
  det er ikke lenger en observasjon, bare nevnt her for sporbarhet.
