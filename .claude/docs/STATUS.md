# STATUS.md

Sist oppdatert: 2026-10-29 (D4 for VS Code-utvidelsen; D3, D2, D1, se første punkt
under Nå-tilstand; før det: tilsynets tiltak og personvern-opprydding:
øktmappe under `~/canvas-clone/grading/` og sletting alltid, mappe per
innlevering, T1/T1a ved karaktersetting, bare https, Windows skriver ut
editorkommando — se `DECISIONS.md`, oppføringene fra 2026-10-27).

## Nå-tilstand

- **VS Code-utvidelsen, D4 (2026-10-29, ikke committet):** økter og sletting.
  - Økter under `~/canvas-clone/vscode/<YYYYMMDD-HHMMSS>-<8 hex>/` med markøren
    `.canvas-clone-okt` (mtime = hjerteslag fra øktvinduet hvert 5. s) og
    `<økt>/.vscode/settings.json` (Local History av m.m.). Én felles regel
    (`vurderOkt`/`kanGjenopptas` i `vscode/src/okter.mjs`) for når hovedvinduet
    sletter (ferdig, eller forlatt: hjerteslag > 180 s og hovedvinduet våkent
    ≥ 30 s) og når et øktvindu som starter igjen får fortsette (hjerteslag < 60 s).
  - Øktvinduet: «Ferdig med økten» (kommando + statuslinjeknapp) med advarsel
    ved ulagrede filer (T11c), ferdig-markør med `workspaceStorage`-stien, så
    `closeWindow`; T9d-modal når vinduet er betrodd. Hovedvinduet: rydder hvert
    3. s (ferdige økter ca. 7 s etter «Ferdig»), sletter `workspaceStorage/<id>/`
    med egen vakt (T11b), `removeFromRecentlyOpened`, åpner økter med T9b/T9c og
    `noRecentEntry`. All sletting via `safeRemove` etter `sjekkOktSti`.
  - VS Code-delen ligger i `vscode/src/okt-vindu.js`. Ingen bla/klone-UI ennå
    (D5); interne kommandoer `canvasClone._nyOkt`/`_apneOkt`/`_rydd`/`_okt`/
    `_tillitsSjekk`.
  - Tester: rot-`npm test` 154 (122 + 32 nye i `tests/vscode-okter.test.js`,
    ingen eksisterende endret; to av dem hoppes over på win32 og som root).
    VS Code under `xvfb-run`: betrodd 22 (hovedvindu, inkl. D3) + 10
    (øktvindu), uten tillit 8. Hver kjøring har eget `HOME` under
    `vscode/.vscode-test/hjem-*`.
  - Lars' avgjørelser etter D4 står i `DECISIONS.md`, blant annet at rester
    (øktnavn-mapper uten markør) slettes etter 180 s, og at T12 («slett alle
    nå» og «vis hva som ble liggende») bygges i D5.
  - Prøvekjøringer med to ekte vinduer (VS Code 1.100.0, egen user-data-dir,
    extensions-dir og HOME) står i D0-notatet («D4-funn»). Fant og rettet én feil
    (hovedvinduet opphevet «Ferdig» for økter det selv hadde laget).
  - Beslutningen står i `DECISIONS.md` (2026-10-29, D4).

- **VS Code-utvidelsen, D3 (2026-10-29, ikke committet):** oppsett og token.
  Kommandoene «Canvas Clone: Oppsett (Canvas-URL og token)» og «Canvas Clone:
  Slett token og Canvas-URL». URL i `globalState`, token bare i SecretStorage,
  sjekk med `whoAmI` før noe lagres, varsel ved aktivering når tokenet har
  forsvunnet (ingen nøkkelring). Ren logikk i `vscode/src/oppsett.mjs`,
  tekster i `src/strings.js` (`vsc*`, språk etter `vscode.env.language`).
  `vscode/README.md` forklarer oppsett, to tokens, sletting og nøkkelring.
  Tester: rot-`npm test` 122 (114 + 8 nye i `tests/vscode-oppsett.test.js`,
  ingen eksisterende endret); VS Code 10/10 betrodd og 4/4 uten tillit under
  `xvfb-run`, begge med `--use-inmemory-secretstorage`. SecretStorage-funnene
  står i D0-notatet («D3-funn»), beslutningen i `DECISIONS.md`.
  - Språk (Lars, 2026-10-29): beholdes som nå. Meldingene følger VS Code
    (i praksis engelsk for de fleste), kommandotitlene og README er norske.
  - Karakterpanelet (D6) ligger i hovedvinduet (Lars, 2026-10-29), så øktvinduet
    trenger ikke tokenet.
  - Ikke testet, ført opp på D8-sjekklisten under: varselet om token som
    forsvant i et ekte vindu, ekte nøkkelring og at tokenet er per vindu.

