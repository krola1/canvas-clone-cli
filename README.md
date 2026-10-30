# canvas-clone

Interaktivt CLI-verktøy for å gå fra «jeg skal rette en oppgave i Canvas» til
«elevenes GitHub-repo ligger klare på disk» på kortest mulig tid.

Velg kurs → fagretning → modul → oppgave (eller søk/filtrer/bulk-klon på
hvert nivå), så henter verktøyet innleveringene, finner GitHub-lenken i hver
innlevering, og kloner dem til en egen øktmappe for denne kjøringen:
`~/canvas-clone/grading/<økt>/<assignment_id>/<eier>_<repo>/`. Valgfritt:
åpne repoene i VS Code eller Zed etterpå. Når du er ferdig, slettes hele
øktmappen — alltid (se [Personvern](#personvern)).

> ⚠️ **Har du brukt en eldre versjon av canvas-clone?** Da kan det ligge en
> gammel `grading/`-mappe med elevrepoer og elevnavn (`uten_lenke.txt`) i
> mappen(e) du kjørte verktøyet fra. Den nye versjonen rydder **ikke** disse
> — slett dem for hånd (fra mappen der `grading/` ligger):
>
> ```fish
> rm -r ./grading                   # fish/bash/zsh (Linux/macOS)
> ```
> ```powershell
> Remove-Item -Recurse .\grading    # PowerShell (Windows)
> ```
>
> canvas-clone advarer ved oppstart hvis den finner en `grading/`-mappe i
> mappen du står i, men rører den aldri.

## VS Code-utvidelse (under utvikling)

Samme repo har en VS Code-utvidelse i [`vscode/`](vscode/README.md): bla i
kurs og oppgaver, klon elevrepoene til en økt som åpnes i et eget vindu uten
tillit, og sett karakter på én innlevering. Den har sitt eget token og sin
egen øktmappe (`~/canvas-clone/vscode/`), og er ikke delt ennå. Installasjon,
personvern og kjente begrensninger står i [`vscode/README.md`](vscode/README.md).

## Nytt i denne versjonen

- **Fast lagringssted og sletting alltid.** Repoene klones ikke lenger til
  `./grading/` i mappen du står i, men til en egen øktmappe per kjøring under
  `~/canvas-clone/grading/` (samme sted på Linux, macOS og Windows). Øktmappen
  slettes alltid når du er ferdig — med Enter, Ctrl-C eller Esc — og rester
  etter en krasj ryddes ved neste kjøring. Det finnes ingen måte å beholde
  repoene på. Se [Personvern](#personvern).
- ⚠️ **Gamle `./grading/`-mapper fra tidligere versjoner må slettes for
  hånd.** De kan inneholde elevrepoer og elevnavn (`uten_lenke.txt`), og den
  nye versjonen rydder dem ikke: `rm -r ./grading` (fish/bash/zsh) eller
  `Remove-Item -Recurse .\grading` (PowerShell), fra mappen der `grading/`
  ligger.
- **`--temp` er utfaset.** Flagget godtas fortsatt, men gjør ingenting annet
  enn å skrive ut en melding — sletting skjer nå alltid.
- **Hver innlevering får sin egen mappe** (`<eier>_<repo>`, med `-2`, `-3` …
  hvis to elever leverer samme repo), så én elevs kode havner aldri under en
  annen elevs navn.
- **Tryggere karaktersetting:** bekreftelsen viser alltid Canvas-navnet.
  Peker flere innleveringer på samme GitHub-bruker, sender `--github` aldri
  noe uten at du har valgt riktig elev fra en liste i en interaktiv terminal
  (se [Sette karakter/tilbakemelding](#sette-karaktertilbakemelding)).
- **Bare `https://`** godtas som Canvas-URL. En eldre config med `http://`
  gir beskjed om å kjøre `canvas-clone --setup` på nytt.
- **Ingenting er forhåndsvalgt** i lista over repoer som skal åpnes, og
  verktøyet advarer om at elevkode er upålitelig kode.
- **Windows:** ingen editor startes automatisk — kommandoen for å åpne hvert
  repo skrives ut i stedet.
- **`npm run release-check`** for den som deler verktøyet videre (se
  [Før du deler en ny versjon](#før-du-deler-en-ny-versjon)).

Tidligere:

- **Bulk-klon på tvers av flere kurs** — se [Bulk-kloning](#bulk-kloning).
- **Sette karakter/tilbakemelding** direkte fra verktøyet, interaktivt eller
  via flagg — se [Sette karakter/tilbakemelding](#sette-karaktertilbakemelding).
  ⚠️ **Denne funksjonen er ikke ferdigtestet mot en ekte Canvas-instans ennå**
  — les advarselen i den seksjonen før du tar den i bruk.
- Bugfikser (gist-lenker feiltolket som repo, misvisende feilmelding ved
  nettverksfeil, allerede klonet repo manglet i editor-lista) og en ny
  testsuite (`npm test`).

## Krav

- [Node.js](https://nodejs.org) 18 eller nyere
- `git` (brukes til selve kloningen)

`gh` (GitHub CLI) trengs ikke. Elevrepoene klones som offentlige repo med
vanlig `git clone`, og aldri med din egen GitHub-pålogging (se
[Feilsøking](#feilsøking) om private repo).

## Installasjon

```fish
cd canvas-clone-cli
npm install
npm install -g .
```

Det siste steget symlinker pakken inn i din globale npm-`bin`, slik at
kommandoen `canvas-clone` er tilgjengelig fra hvilken som helst mappe, i
hvilket som helst shell. Siden det er en symlink (ikke en kopi), trer
endringer i denne mappa i kraft umiddelbart — ingen reinstallering nødvendig
mens du utvikler på verktøyet.

## Førstegangsoppsett

Første gang du kjører `canvas-clone` spør den om:

1. **Canvas-URL** (f.eks. `https://din-skole.instructure.com`)
   — må starte med `https://`.
2. **Canvas API-token** — lag et under Canvas → Account → Settings → *New
   Access Token*. Valideres mot Canvas med én gang. Gi tokenet gjerne en
   utløpsdato (f.eks. slutten av semesteret), så slutter det å virke av seg
   selv.
3. **Standard editor** å åpne klonede repo i (VS Code / Zed / spør hver gang)

Alt lagres i en config-fil (se under). Kjør `canvas-clone --setup` for å gå
gjennom oppsettet på nytt (f.eks. for å bytte token eller skole).

## Bruk

```fish
canvas-clone
```

og følg menyene: kurs → fagretning → (evt. modul/nivå) → oppgave → hva som
skal klones. Naviger med piltastene, `← ` for å gå ett steg tilbake, `Esc`
for å avbryte hele programmet når som helst. (I selve oppgavesøket er `←`
reservert for tekstmarkøren — bruk `← Tilbake`-valget i listen der i
stedet.)

Oppgavelister sorteres med flest «klare til retting» øverst, og hvert nivå
viser en brødsmulesti (`Kurs › Fagretning › Modul`) slik at du alltid vet
hvor du er.

### Bulk-kloning

I oppgavesøket finner du et valg **«📦 Klon ALLE i denne listen»** — bulk-
kloner alt i det du har navigert til (en hel fagretning, ett modul, eller
hele kurset hvis du valgte «Vis alle oppgaver»). Hvilke innleveringer som tas
med styres av `bulkCloneFilter` i config (se under).

Nederst i kurslisten finner du også **«🌐 Bulk-klon på tvers av flere
kurs»** — velg hvilke kurs som skal inkluderes, så får du samme
fagretning/modul-navigasjon som for ett enkelt kurs, bare med oppgaver fra
flere kurs slått sammen. Når denne er brukt (eller tilsvarende
`--all-courses`-flagg, se under) legges kurset inn i mappestien:
`<økt>/<kurs>/<assignment_id>/<eier>_<repo>/` i stedet for den vanlige
`<økt>/<assignment_id>/<eier>_<repo>/` — siden oppgave-IDer ikke kan
antas unike på tvers av kurs. Enkeltkurs-kloning (uten dette valget) bruker
fortsatt den vanlige mappestrukturen, uendret.

### Når du er ferdig: øktmappen slettes

Etter kloningen (og eventuell åpning i editor) venter verktøyet i
terminalen. Trykk **Enter** når du er ferdig med å se på koden, så slettes
hele øktmappen. **Ctrl-C** eller **Esc** sletter den også. Kjøres verktøyet
fra et skript uten terminal, slettes øktmappen så snart stdin lukkes.

Lukk gjerne editor-vinduene før du trykker Enter — på Windows kan en åpen
fil hindre sletting. Klarer verktøyet ikke å slette alt, sier det tydelig
fra om hva som ble liggende, og prøver igjen ved neste kjøring.

`--temp` fra tidligere versjoner er utfaset: flagget godtas, men gjør
ingenting annet enn å skrive ut en melding.

### Sette karakter/tilbakemelding

> ⚠️ **Ikke ferdigtestet mot en ekte Canvas-instans.** Selve kallet mot Canvas
> (format, feltnavn) er kun verifisert mot Canvas' offisielle dokumentasjon og
> simulerte (mock) tester — aldri kjørt mot en ekte Canvas-instans. Test denne
> funksjonen på **én lav-risiko oppgave** før du stoler på den for ekte
> elevkarakterer. Opplever du noe uventet (feilmelding fra Canvas, feil verdi
> satt, annen oppførsel enn forventet), **gi beskjed** — noter det under
> «Observasjoner» i `.claude/docs/STATUS.md` (se prosjektets egen
> `CLAUDE.md`) slik at det blir fanget opp og rettet, i stedet for å anta at
> det løser seg selv neste gang.
>
> 🔒 **Ikke skriv elevnavn, GitHub-brukernavn eller karakterer i
> `STATUS.md` eller andre filer i dette repoet** — repoet er offentlig.
> Beskriv hva som skjedde med generelle ord (f.eks. «karakteren ble satt på
> feil innlevering», «Canvas svarte 422»), og ta med feilmeldingen bare
> hvis den ikke inneholder slike opplysninger.

I "hva vil du klone?"-steget for én enkelt oppgave finner du også valget
**«🎓 Sett karakter/tilbakemelding»**. Velg én student fra innleveringslista,
se eventuell nåværende karakter, skriv inn ny karakter og valgfri
tilbakemeldingstekst, og bekreft eksplisitt før det sendes til Canvas.
Bekreftelsen viser alltid elevens Canvas-navn (`Canvas-navn (GitHub: x)`),
og har to elever samme visningsnavn i lista, står det skillende navnet i
parentes. Dette er verktøyets eneste skrivende handling mot en ekte
elevkarakter, så det krever en egen bekreftelse hver gang. Quiz-oppgaver kan ikke karaktersettes herfra —
de må rettes direkte i Canvas.

Dette er en interaktiv enkelt-student-flyt (ingen bulk/CSV-import, ingen
rubric-vurdering, ingen filvedlegg på kommentaren ennå).

Det samme finnes også som CLI-flagg, for scripting eller når du allerede vet
hvem som skal ha karakter: `--github <brukernavn>` identifiserer studenten
(via GitHub-brukernavn, ikke Canvas-ID — den ser du aldri i denne flyten),
`--grade <verdi>` og `--comment <tekst>` er selve innholdet (minst én av dem
må oppgis). Uten `--confirm` vises bare en forhåndsvisning av nøyaktig hva
som ville blitt sendt — ingenting sendes til Canvas. Peker flere
innleveringer på samme GitHub-bruker, velges aldri første treff:

- Uten `--confirm` listes elevene (Canvas-navn) i forhåndsvisningen, og
  ingenting sendes.
- Med `--confirm` i en interaktiv terminal velger du riktig elev fra en
  liste med Canvas-navn, status og nåværende karakter.
- Uten interaktiv terminal (skript, pipe) avbrytes det med exit 1, uansett
  `--confirm` — sett karakteren interaktivt i stedet.

**Kjør alltid forhåndsvisningen (uten `--confirm`) først**, se at elev
(Canvas-navn), oppgave, karakter og kommentar stemmer, og kjør så samme
kommando med `--confirm`.

Dette er bevisst strengere enn resten av flaggene i verktøyet (som kjører direkte): siden
karaktersetting er den eneste skrivende, irreversible handlingen mot ekte
elevdata, skal den aldri kunne skje ved et uhell fra en kopiert eller
scriptet kommando.

```fish
canvas-clone --course 557 --assignment 11030 --github oladev --grade A --comment "Bra jobbet"              # forhåndsvisning, sender ingenting
canvas-clone --course 557 --assignment 11030 --github oladev --grade A --comment "Bra jobbet" --confirm     # sender faktisk
```

`--github` krever `--course` og `--assignment`, og kan ikke kombineres med
`--category`/`--all`/`--all-courses`. Bulk-karaktersetting via flagg finnes
ikke (se `.claude/docs/DECISIONS.md`).

### Snarveier og ikke-interaktiv bruk

Alt som kan gjøres interaktivt kan også gjøres med flagg, for scripting eller
når du allerede vet hva du vil ha:

```fish
canvas-clone --course 557 --assignment 11030          # én spesifikk oppgave
canvas-clone --course 557 --category "Frontend"        # bulk: hele fagretningen
canvas-clone --course 557 --category "Frontend" --submodule "modul 1"
canvas-clone --course 557 --all                        # bulk: hele kurset
canvas-clone --course 557 --assignment 11030 --open code   # klon og åpne automatisk (Windows: skriver ut kommandoen)
canvas-clone --all-courses --category "Frontend"       # bulk: på tvers av ALLE kursene dine
canvas-clone --course 557 --assignment 11030 --github oladev --grade A --comment "Bra jobbet" --confirm  # sett karakter, se under
```

`--course` og `--all-courses` er gjensidig utelukkende; `--all-courses`
brukes akkurat som `--course` ellers (kombiner med `--category`/`--submodule`/
`--all`) — bare `--assignment` krever fortsatt et spesifikt `--course`, siden
oppgave-IDer ikke er unike på tvers av kurs.

Nederst i kurslisten (eller med `--generate`) finner du **«Generer en
snarvei-kommando»** — naviger som vanlig, men i stedet for å klone skriver
verktøyet bare ut den tilsvarende `canvas-clone`-kommandoen. Praktisk når du
ikke husker kurs-/oppgave-IDer, men vil ha en snarvei å gjenbruke eller dele.
Etter *enhver* vellykket kloning (enkelt eller bulk) skriver verktøyet også
ut sin egen snarvei, så du slipper å navigere på nytt neste gang.

Se `canvas-clone --help` for full flagg-referanse.

## Config

Lagres i:

| Plattform | Sti |
|---|---|
| Linux | `~/.config/canvas-clone/config.json` |
| macOS | `~/Library/Application Support/canvas-clone/config.json` |
| Windows | `%APPDATA%\canvas-clone\config.json` |

| Nøkkel | Default | Betydning |
|---|---|---|
| `canvasUrl` | *(fra oppsett)* | Canvas-instansens URL |
| `canvasToken` | *(fra oppsett)* | Canvas API-token |
| `editor` | *(fra oppsett)* | `"code"`, `"zed"`, eller `null` (spør hver gang) |
| `cacheTtlMinutes` | `15` | Hvor lenge kurs-/oppgavelisten caches før ny henting |
| `displayName` | `"github"` | `"github"` eller `"canvas"` — hvilket navn som vises for innleveringer |
| `bulkCloneFilter` | `"needs_grading"` | `"needs_grading"` eller `"all"` — hva bulk-kloning tar med |
| `joeMode` | `false` | `true`/`false` |

`config.json` er vanlig JSON du kan redigere direkte — ingen av disse
krever at du kjører `--setup` på nytt.

Kurs-/oppgavecachen ligger i en egen fil (`cache.json`) i samme mappe og kan
trygt slettes manuelt, eller tvinges forbi med `--refresh`.

## Personvern

Verktøyet håndterer elevdata (navn, kode, commit-historikk). Det er laget for
å etterlate så lite som mulig på maskinen din:

- **Hvor data ligger mens du jobber:** i øktmappen
  `~/canvas-clone/grading/<økt>/` — `~/canvas-clone/grading/` på Linux og
  macOS, `%USERPROFILE%\canvas-clone\grading\` på Windows. Der ligger de
  klonede repoene og `uten_lenke.txt` (navn på elever uten gyldig
  GitHub-lenke, med årsak). `~/canvas-clone/` har en `.gitignore` (`*`), så
  mappen ikke havner i et git-repo ved et uhell.
- **Sletting skjer alltid:** når du trykker Enter, Ctrl-C eller Esc, og når
  stdin lukkes ved skriptbruk. Det finnes ingen måte å beholde repoene på.
- **Avbrudd og krasj:** blir prosessen drept før den rekker å rydde (f.eks.
  terminalen lukkes hardt eller maskinen krasjer), slettes resten ved neste
  kjøring av `canvas-clone` — uansett kommando, også `--help`. To kjøringer
  samtidig på samme maskin rører ikke hverandres øktmapper.
- **Felles hjemmemappe:** har flere maskiner samme hjemmemappe (NFS,
  nettverksprofil/roaming-profil), skal verktøyet ikke kjøres på flere av dem
  samtidig. Låsen er prosess-ID-en i øktmappens navn, og den gjelder bare på
  én maskin — en kjøring på en annen maskin kan tro at økta er forlatt og
  slette den mens du jobber i den.
- **Gamle `grading/`-mapper fra tidligere versjoner** (i mappen du kjørte
  verktøyet fra) slettes **ikke** automatisk og må slettes for hånd:
  `rm -r ./grading` (fish/bash/zsh) eller `Remove-Item -Recurse .\grading`
  (PowerShell). Verktøyet advarer hvis det finner en i mappen du står i.
- **Sikkerhetskopier og sky-synk:** tar du sikkerhetskopi av hjemmemappen
  (Time Machine, OneDrive, Dropbox, restic e.l.) mens en økt pågår, kan
  kopier av elevrepoene ligge der etter at øktmappen er slettet. Vurder å
  utelate `~/canvas-clone/` fra sikkerhetskopien.
- **Det som blir liggende:** config (Canvas-URL og token) og `cache.json`
  (kurs- og oppgavenavn, ingen elevdata) i config-mappen, se [Config](#config).
  Tekstfeltet i innleveringene leses bare for å finne GitHub-lenken, og
  skrives aldri til disk eller skjerm.
- **Utenfor verktøyets kontroll** (ryddes ikke av canvas-clone):
  - shell-historikk (f.eks. `--github`-kommandoer med GitHub-brukernavn og
    karakter);
  - terminalens rullehistorikk (scrollback), som viser elevnavn,
    GitHub-navn og stier så lenge vinduet er åpent, og i noen terminaler
    også etter at det er lukket;
  - editorens liste over nylig åpnede mapper, og editorens lagrede tilstand
    per arbeidsområde — VS Code lagrer f.eks. en mappe per åpnet sti under
    `workspaceStorage` (Linux: `~/.config/Code/User/workspaceStorage/`,
    macOS: `~/Library/Application Support/Code/User/workspaceStorage/`,
    Windows: `%APPDATA%\Code\User\workspaceStorage\`), med stien — og
    dermed GitHub-brukernavnet i mappenavnet — inni. Zed og andre editorer
    har tilsvarende. Disse kan slettes for hånd i editoren eller på disk.

## Før du deler en ny versjon

```fish
npm run release-check
```

Én kommando for både CLI-et og VS Code-utvidelsen. Den stopper ved første feil
og kjører, i rekkefølge:

1. **CLI-et** (`npm run release-check:cli`): `npm ci` (ren installasjon fra
   `package-lock.json`) og `npm audit --omit=dev --audit-level=moderate`, som
   feiler hvis en avhengighet har en kjent sårbarhet med middels (moderate)
   eller høyere alvorlighet.
2. **`npm test`** (CLI-et og den rene logikken i utvidelsen).
3. **Utvidelsen** (`npm run release-check:vscode`, det samme som
   `npm run release-check` i `vscode/`):
   - `npm ci --ignore-scripts` i `vscode/`
   - `npm audit --audit-level=moderate` for hele treet i `vscode/`, også
     devDependencies (utvidelsen har ingen runtime-avhengigheter, så det er
     byggverktøyene som teller)
   - bygg, `vsce package` og pakkesjekken (`scripts/check-package.mjs`: den
     faktiske `.vsix`-fila og `vsce ls` mot hvitelisten, og at bundelen ikke
     drar inn CLI-avhengigheter)
   - SHA-256 av `.vsix`-fila, skrevet til
     `vscode/canvas-clone-vscode-<versjon>.vsix.sha256` i formatet
     `sha256sum -c` godtar

Filene som deles, er `vscode/canvas-clone-vscode-<versjon>.vsix` og
`.vsix.sha256`-fila ved siden av. Begge er utelatt fra git (`.gitignore`).
Del nøyaktig den `.vsix`-fila summen er regnet ut for; bygger du på nytt, får
pakken en ny sum.

VS Code-testene er ikke med, fordi de trenger en skjerm. Kjør dem i tillegg før
deling. På Linux kjøres de i en usynlig skjerm med `xvfb-run -a`, så ingen
vinduer åpnes på skjermen din:

```fish
cd vscode
env -u WAYLAND_DISPLAY -u DISPLAY xvfb-run -a npm test
env -u WAYLAND_DISPLAY -u DISPLAY xvfb-run -a npm run test:uten-tillit
```

Husk også å oppdatere `version` i `vscode/package.json` og
`vscode/CHANGELOG.md` før en ny versjon av utvidelsen.

Slå på tofaktorinnlogging (2FA) på GitHub-kontoen som publiserer releasen.
Den som kommer inn på kontoen, kan bytte ut både `.vsix`-fila og summen.

## Arkitektur

```
bin/canvas-clone.js   Hele CLI-flyten: navigasjon, bulk-henting, kloning, editor-åpning
src/canvas.js         Canvas API (kurs, oppgaver, innleveringer, paginering)
src/categories.js     Gjetter fagretning/modul fra oppgavenavn (Canvas har ingen ekte kategori-metadata)
src/github.js         Plukker GitHub-repo ut av innleveringstekst (validerer eier/repo), kloner (git, uten din GitHub-pålogging)
src/storage.js        Lagringssted, øktmapper, mappenavn og all sletting (eneste fil som sletter noe)
src/grading.js        Finner riktig elev ved karaktersetting, navn ved duplikater
src/editor.js         Åpner en mappe i VS Code/Zed (på Windows: skriver ut kommandoen)
src/config.js         Førstegangsoppsett (bruker config-store.js)
src/config-store.js   Config-fil: sti, lesing og skriving
src/workflow.js       Hva som klones og hvor: bulk-filter, mappesti, uten_lenke.txt
src/cache.js          Kurs-/oppgavecache med TTL
src/concurrency.js    Felles samtidighetsgrense for Canvas-kall
src/strings.js        All brukervendt tekst (norsk/engelsk)
```

## Feilsøking

- **Feil Canvas-URL.** `canvas-clone --setup` validerer URL-en/tokenet med én
  gang og sier tydelig ifra hva som gikk galt: en nettverksfeil (stavefeil i
  URL-en, ingen nettverkstilgang, DNS-oppslag feiler) gir en annen melding
  enn et ugyldig token, som igjen er forskjellig fra en uventet feil (f.eks.
  en URL som svarer, men ikke er en Canvas-instans). Dobbeltsjekk at URL-en
  ser ut som `https://din-skole.instructure.com` (ingen sti etter).
- **Utløpt eller ugyldig token.** Canvas avviser tokenet med 401/403.
  Kjør `canvas-clone --setup` og lag et nytt token under Canvas → Account →
  Settings → *New Access Token*.
- **`git` mangler.** canvas-clone varsler ved oppstart hvis `git` ikke finnes
  på maskinen — uten `git` kan ingenting klones. Installer `git` via
  pakkebehandleren din (f.eks. `apt install git`, `brew install git`,
  [git-scm.com](https://git-scm.com) for Windows).
- **Et repo havner i `uten_lenke.txt` som «uten tilgang».** Repoet er privat,
  slettet eller feilstavet i innleveringen (git svarte for eksempel «could not
  read Username» eller «Repository not found»). Andre feil, som nettverksfeil,
  står som «klone-feil» med git sin melding. canvas-clone kloner bevisst uten din GitHub-pålogging
  (ingen credential-hjelper, ingen `gh`, ingen SSH-nøkler, ingen
  `insteadOf`-omskriving), så du blir aldri spurt om passord, og din tilgang
  til private repo brukes aldri. Be eleven gjøre repoet offentlig eller levere
  riktig lenke. Proxy- og sertifikatoppsett i din git-config brukes fortsatt.

## Kjente begrensninger

- **Fagretning/modul er gjettet, ikke ekte data.** Canvas har ingen reell
  fagkategori på oppgaver, så `categories.js` mønstergjenkjenner navnet
  (`"Frontend modul 1"`, `"Javascript Basic"`, …). Det som ikke matcher
  havner i en egen «(Ukategorisert)»-kategori — ingenting er skjult, men
  grupperingen er beste innsats.
- **Gruppeinnleveringer** håndteres ikke spesielt — `studentName` er bare
  den som faktisk leverte i Canvas.
- Hvis en innlevering inneholder både en `github.com`-lenke og en
  `github.io` (GH Pages)-lenke, prioriteres `github.com`-lenken. Finnes bare
  en pages-lenke, utledes repoet fra den (`bruker.github.io/repo` →
  `bruker/repo`; `bruker.github.io` alene → antar `bruker/bruker.github.io`).
