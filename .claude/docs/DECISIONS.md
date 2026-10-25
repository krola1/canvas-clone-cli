# DECISIONS.md

Arkitektur- og designbeslutninger for `canvas-clone-cli`, rekonstruert fra
byggesamtalen (22.10.2026) og git-historikken. Beslutninger merket
"(rekonstruert – bekreft)" er min tolkning av hva som ble valgt, uten at
begrunnelsen faktisk ble diskutert eksplisitt — bekreft eller korriger dem.

Nye oppføringer legges nederst, ikke kronologisk omrokkert.

---

## 2026-10-22 — Node.js (ESM) uten build-steg, i stedet for det opprinnelige shell-scriptet

**Beslutning:** Verktøyet var opprinnelig et fish/bash-script
(`scripts/canvas-clone.sh`) og ble skrevet om til Node.js (`"type": "module"`,
ingen transpilering/bundling).

**Begrunnelse:** Du ba om et verktøy som er "interaktivt" og "funker
uavhengig av OS". Node dekker begge uten noe kompileringssteg.

**Forkastede alternativer:** Ingen eksplisitt vurdert i samtalen — selve
valget av Node fremfor f.eks. Python eller Go ble aldri diskutert, bare
kravene det skulle dekke. **(rekonstruert – bekreft)**

---

## 2026-10-22 — `@inquirer/prompts` + `ora` som eneste avhengigheter

**Beslutning:** Interaktiv navigasjon bygges på `@inquirer/prompts`
(select/search/checkbox/input/password/confirm), fremdriftsindikatorer med
`ora`.

**Begrunnelse:** Minimalt avhengighetssett for et "lite" CLI-verktøy — ingen
egen UI-fremework er nødvendig for menynavigasjon. **(rekonstruert – bekreft:
selve valget av disse to pakkene fremfor alternativer ble ikke diskutert
eksplisitt i samtalen.)**

---

## 2026-10-22 — `git clone` med `gh` som fallback for private repo

**Beslutning:** Kloning prøver vanlig `git clone` først, og faller tilbake
til `gh repo clone` bare hvis den feiler (`src/github.js`).

**Begrunnelse:** Offentlige repo (det vanlige tilfellet) krever da ingen
ekstra avhengighet i det hele tatt. `gh` dekker autentisering mot private
repo, som ren `git clone` ikke kan uten egen SSH/token-oppsett.

**Forkastede alternativer:** Ren `gh`-løsning for alt (krever `gh` installert
og autentisert for alle, også offentlige repo — unødvendig friksjon). Ren
`git`-løsning for alt (ville aldri fungert for private elev-repo).

---

## 2026-10-22 — Config som ren JSON-fil i XDG-sti, med 0600-rettigheter

**Beslutning:** Canvas-URL og -token lagres i klartekst-JSON
(`~/.config/canvas-clone/config.json` på Linux, tilsvarende XDG/macOS/Windows-
stier), men filen skrives med `chmod 600`.

**Begrunnelse:** Filrettighetene (600) var et bevisst sikkerhetsvalg for å
beskytte API-tokenet på disk.

**Forkastede alternativer:** OS-keychain (macOS Keychain, Secret Service,
Windows Credential Manager via f.eks. `keytar`) ble aldri tatt opp som
alternativ i samtalen — det var ikke en reell avveining, bare et valg som
ikke ble stilt spørsmål ved. **(rekonstruert – bekreft om dette er greit for
et token med denne følsomheten, eller om keychain bør vurderes senere.)**

---

## 2026-10-22 — Kategorisering via regex-gjetting på oppgavenavn

**Beslutning:** Fagretning/modul utledes fra oppgavenavnet med regex
(`src/categories.js`), ikke fra ekte Canvas-metadata.

**Begrunnelse:** Bekreftet mot faktiske data i kurs 557 at Canvas sine
"assignment groups" bare heter "Assignments"/"Imported Assignments" — det
finnes ingen reell fagkategori å hente. Regex-gjetting var derfor eneste
mulighet, ikke ett av flere alternativer. Dekning observert: 255/290 (88 %)
automatisk kategorisert i kurs 557; resten havner synlig i en egen
"(Ukategorisert)"-kategori i stedet for å bli skjult.

