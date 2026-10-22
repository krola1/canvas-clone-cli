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

### Snarveier og ikke-interaktiv bruk

Alt som kan gjøres interaktivt kan også gjøres med flagg, for scripting eller
når du allerede vet hva du vil ha:

```fish
canvas-clone --course 557 --assignment 11030          # én spesifikk oppgave
canvas-clone --course 557 --category "Frontend"        # bulk: hele fagretningen
canvas-clone --course 557 --category "Frontend" --submodule "modul 1"
canvas-clone --course 557 --all                        # bulk: hele kurset
canvas-clone --course 557 --assignment 11030 --open code   # klon og åpne automatisk
```

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
