# STATUS.md

Sist oppdatert: 2026-10-30 (D8-GUI ikke committet; D8 CI; D7c audit i `vscode/` og DECISIONS for D7, D7b klargjøring for utgivelse, D7a README, D6d-rettinger og B2, D6c, D6b og D6a for VS Code-utvidelsen; D5; D4, D3, D2, D1, se første
punkter under Nå-tilstand; før det: tilsynets tiltak og personvern-opprydding:
øktmappe under `~/canvas-clone/grading/` og sletting alltid, mappe per
innlevering, T1/T1a ved karaktersetting, bare https, Windows skriver ut
editorkommando — se `DECISIONS.md`, oppføringene fra 2026-10-27).

## Nå-tilstand

- **D8-GUI (2026-10-30, ikke committet):** to forbedringer i utvidelsen etter Lars' test mot ekte
  Canvas. (1) Den modale bekreftelsen før sending viser «Nåværende karakter: X» (en: «Current
  grade: X») øverst når eleven har en karakter i Canvas, fra den ferske innleveringen som hentes
  rett før bekreftelsen (`bekreftelse` i `vscode/src/panel.mjs`, ny tekst
  `vscPanelConfirmCurrentGrade`). Ingen karakter (også tom streng): ingen linje. Advarselen ved
  endret karakter er uendret og står fortsatt nederst; begge bruker samme ferske verdi.
  (2) Visningen `canvasClone.tre` er flyttet fra Utforskeren til egen beholder i Activity Bar
  (`viewsContainers.activitybar`, id `canvasClone`, tittel «Canvas Clone», ikon
  `vscode/media/canvas-clone.svg`: egen monokrom 24×24 SVG med `currentColor`). Samme view-id,
  `when` og menyer. Ikonet er lagt til i hvitelisten i `.vscodeignore` og `check-package.mjs`
  (og er påkrevd der); `.vsix` har 6 filer under `extension/` (før 5). `provekjoring.mjs` åpner
  nå `workbench.view.extension.canvasClone` i stedet for Utforskeren. Versjonen er fortsatt
  0.1.0 (CHANGELOG: «Uutgitt»). Tester: rot-`npm test` 217 (+2). VS Code under `xvfb-run -a`:
  `minimum` 22, `bla` 22 (+1: beholder, ikon og `workbench.view.extension.canvasClone`), `panel`
  24 (nye påstander i tre eksisterende tester), `oktvindu` 10, uten tillit 9. `npm run package`
  og `check-package` OK.
- **D8 startet (2026-10-30): CI på tre OS er grønn** (run 41054280391). Første kjøringer avdekket
  bare testfeil, ingen produktfeil: øktsti-testen forventet ikke-kanonisk sti (macOS `/private/var`,
  Windows 8.3-navn; `c56c978`, `b9ee05c`), et kappløp i VS Codes `globalState`-lagring i
  `bla`-suiten på macOS (`b9ee05c`, se Observasjoner), og stasjonsbokstav `d:` mot `D:` i
  VS Code-testene på Windows (`2dc7b9c`, hjelperen `likSti`). Windows: minimum 22, bla 11 + 10
  hoppet over, panel 24, oktvindu 10, uten tillit 9; rot 27 hoppet over. Resten av D8 gjenstår.
- **VS Code-utvidelsen, D7 ferdig (2026-10-30):** `release-check` i `vscode/` stopper først ved
  ikke-committede endringer (`git status --porcelain`); `CLAUDE.md` oppdatert (Lars godkjente).
  Neste: D8.