**Forkastede alternativer:** Ingen — ekte metadata finnes ikke å velge i
stedet.

---

## 2026-10-22 — Venstre-pil reservert til tekstmarkør i oppgavesøket

**Beslutning:** `←` går ett steg tilbake i alle vanlige list-menyer
(select/checkbox), men i oppgavesøket (en `search`-prompt med fritekstfelt)
er venstre-pil IKKE koblet til tilbake — der brukes i stedet et eksplisitt
«← Tilbake»-listevalg.

**Begrunnelse:** Du spurte selv hvorfor det ikke bare var piltast venstre der
også. Svaret: i søkefeltet må venstre-pil fortsatt kunne flytte tekstmarkøren
når man retter søketeksten — å kapre tasten til navigasjon ville ødelagt
vanlig tekstredigering.

**Forkastede alternativer:** Konsekvent venstre-pil-navigasjon overalt,
inkludert søkefeltet (forkastet fordi det ødelegger tekstredigering).

---

## 2026-10-22 — Esc avbryter hele programmet, via delt `AbortController`

**Beslutning:** Et globalt `AbortController` sendes inn i alle prompts; Esc
trigger `.abort()`, fanges som `AbortPromptError`/`ExitPromptError` i
toppnivå-catchen og skriver en ren "Avbrutt."-melding i stedet for en stack
trace.

**Begrunnelse:** Eksplisitt bedt om av deg — mulighet til å avbryte hele
programmet når som helst, uansett hvor dypt i menyhierarkiet man er.

**Forkastede alternativer:** Ingen diskutert — dette var et rent tillegg, ikke
en erstatning for noe annet.

---

## 2026-10-22 — Bulk-kloning begrenset til ett kurs om gangen

**Beslutning:** All bulk-kloning (fagretning, modul, eller "hele kurset")
skjer innenfor ett valgt kurs — det finnes ingen cross-course bulk-modus.

**Begrunnelse:** Du bekreftet eksplisitt at "ett kurs om gangen" er riktig
scope da det ble tatt opp. Dette er en bevisst avgrensning du satte, ikke en
teknisk begrensning i koden.