- **VS Code-utvidelsen, D2 (2026-10-29, committet som `0e05095`):** skjelett i
  `vscode/` uten funksjonalitet utover aktivering og kommandoen
  «Canvas Clone: Om». esbuild til CJS (`vscode/dist/extension.js`),
  `.vscodeignore` som hviteliste, pakkesjekk (`npm run check-package`, T14a),
  røyktester mot VS Code 1.100.0 med og uten tillit, og CI for tre OS
  (`.github/workflows/ci.yml`). Se `DECISIONS.md` (2026-10-29, build-steg
  bare i `vscode/`). Rot-`npm test` er fortsatt 114; VS Code-testene er
  grønne lokalt under `xvfb-run` (2/2 betrodd, 3/3 uten tillit). Utgiver
  `krola1`, øktmarkør `.canvas-clone-okt`, MIT-lisens. Testen av Reload
  Window og tillitsoverganger (D0, «Må prøves i praksis, D2») er utsatt
  til D4, der hjerteslaget bygges (Lars, 2026-10-29).

- **VS Code-utvidelsen, D1 (2026-10-29, committet som `d8c5885`):** felles kjerne i
  `src/` uten VS Code-kode.
  - `src/workflow.js`: ren logikk flyttet ut av `bin/` (bulk-filter,
    mappesti, `uten_lenke.txt`-format, cross-course-kurs), med
    karakteriseringstester i `tests/workflow.test.js`.
  - `src/config-store.js`: config-sti/lesing/skriving uten `@inquirer`/`ora`;
    `config.js` re-eksporterer og beholder oppsettet.
  - `src/github.js`: T18-isolasjon for all kloning (sanert miljø, `-c`-flagg),
    delt mellom `cloneRepo` (CLI, sync) og ny `cloneRepoAsync` (utvidelsen).
    `gh`-reserveløsningen er fjernet. Private/slettede repo får egen grunn
    «uten tilgang» i `uten_lenke.txt` og utskriften (`classifyCloneError`,
    `reason` på resultatet); andre feil er fortsatt «klone-feil».
    Tester i `tests/clone-isolation.test.js` og `tests/e2e-no-access.test.js`.
  - `npm test` = 114 tester (var 85). To eksisterende tester er endret med én
    linje hver fordi git nå får `-c`-flagg foran `clone`
    (`tests/github.test.js`, `tests/e2e.test.js`), godkjent av Lars.
  - Beslutningene står i `DECISIONS.md` (tre oppføringer 2026-10-29).

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
  - **VS Code-utvidelsen (D8):**
    - Varselet om token som forsvant, med den ekte utvidelsen: Linux med
      `--password-store=gnome-libsecret` uten D-Bus, oppsett, ekte omstart →
      varsel → «Kjør oppsett».
    - Oppsett med ekte nøkkelring på Windows (DPAPI), macOS (Keychain) og
      Linux (libsecret), og at tokenet overlever omstart.
    - Den modale «keyring»-dialogen: hva skjer hvis læreren avbryter den
      (avvises `store()`, eller lagres tokenet i minnet)?
    - Uten nøkkelring: at tokenet bare finnes i vinduet der det ble lagt inn.
    - D4 på Windows og macOS: «Ferdig» og sletting mens vinduet lukkes (`EBUSY`),
      sletting av `workspaceStorage/<id>/` (lås på `state.vscdb`), og at
      `workspace.json` sin URI sammenlignes riktig med øktstien (stasjonsbokstav,
      store/små bokstaver).
    - D4 med ekte hvilemodus (prøvd bare med SIGSTOP/SIGCONT på Linux) og med
      VS Code-ens «Restart to Update».
    - D4: lukk øktvinduet med krysset og se at økten slettes etter ca. 3 min.
    - D4: tillitsoverganger i praksis (ikke betrodd → betrodd gir T9d uten
      omstart; betrodd → ikke betrodd gir omstart og økten fortsetter).
    - D4: delvis sletting og «slettes»-navnet på Windows (node-testene for
      dette hoppes over på win32).
    - D4: øktvinduet åpnet i en profil der utvidelsen ikke er installert (da
      slår ingen hjerteslag, og økten slettes etter ca. 3 min).
    - T18: `code` startet fra en ekte VS Code-terminal (miljøet er bare
      simulert i riggen).
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

- CI (`.github/workflows/ci.yml`, tre OS) er satt opp, men har ikke kjørt ennå.
- Ingen typesjekking (ren JS, ingen TypeScript eller JSDoc-typer).
- `package-lock.json` er committet; `npm run release-check` kjører `npm ci` +
  `npm audit`, men bare når noen kjører den for hånd (ikke en del av CI).

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
- `~/.vscode/argv.json` leses også av test-VS Code (uansett `--user-data-dir`).
  På Lars' maskin står `"password-store": "basic"` der, så VS Code på denne
  maskinen lagrer hemmeligheter med obfuskering, ikke nøkkelringen. Røyktestene
  er isolert fra dette med `--use-inmemory-secretstorage`; andre verdier i
  argv.json (f.eks. crash reporter) påvirker fortsatt testkjøringene. (2026-10-29)
