# canvas-clone

Interaktivt CLI-verktøy for å gå fra «jeg skal rette en oppgave i Canvas» til
«elevenes GitHub-repo ligger klare på disk» på kortest mulig tid.

Velg kurs → fagretning → modul → oppgave (eller søk/filtrer/bulk-klon på
hvert nivå), så henter verktøyet innleveringene, finner GitHub-lenken i hver
innlevering, og kloner dem til `./grading/<assignment_id>/<github-bruker>/`.
Valgfritt: åpne alle klonede repo i VS Code eller Zed automatisk etterpå.

## Krav

- [Node.js](https://nodejs.org) 18 eller nyere
- `git` (brukes til selve kloningen)
- [`gh`](https://cli.github.com) (valgfritt, men nødvendig for å klone
  **private** elev-repo — offentlige repo klones med vanlig `git clone` uten
  noen ekstra avhengighet)

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
2. **Canvas API-token** — lag et under Canvas → Account → Settings → *New
   Access Token*. Valideres mot Canvas med én gang.
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
`./grading/<kurs>/<assignment_id>/<github-bruker>/` i stedet for den vanlige
`./grading/<assignment_id>/<github-bruker>/` — siden oppgave-IDer ikke kan
antas unike på tvers av kurs. Enkeltkurs-kloning (uten dette valget) bruker
fortsatt den vanlige mappestrukturen, uendret.

### Midlertidig kloning (`--temp`)

Legg til `--temp` for å klone midlertidig: etter at du er ferdig i editoren,
trykk Enter i terminalen, så slettes repoene som ble klonet i *den kjøringen*
automatisk igjen. Repo som lå der fra før (hoppet over fordi mappa allerede
fantes) røres ikke.

```fish
canvas-clone --course 557 --all --open code --temp
```

### Sette karakter/tilbakemelding

I "hva vil du klone?"-steget for én enkelt oppgave finner du også valget
**«🎓 Sett karakter/tilbakemelding»**. Velg én student fra innleveringslista,
se eventuell nåværende karakter, skriv inn ny karakter og valgfri
tilbakemeldingstekst, og bekreft eksplisitt før det sendes til Canvas — dette
er verktøyets eneste skrivende handling mot en ekte elevkarakter, så det krever
en egen bekreftelse hver gang. Quiz-oppgaver kan ikke karaktersettes herfra —
de må rettes direkte i Canvas.

Dette er en interaktiv enkelt-student-flyt (ingen bulk/CSV-import, ingen
rubric-vurdering, ingen filvedlegg på kommentaren ennå).

Det samme finnes også som CLI-flagg, for scripting eller når du allerede vet
hvem som skal ha karakter: `--github <brukernavn>` identifiserer studenten
(via GitHub-brukernavn, ikke Canvas-ID — den ser du aldri i denne flyten),
`--grade <verdi>` og `--comment <tekst>` er selve innholdet (minst én av dem
må oppgis). Uten `--confirm` vises bare en forhåndsvisning av nøyaktig hva
som ville blitt sendt — ingenting sendes til Canvas. Dette er bevisst
strengere enn resten av flaggene i verktøyet (som kjører direkte): siden
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
canvas-clone --course 557 --assignment 11030 --open code   # klon og åpne automatisk
canvas-clone --all-courses --category "Frontend"       # bulk: på tvers av ALLE kursene dine
canvas-clone --course 557 --all --open code --temp     # midlertidig kloning, se over
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

## Arkitektur

```
bin/canvas-clone.js   Hele CLI-flyten: navigasjon, bulk-henting, kloning, editor-åpning
src/canvas.js         Canvas API (kurs, oppgaver, innleveringer, paginering)
src/categories.js     Gjetter fagretning/modul fra oppgavenavn (Canvas har ingen ekte kategori-metadata)
src/github.js         Plukker GitHub-repo ut av innleveringstekst, kloner (git, med gh som fallback for private repo)
src/editor.js         Åpner en mappe i VS Code/Zed
src/config.js         Config-fil + førstegangsoppsett
src/cache.js          Kurs-/oppgavecache med TTL
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
- **`gh` mangler ved kloning av private repo.** Offentlige repo klones med
  vanlig `git clone` uten noen ekstra avhengighet, men **private** elev-repo
  krever [`gh`](https://cli.github.com) installert og autentisert. Installer
  `gh`, kjør så `gh auth login` én gang (følg veiviseren — vanligvis
  nettleser-autentisering mot GitHub), og prøv på nytt.

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