- **VS Code-utvidelsen, D7c (2026-10-30, committet som `8c653cb`):** audit-funnene i `vscode/` og
  `DECISIONS.md` for D7 (Lars' avgjørelser 2026-10-30). `npm audit fix` (uten `--force`) løftet
  `@azure/identity` 4.14.0 → 4.14.1 og `@azure/msal-node` 6.0.1 → 7.1.2 (via `@vscode/vsce`, bare
  låsefila). Ny `overrides` i `vscode/package.json`: `{"@vscode/test-cli": {"mocha": "$mocha"}}`,
  så `@vscode/test-cli` bruker samme `mocha` 12.0.3 som vår egen devDependency (med `diff` 9.0.0
  og `serialize-javascript` 7.1.4) i stedet for sin egen `mocha` 11.8.0 (`diff` 7.0.0,
  `serialize-javascript` 6.0.2). Låsefila: 2 versjoner endret, 57 oppføringer fjernet (mocha 11 med
  undertre), ingen nye. npm lot først den gamle nestede mocha 11 stå (`ELSPROBLEMS invalid`), så
  de 28 oppføringene under `node_modules/@vscode/test-cli/node_modules/*` ble fjernet for hånd før
  `npm install --ignore-scripts`; `npm ci` godtar låsefila etterpå. Ingen `dependencies`, ingen endring i kode eller tester; bundelen
  `dist/extension.js` er byte-identisk (samme SHA-256 før og etter). **`npm audit`: 0 sårbarheter**
  (før: 6). **`npm run release-check` i `vscode/` er grønn** til ende (npm ci, audit, bygg,
  `vsce package` 7 filer, pakkesjekk OK, SHA-256; `sha256sum -c` OK). Ingen unntak trengtes.
  Tester: rot-`npm test` 215. VS Code under `xvfb-run -a`: `minimum` 22, `bla` 21, `panel` 24,
  `oktvindu` 10, uten tillit 9 (uendret). Ny oppføring i `DECISIONS.md` for D7 (D7a–c).
  Forslag til endring i `CLAUDE.md` (kommandolinjen for `release-check` m.m.) venter på Lars.

- **VS Code-utvidelsen, D7b (2026-10-30, committet som `3d3e786`):** klargjøring for utgivelse. Versjon
  `0.1.0` i `vscode/package.json` (og `package-lock.json`); «Under utvikling» står fortsatt i
  `description` og øverst i README, fordi T-A/T1-V (test mot ekte Canvas) ikke er gjort.
  Ny `vscode/CHANGELOG.md` (0.1.0: hva utvidelsen gjør og kjente begrensninger), og den er med i
  `.vsix` (`extension/changelog.md`). Ny `npm run release-check` i `vscode/`
  (`vscode/scripts/release-check.mjs`, spawn uten shell, npm startes som
  `node $npm_execpath`, stopper ved første feil): `npm ci --ignore-scripts`,
  `npm audit --audit-level=moderate` (hele treet, også dev), bygg, `vsce package`, pakkesjekken,
  og SHA-256 av den faktiske `.vsix`-fila til `canvas-clone-vscode-<versjon>.vsix.sha256`
  (`vscode/scripts/skriv-sjekksum.mjs`, ren logikk i `vscode/scripts/sjekksum.mjs`).
  `*.vsix.sha256` i `.gitignore`. Rot-`release-check` = `release-check:cli` (uendret: `npm ci` +
  `npm audit --omit=dev --audit-level=moderate`) + `npm test` + `release-check:vscode`.
  VS Code-testene (xvfb) er ikke med i løpet. README-ene oppdatert (rot: «Før du deler en ny
  versjon»; `vscode/README.md`: `sha256sum -c`/`shasum -a 256 -c`).
  `npm audit` i `vscode/` feilet ved D7b (6: 2 low, 1 moderate, 3 high); rettet i D7c, se over.
  Tester: rot-`npm test` 215 (211 + 4 i ny `tests/vscode-sjekksum.test.js`). VS Code under
  `xvfb-run -a`: `minimum` 22, `bla` 21, `panel` 24, `oktvindu` 10, uten tillit 9. Røyktesten
  `vsc-tests/aktivering.vsctest.js` hadde versjonen hardkodet (`0.0.1`) og leser den nå fra
  `package.json` (eneste endring i eksisterende tester; Lars 2026-10-30: godtatt).

- **VS Code-utvidelsen, D7a (2026-10-30, committet som `8ab8d09`):** README for lærere, bare
  dokumentasjon. `vscode/README.md` er gjennomgått mot koden og har fått innholdsfortegnelse,
  «Krav», «Installasjon fra .vsix» (SHA-256 med `sha256sum`/`shasum -a 256`/`Get-FileHash`,
  `code --install-extension` eller «Install from VSIX…», avinstallering; filnavn som plassholder,
  ingen release ennå), tabell over de to tokenene (hvor de ligger, hvordan de slettes, utløp, T13),
  utvidet «Tillit» (T9e: arvet tillit fra hjemmemappen, «Workspaces: Manage Workspace Trust»),
  ny seksjon «KI-assistenter» (T15: personopplysninger, ikke la KI lese økten uten skolens
  godkjenning, tillegg i hovedprofilen kjører også i øktvinduet, hva
  `chat.useNestedAgentsMdFiles: false` gjør og ikke gjør), Local History forklart (T11), utvidet
  «Personvern og nettverk» og «Kjente begrensninger» (fra D8-listen under). Rot-`README.md` har
  fått ett avsnitt om utvidelsen. Ingen kodeendringer; rot-`npm test` uendret, 211.

- **VS Code-utvidelsen, D6c ferdig (2026-10-30, committet som `afa5e77`):** sending fra
  karakterpanelet. Gyldig «send» → `listSubmissions` med bindingens ID-er → `vurderFersk`
  («avbryt» = fast tekst i panelet) → modal bekreftelse i extension host (navn fra bundet
  `user_id`, advarsel ved endret karakter) → sjekk at bindingen og generasjonen er de samme →
  `gradeSubmission` under `withProgress`. **Ny GitHub-lenke eller eier siden visningen gir nå
  avbrudd** (Lars 2026-10-30; grunn `endret_lenke`, sammenligner hele `eier/repo`, bindingen har
  fått feltet `repo`). Én sending om gangen (en ny «send» mens en pågår avvises, `opptatt`).
  Suksess: karakter/status fra Canvas sitt svar (bare `grade`/`workflow_state`) inn i bindingen
  (`panel.etterSending`), ny visningsmodell med tomt skjema. Feil: `sendefeil` (bare «HTTP nnn»
  eller nettverksfeilen, tokenet vasket), skjemaet beholdes. OutputChannel: bare «karakter
  sendt». Nye rene funksjoner i `panel.mjs`: `etterSending`, `sendefeil`, `lagPanel().etterSending`.
  Nye tekster: `vscPanelSubmissionChanged`, `vscPanelSendBusy`, `vscPanelRefetchFailed`,
  `vscLogGradeSent`; `vscPanelSendNotYet` og `vscPanelRepoChanged` merket ubrukt.
  README har fått «Sett karakter» med advarsel om at det ikke er testet mot ekte Canvas.
  Tester: rot-`npm test` 207 (203 + 4: `vurderFersk` for ny lenke, `etterSending`,
  `lagPanel.etterSending`, `sendefeil`; tre eksisterende tester i `tests/vscode-panel.test.js`
  endret for avbrudd ved ny lenke, nøkkelsettet med `repo` og nye grunner). VS Code under
  `xvfb-run -a`: `minimum` 22, `bla` 20, `panel` 21 (10 D6b, hvorav én endret for D6c, + 11 nye
  D6c mot falsk Canvas som fanger PUT), `oktvindu` 10, uten tillit 9; pakken 4 filer, pakkesjekk
  OK; prøveriggen `klone` 17/17. `bin/` uendret; i `tests/` er bare `tests/vscode-panel.test.js`
  endret. Falsk Canvas (`vscode/vsc-tests/hjelpere/falsk-canvas.js`) logger nå metode og body og
  har krokene `vedPut`/`vedGet`. Mutasjonssjekk: uten sjekken etter modalen og uten
  én-om-gangen-sperren feiler 3 av D6c-testene.
  **D6d (kontroll), rettinger 2026-10-30, committet som `9aba04f` (B1, usynlige tegn, B3) og
  `276de27` (B2):** `leveranse-kritiker` fant ingen
  blokkerende feil i D6. Rettet:
  - B1 (T-A): feil fra Canvas-kall i utvidelsen viser nå bare «HTTP nnn» eller en vasket
    nettverksfeil, ellers «?» (`canvasFeil`/`tryggDetalj` i `vscode/src/oppsett.mjs`).
    Grunnen er at en JSON-feil fra `res.json()` kan sitere svaret, og svaret kan ha `body`.
    Gjelder henting på nytt i panelet, `sendefeil`, og D5 (`feiltekst` i `bla-vindu.js`:
    meldingen i trevisningen, info-raden under en oppgave og varselet fra «Klon»).
    `src/canvas.js` og CLI-et er uendret. Feilmeldingen ved lenke til en annen vert vises nå
    også som «?».
  - Karakteren avviser også usynlige tegn (U+061C, U+200B–U+200F, U+2028–U+202F,
    U+2060–U+206F, U+FEFF).
  - B3: commit-status i denne filen.
  - B2 (Lars 2026-10-30: ja): etter sending viser treet den nye karakteren. Panelet kaller
    `vedSendt`, og `karakterSatt` i `bla-vindu.js` oppdaterer noden og innleveringen i minnet.
    Det skjer også om læreren har byttet elev under PUT. Description viser nå
    «… (nåværende: X)» når det finnes en karakter. Samme elev åpnet på nytt gir ingen falsk
    advarsel.
  Uendret etter Lars' svar: skjemaet beholdes ved ny lenke, knappen låses ikke, og de ubrukte
  tekstene blir stående.
  Tester etter rettingene (`9aba04f`): rot-`npm test` 211 (207 + 3 i ny
  `tests/vscode-canvasfeil.test.js` + 1 i `tests/vscode-panel.test.js`). VS Code: `minimum` 22,
  `bla` 21 (+1), `panel` 22 (+1), `oktvindu` 10, uten tillit 9; pakkesjekk OK; prøveriggen
  `klone` 17/17.
  Tester etter B2 (`276de27`): `panel` 24 (+2: treet viser ny karakter og ingen falsk advarsel ved
  ny binding; treet oppdateres for riktig elev etter elevbytte under PUT). Rot-`npm test` er
  uendret, 211. Gjeldende tall er altså `panel` 24.
- **VS Code-utvidelsen, D6b ferdig (2026-10-30, committet som `2163fbe`):** karakterpanelet, bare
  visning, ingen sending. `vscode/src/panel-vindu.js` (ett `createWebviewPanel` i
  hovedvinduet; gjenbrukes og bindes på nytt med `lagPanel().bind`; lukket panel = `losne`;
  `retainContextWhenHidden` av, ingen serializer, `localResourceRoots: []`) og
  `vscode/src/panel-html.mjs` (ren: statisk HTML uten tekst, CSP `default-src 'none'` med
  nonce for skript og stil, inline skript som bare bruker `textContent`/`value`, ingen
  `setState`). Ny kommando «Sett karakter …» (`canvasClone.settKarakter`) bare på
  innleveringsnoder (inline og høyreklikk), skjult i kommandopaletten, med `nodeFraArg` som
  «Klon». Quiz og ikke levert gir `feilmelding` (varsel) og tømmer et åpent panel. Alle
  meldinger fra webviewen går gjennom `validerMelding`; avviste gir fast feilmelding i panelet;
  en gyldig «send» gir bare «ikke bygget ennå, ingenting ble sendt» (`vscPanelSendNotYet`).
  Test-kommandoer `_panel`, `_panelMelding`, `_panelBind`, `_panelLukk` bare i
  `ExtensionMode.Test` (prøveriggen sjekker at de ikke finnes ellers).
  Tester: rot-`npm test` 203 (196 + 7 nye i `tests/vscode-panel-html.test.js`, inkl. skriptet
  kjørt mot falsk DOM); VS Code under `xvfb-run -a`: `minimum` 22, `bla` 20, ny kjøring `panel`
  10 (ekte webview laster og sier «klar»), `oktvindu` 10, uten tillit 9; pakken uendret (4 filer,
  pakkesjekk OK); prøveriggen `klone` 17/17. `tests/` og `bin/` uendret.
  **Neste: D6c** — sending: ved gyldig «send» hent innleveringene på nytt (`listSubmissions`
  med bindingens ID-er), `vurderFersk`, `feilmelding` ved «avbryt», modal med `bekreftelse`
  (advarsel ved «advar»), sjekk at bindingen er den samme etter modalen, så
  `gradeSubmission(config, ...sendArgumenter(...))`, uten elevdata i logg/state. Lars' svar på
  D6a-spørsmålene (advar/avbryt, grensene 50/8000/500) trengs før D6c.
- **VS Code-utvidelsen, D6a ferdig (2026-10-30, committet som `c3fbc3f`):** ren logikk for
  karakterpanelet i `vscode/src/panel.mjs` (ingen UI, ingen nye kommandoer): `lagPanel()`
  (binding til kurs, oppgave og `user_id` med generasjon som øker ved hvert bind-forsøk;
  quiz og ikke levert avvises), `visningsmodell` (hviteliste, ingen ID-er, tomt skjema),
  `validerMelding` (bare `klar` og `send {generasjon, karakter, kommentar}`), `vurderFersk`
  (send / advar / avbryt), `bekreftelse` (CLI-ets oppsummering, navn fra bundet `user_id`),
  `sendArgumenter` og `feilmelding`. Tekster `vscPanel*` i `src/strings.js`. Rot-`npm test`
  196 (179 + 17 nye i `tests/vscode-panel.test.js`, inkl. T-A-vaktpost; ingen eksisterende
  endret, `tests/` og `bin/` uendret). **Neste: D6b** — `vscode/src/panel-vindu.js`, ett
  webview-panel i hovedvinduet (CSP med nonce, ingen innerHTML, `retainContextWhenHidden`
  av, ingen serializer/`setState`), åpnes fra en innlevering i treet via `panel.bind(node)`,
  viser `visningsmodell`, og validerer meldinger med `validerMelding`; sending kobles ikke til.
- **VS Code-utvidelsen, D5 (2026-10-30, committet som `d7f5db7`):** bla og klone, og T12.
  - Trevisning «Canvas Clone» i Utforskeren (bare i hovedvinduet): kurs →
    fagretning → modul → oppgave → innleveringer, med `src/categories.js`,
    `src/cache.js` (samme cachefil som CLI-et, 15 min) og samme Canvas-kall.
    `TreeItem.id` er en teller per vindu (T11). Uten oppsett: én rad med knapp
    til oppsettet og en melding i visningen.
  - «Klon» på innlevering (bare den), oppgave (trenger retting / alle / velg selv,
    som CLI-et), kurs/fagretning/modul (bulk, T16-filter i QuickPick med «trenger
    retting» som standard), og «Klon på tvers av kurs» (QuickPick: kurs, omfang,
    alle eller én oppgave). Bekreftelse med antall fra 20 repo (`STOR_BULK`).
  - Kloning inn i en ny økt fra D4 (`nyOkt`), `cloneRepoAsync` med `finnGit()`
    (ny, D0 j) og `mapWithConcurrency` (4 samtidige), `withProgress` med Avbryt
    (avbrudd sletter økten), `uten_lenke.txt` i CLI-ets format (uten git sin
    stderr), oppsummering, så D4s åpningsflyt. Undermapper rett under økten
    navngis med `oktUndermappenavn` (T9a).
  - T12: «Vis hva som ble liggende» (begge røttene, bare øktnavn og status, i en
    QuickPick) og «Slett alle økter nå» (bekreftelse; vscode/ med D4-regelen via
    hovedvinduets rydding, grading/ med `startupCleanup` uendret).
    `ryddOkter` er delt i `kartleggOkter` + sletting, så visningen og slettingen
    bruker nøyaktig samme regel.
  - OutputChannel «Canvas Clone»: bare øktnavn og antall.
  - Ren logikk i `vscode/src/bla.mjs`, `rester.mjs`, `git-sti.mjs`; VS Code-delen i
    `bla-vindu.js` og `rester-vindu.js`. Tekster i `src/strings.js` (`vsc*`).
  - Tester (etter tredje rettingsrunde): rot-`npm test` 179 (154 + 25 nye i
    `tests/vscode-bla.test.js` (14), `tests/vscode-rester.test.js` (8) og
    `tests/vscode-git-sti.test.js` (3); ingen eksisterende endret). VS Code under
    `xvfb-run -a` (med `WAYLAND_DISPLAY` og `DISPLAY` fjernet): `minimum` 22, ny kjøring `bla` 20
    (falsk Canvas og falsk git i PATH, eget HOME og `XDG_CONFIG_HOME`), `oktvindu` 10,
    uten tillit 9 (1 ny). Prøveriggen har nytt scenario `klone` (17/17), med sqlite3-sjekk
    av global og workspace `state.vscdb` etter bla og kloning: ingen elevdata (D0 m), og
    test-kommandoene finnes ikke i en vanlig oppstart.
  - Beslutningen står i `DECISIONS.md` (2026-10-30, D5). Lars beholdt alle valgene
    (terskel 20, egen kommando for «på tvers av kurs», delt cache, D4-regelen i «slett
    alle nå», avbrudd sletter økten, riggmetoden).
  - **Rettingsrunde (2026-10-30, etter testverifiserer og leveranse-kritiker):**
    - Holdet fra `nyOkt` har ikke lenger utløp (til `apneOkt` eller `slipp`);
      `apneOkt` tåler at økten forsvinner under T9b/T9c (status `borte`) og slipper
      holdet også ved `ugyldig`.
    - Utfallet av sletting sjekkes: feiler den, vises «prøves igjen»
      (`vscDeleteFailed`), ikke «slettet».
    - «Klon» på en oppgave henter innleveringene på nytt.
    - «Slett alle nå» rører ikke `grading/` i en sandkasse (Flatpak: `FLATPAK_ID`
      eller `/.flatpak-info`; ikke Snap, Lars 2026-10-30), og sier det.
    - Feil fra Canvas og lokale feil får hver sin melding, med tokenet vasket bort.
    - Interne kommandoer med elevdata (`_tre`, `_treMelding`, `_logg`, `_git`, ny
      `_holdt`) og «Klon» med id som tekst finnes bare i `ExtensionMode.Test`.
      Prøveriggen får de samme funksjonene gjennom et andre argument til
      `activate` (`testkrok`), som VS Code aldri sender.
    - QuickPick lages med `createQuickPick` (`vscode/src/velg.js`), så
      standardvalget («trenger retting») faktisk er den aktive raden.
    - `regelTilstand()` tikker klokka; feil på rot- og oppgavenivå caches ikke i
      treet.
    - Testmiljøet: alle VS Code-kjøringer (også D4s) startes med
      `--force-disable-user-env` og på Linux `--ozone-platform=x11`;
      `WAYLAND_DISPLAY` og `ELECTRON_OZONE_PLATFORM_HINT` fjernes, og
      `.vscode-test.mjs`/`kjor-uten-tillit.mjs` nekter å starte på Linux uten
      `xvfb-run` (sjekker `XAUTHORITY`). Riggen fjerner `DISPLAY`/`WAYLAND_DISPLAY`
      før den starter `xvfb-run`. Testhjemmet setter `XDG_CONFIG_HOME`.
    - Oppsett og sletting av token laster trevisningen på nytt.
    - D5-testene har egen kjøring (`bla`, eget VS Code og HOME), fordi testfilene i
      én kjøring ikke kjøres i alfabetisk rekkefølge og deler `globalState`
      (T9c-flagget).
  - **Tredje rettingsrunde (2026-10-30):** egen melding når `openFolder` feiler;
    «Oppdater» tvinger fersk henting til den lykkes; «Klon» på en oppgave bytter ut
    barna i treet med de ferske innleveringene; `nodeFraArg` (ren, testet) avgjør
    «Klon» med id som tekst; `_nyOkt` holder uten utløp (se DECISIONS); nye og
    endrede tester sletter bare via `safeRemove` eller flytter økten ut.
    Eksisterende, committede tester bruker fortsatt `rmSync` (`tests/e2e*.test.js`,
    `clone-isolation`, `config`, `github`, `storage`, `vscode-okter`); ikke endret
    (T17 for CLI-testene).

- **VS Code-utvidelsen, D4 (2026-10-29, committet som `bc3b723`):** økter og sletting.
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

- **VS Code-utvidelsen, D3 (2026-10-29, committet som `eed34b4`):** oppsett og token.
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
    - D6c, T1-V (blokkerende før deling): karaktersetting via utvidelsen mot ekte Canvas på
      en ufarlig oppgave: riktig elev, karakter og tilbakemelding i SpeedGrader; avbrutt
      modal gir ingen endring; ny lenke gir avbrudd; endret karakter gir advarsel.
    - D6c: ekte klikk i webviewen (skrive i feltene, trykke «Send til Canvas …», dobbeltklikk,
      Avbryt/Escape i modalen). Testene sender meldingen gjennom `_panelMelding`, ikke fra
      knappen.
    - D6b/D6c: visuell sjekk av panelet (lyst og mørkt tema, lange navn, 8000 tegn
      tilbakemelding, statuslinjen ved feil og suksess).
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
    - D5: bla og klone mot ekte Canvas på et ufarlig kurs: at tallene «klare til
      retting» stemmer med CLI-et, at innleveringsteksten aldri vises, og
      kloning av noen ekte, offentlige elevrepo.
    - D5: «Avbryt» i fremdriftsmeldingen midt i en kloning (forventet: økten
      slettes). Selve avbruddet er bare testet i ren logikk; knappen kan ikke
      trykkes fra testene.
    - D5: `finnGit` på Windows (Git for Windows under Program Files, og git.exe i
      PATH) og macOS (Homebrew-git, og `/usr/bin/git` med og uten Command Line
      Tools). Kloningstestene i VS Code hoppes over på Windows (ingen falsk git).
    - D5: de modale dialogene (bekreftelse ved 20+ repo, «Slett alle økter nå»,
      «ingenting klonet») med ekte klikk og Escape.
    - D5: at utvidet tilstand i trevisningen ikke lagres. Riggen viste og
      utvidet visningen med `list.expand`, men om utvidingen faktisk skjedde i
      UI-et er ikke sett; `state.vscdb` hadde bare visningsoppsettet.
    - D5: stor bulk (100+ repo) mot ekte Canvas og GitHub: tid, og om Canvas eller
      GitHub begrenser antall kall.
    - D5, Windows: `git.exe` i `Git\cmd\` er en mellomprosess som starter den
      egentlige git. «Avbryt» dreper bare mellomprosessen, så kloningen kan henge
      eller fortsette til den er ferdig. Sjekk, og vurder å drepe hele treet.
    - D5: «Slett alle økter nå» i VS Code som Flatpak (forventet: `grading/`
      røres ikke, og det står i meldingen).
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

- CI (`.github/workflows/ci.yml`, tre OS) er grønn fra run 41054280391 (2026-10-30, `2dc7b9c`).
  På Windows hoppes 27 rot-tester og 10 `bla`-tester over (`klonTest`); må vurderes i D8.
- Ingen typesjekking (ren JS, ingen TypeScript eller JSDoc-typer).
- `package-lock.json` er committet; `npm run release-check` kjører `npm ci` +
  `npm audit`, men bare når noen kjører den for hånd (ikke en del av CI).

## Observasjoner

- D8/CI (2026-10-30): VS Code sender en `globalState`-skriving tilbake til vinduet etter
  ~200 ms med verdien hovedprosessen har da. To hovedvinduer der det ene kjører oppsettet og det
  andre åpner sin første økt innen ~200 ms kan i teorien miste Canvas-URL-en (tokenet står).
  Lars 2026-10-30: bare notert, ikke rettet. Løsning da: kjør oppsettet på nytt. I testene: `bla`
  venter 1 s etter `deleteToken`.
- D7b: `.vsix`-fila er ikke reproduserbar (tidsstempler i zip-fila); to bygg av samme kode gir
  ulik SHA-256. Summen gjelder bare den ene fila som deles.

- D6c (2026-10-30): trevisningen beholdt den gamle karakteren etter sending. Rettet i D6d (B2).
  Tallene «klare til retting» på oppgave-, modul- og kursnivå oppdateres fortsatt først ved
  «Oppdater».

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
- D5: en egen prøvedriver-utvidelse kan verken stubbe en annen utvidelses
  dialoger (hver utvidelse får sitt eget `vscode`-objekt) eller taste i VS Codes
  inndatafelt (`type` og innliming via utklippstavlen ble prøvd, ingen virket).
  Riggens `klone`-scenario legger derfor driveren i samme utvidelse som
  canvas-clone (samme id og `dist/extension.js`). (2026-10-30)
- D5: `@vscode/test-cli` kjører testfilene i en kjøring i en rekkefølge som ikke
  er alfabetisk. D5-testene fikk derfor egen kjøring (`bla`), ellers satte de
  T9c-flagget før D4-testen av «første gang». (2026-10-30)
- D5: testhjemmet og riggen satte ikke `XDG_CONFIG_HOME`. Med en slik variabel i
  lærerens miljø ville kurscachen fra testene havnet i lærerens ekte
  config-mappe. Nå settes den til testhjemmet. (2026-10-30)
- D5: feil fra Canvas vises i utvidelsen med `apiGetAll` sin melding, som har
  hele URL-en (kurs- og oppgave-ID-er, ingen elevdata), bare i UI-et, ikke i
  OutputChannel. Samme som observasjonen fra 2026-10-27. (2026-10-30)