**Forkastede alternativer:** Cross-course bulk-kloning (f.eks. "klon alle
oppgaver som trenger retting, på tvers av alle kursene mine") — vurdert og
avvist for nå. Se `ROADMAP.md` for om dette er droppet for godt eller bare
utsatt.

---

## 2026-10-22 — `displayName` default = `"github"`

**Beslutning:** Standardvalget for hvilket navn som vises for en innlevering
er GitHub-brukernavnet (utledet fra repo-lenken), ikke Canvas-navnet.
Konfigurerbart til `"canvas"` i `config.json`.

**Begrunnelse:** Direkte bedt om av deg: «jeg ønsker at man skal kunne velge
selv om man skal vise canvas navn eller gh navn i applikasjonen, i
settings.json skal det kun være gh navn by default.»

**Forkastede alternativer:** Canvas-navn som default (avvist eksplisitt).

---

## 2026-10-22 — `joeMode`: norsk/engelsk UI-tekst

**Beslutning:** All brukervendt tekst finnes i to varianter (norsk/engelsk) i
`src/strings.js`, styrt av config-feltet `joeMode` (eller `--joe-mode`-flagget
per kjøring).

**Begrunnelse:** Du har engelskspråklige medarbeidere som også skal kunne
bruke verktøyet. Viktig prosjekt-spesifikk regel fra samtalen: README skal
**ikke** forklare hva `joeMode` faktisk gjør — bare nevne kort at innstillingen
finnes. Ikke utdyp dette uten eksplisitt godkjenning fra deg, heller ikke i
fremtidig dokumentasjon.

**Forkastede alternativer:** Ingen diskutert — fullstendig i18n-rammeverk ble
ikke vurdert, siden to hardkodede varianter var tilstrekkelig for behovet.

---

## 2026-10-22 — Snarvei-generator (`--generate`)

**Beslutning:** Et eget listevalg nederst i kursvelgeren (eller `--generate`-
flagget) lar deg navigere som vanlig, men i stedet for å klone skriver
verktøyet bare ut den tilsvarende `canvas-clone --course ... `-kommandoen.
Skrives også ut automatisk etter enhver vellykket kloning.

**Begrunnelse:** Bedt om av deg for å slippe å huske Canvas-IDer ved
gjentatt bruk.

**Forkastede alternativer:** En egen "forside"/eget hovedmeny-valg for dette
ble bygget først, men du ville heller ha det som et vanlig listevalg nederst
i kurslisten — iterert til dagens løsning.

---

## 2026-10-22 — TTL-basert caching av kurs-/oppgaveliste (default 15 min)

**Beslutning:** Kurs- og oppgavelisten caches i `cache.json` med en
konfigurerbar TTL (default 15 minutter), nøkkelsatt på `canvasUrl`.

**Begrunnelse:** Bedt om av deg for å unngå treg oppstart ved gjentatt bruk.
15 minutter ble valgt som default fordi "klar til retting"-tallet i
oversikten kan bli noe gammelt uten at det er alvorlig — ferske
innleveringsdata hentes uansett alltid rett før selve kloningen, så cachen
påvirker bare oversiktsvisningen, aldri hva som faktisk klones.

**Forkastede alternativer:** Ingen cache (for treg ved gjentatt bruk). Ingen
TTL/manuell invalidering kun (mindre fleksibelt enn `--refresh`-flagget som
endte opp som supplement).

---

## 2026-10-22 — Samtidighetsbegrensning ved Canvas-kall

**Beslutning:** Henting av oppgaver/innleveringer kjøres med maks 6 samtidige
kall (`mapWithConcurrency`), ikke sekvensielt og ikke helt parallelt.

**Begrunnelse:** Sekvensiell henting var for treg (du observerte ~37
sekunder); helt parallelt risikerer Canvas sin rate-limiting ved mange kurs.
6 samtidige ble valgt som et praktisk mellomnivå.

**Forkastede alternativer:** Helt sekvensiell (for treg, forkastet).
Ubegrenset parallellitet (risiko for rate-limiting — faktisk den konkrete
bugen som ble fikset i commit `9d9e127`, se egen oppføring under).

---

## 2026-10-22 — `--temp`-flagg: design besluttet, IKKE bygget

**Beslutning (design, ikke implementert):** Hvis/når et `--temp`-flagg
(midlertidig klon som ryddes opp automatisk) bygges, skal det vente på Enter
i terminalen før opprydding — ikke `code --wait` eller en tilsvarende
Zed-mekanisme, siden støtte for "vent til lukket" i Zed ikke kunne bekreftes
på tidspunktet.

**Status:** Verifisert direkte i kodebasen (2026-10-23): ingen referanse til
`--temp` i `bin/canvas-clone.js`, `src/`, eller README. Flagget finnes altså
ikke i koden selv om designet for det ble diskutert og valgt. Se
`STATUS.md` (kjente mangler) og `ROADMAP.md` (åpent spørsmål: skal det
fortsatt bygges?).

**Forkastede alternativer:** `code --wait`/Zed sin tilsvarende "vent til
lukket"-mekanisme — forkastet fordi støtten i Zed ikke kunne bekreftes.

---

## 2026-10-23 — Kodegjennomgang-fikser: config-overskriving, bulk-feilisolasjon, samlet concurrency-grense

**Beslutning (commit `9d9e127`):**
1. `--setup` overskriver ikke lenger egendefinerte innstillinger
   (`cacheTtlMinutes`, `displayName`, `bulkCloneFilter`) i `config.json` stille.
2. Én filsystemfeil for én innlevering under bulk-kloning stopper ikke lenger
   hele kjøringen — resten behandles fortsatt, og `uten_lenke.txt` skrives
   som normalt.
3. Henting av oppgaver per kurs bruker nå samme samtidighetsgrense
   (`mapWithConcurrency`, flyttet til eget `src/concurrency.js`) som
   `bulkFetch` allerede brukte.

**Begrunnelse:** Fra kodegjennomgang (hentet fra commit-meldingen, ikke
diskutert med deg i samtalen): (1) README lovet allerede at disse
innstillingene ikke krever ny `--setup`, så den gamle oppførselen var en reell
bug mot egen dokumentasjon. (2) Én feilet innlevering skal ikke ta ned en
bulk-jobb på titalls/hundrevis av andre. (3) Unngå Canvas sin rate-limiting
ved mange kurs.

**Forkastede alternativer:** Ingen nevnt — dette var rene bugfikser, ikke
design-avveininger med flere reelle alternativer.

---

## 2026-10-25 — Cross-course bulk-kloning: `grading/<kurs>/<assignment_id>/<bruker>/`, aktivert eksplisitt

**Beslutning:** Cross-course bulk-kloning (tidligere avvist, se "Bulk-kloning
begrenset til ett kurs om gangen" over — nå reversert på direkte bestilling)
bygges som et eget `--all-courses`-flagg + et eget menyvalg («🌐 Bulk-klon på
tvers av flere kurs»). Når dette faktisk er brukt, skifter mappestrukturen
til `grading/<kurs>/<assignment_id>/<bruker>/` (kursnavnet sanert for
filsystem-ugyldige tegn). **Enkeltkurs-kloning er uendret**: velges ett kurs
på vanlig måte (`--course` eller kursvelgeren), brukes fortsatt den
opprinnelige `grading/<assignment_id>/<bruker>/`-strukturen, uansett hvor
mange eller få oppgaver det gjelder.

**Begrunnelse:** Bekreftet eksplisitt: oppgave-IDer er bare unike *innenfor*
ett kurs, ikke på tvers av kurs — to ulike kurs kan ha oppgaver med samme
`assignment_id`. Uten kurset i stien ville kloning fra to kurs med
kolliderende ID-er skrevet over/blandet sammen i samme mappe. Dette ble også
verifisert med en ende-til-ende røyktest (fake Canvas-server, to kurs med
bevisst samme `assignment_id`) under implementasjonen — bekreftet at
innleveringer rutes riktig og havner i separate `grading/<kurs>/...`-mapper.

**Skjønnsmessig valg (ikke eksplisitt bekreftet med deg):** Når en spesifikk
enkelt-oppgave plukkes *via* cross-course-navigasjonen (søk i den
sammenslåtte oppgavelisten, ikke bulk-valget), beholder den likevel
`grading/<kurs>/...`-strukturen for resten av den økten, selv om akkurat den
oppgaven i seg selv bare hører til ett kurs og teknisk sett kunne brukt den
vanlige strukturen. Valgt for forutsigbarhet (strukturen avhenger av
inngangspunktet du valgte, ikke av hvor mange kurs resultatet endte opp i),
men det er en tolkning, ikke noe du har bekreftet eksplisitt — se åpent
spørsmål i `ROADMAP.md`. Snarvei-generatoren (`--generate`) faller derimot
tilbake til `--course <ekte-kurs-id> --assignment <id>` for akkurat dette
tilfellet, siden `--assignment` krever `--course` og ikke kan kombineres med
`--all-courses` — det er den eneste gyldige, og også mest presise, snarveien
for én spesifikk oppgave.

**Forkastede alternativer:** En flat `grading/<assignment_id>/...`-struktur
uendret også for cross-course (forkastet — risiko for ID-kollisjon på tvers
av kurs er nettopp grunnen til at dette var avvist fra starten). Et eget
toppnivå-prefiks som "cross/" i stedet for kursnavnet (ikke vurdert — kursnavn
er mer informativt når du skal orientere deg i mappestrukturen etterpå).
