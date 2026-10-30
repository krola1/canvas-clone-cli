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

**Erstattet 2026-10-29** av «`gh`-reserveløsningen fjernet fra kloning» og
«Kloning uten lærerens påloggingsdata (T18)» nederst i filen. Står her for
historikkens skyld.

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

---

## 2026-10-25 — Karaktersetting: interaktiv enkelt-student i v0, ikke bulk/CSV/kommentar-only; quiz-oppgaver avvist eksplisitt; form-urlencoded request-format

**Beslutning:** Et nytt menyvalg («🎓 Sett karakter/tilbakemelding») i
"hva vil du klone?"-steget (etter at innleveringer er hentet for én enkelt
oppgave) lar deg velge én student, se nåværende karakter, skrive inn ny
karakter + valgfri tilbakemeldingstekst, og eksplisitt bekrefte (`confirm`)
før `gradeSubmission` (`src/canvas.js`) kaller
`PUT /api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id`.
Ingen rubric-vurdering, ingen filvedlegg på kommentaren, ingen bulk/CSV-import
i denne runden — én student om gangen, kun fritekst-karakter og -kommentar.
Ingen nytt CLI-flagg; kun interaktivt.

**Quiz-sjekk:** Før karaktersettingsvalget vises, sjekkes
`assignment.submissionTypes` (nytt felt, hentet fra Canvas sitt eksisterende
`submission_types` på assignment-objektet — ingen nye API-kall). Inneholder
den `"online_quiz"`, tilbys karaktersetting ikke i det hele tatt for den
oppgaven — i stedet vises en kort melding om at quiz-oppgaver må rettes
direkte i Canvas.

**Request-format for PUT-kallet (viktig, delvis uverifisert):** Canvas sin
offisielle dokumentasjon for `submissions`-endepunktet
(`canvas.instructure.com/doc/api/submissions.html`) beskriver nøstede
Rails-stil parametre (`submission[posted_grade]`, `comment[text_comment]`),
ikke en flat JSON-body. `gradeSubmission` sender derfor disse som
`application/x-www-form-urlencoded`-kodede feltnavn i request-bodyen, ikke
`application/json`. **Dette er IKKE testet mot en ekte Canvas-instans** —
kun verifisert mot dokumentasjonen og dekket av mock-baserte `node:test`-
tester (`tests/canvas.test.js`) som sjekker at riktige feltnavn/verdier
havner i body og at HTTP-metode/headere er riktige. Test mot en ekte
Canvas-instans før dette stoles blindt på i produksjon, spesielt for skoler
med eldre/avvikende Canvas-versjoner.

**Begrunnelse:** Bestilt av deg: sette karakter/tilbakemelding direkte fra
verktøyet i stedet for å måtte inn i Canvas sitt nettgrensesnitt for det
siste steget. Enkelt-student (ikke bulk) ble valgt som minste levedyktige
versjon — bulk-karaktersetting er en betydelig større og mer risikofylt
funksjon (feilsjanse multipliseres med antall studenter) og ble bevisst
utsatt. Quiz-avvisning fordi Canvas sin quiz-rettelogikk (spørsmål-for-
spørsmål, automatisk score fra quiz-motoren) ikke har noen meningsfull
representasjon i dette verktøyets enkle "karakter + fritekst-kommentar"-
modell.

**Forkastede alternativer:** JSON-body med `Content-Type: application/json`
for PUT-kallet (ikke det dokumentasjonen beskriver — forkastet uten faktisk
verifisering mot en ekte instans, se advarsel over). Bulk-karaktersetting
(CSV-import e.l.) i samme runde — utsatt, ikke avvist for godt. Rubric-basert
vurdering — utsatt, krever egen UI for rubric-kriterier som ikke fantes i
denne runden.

---

## 2026-10-25 — Ikke-interaktiv karaktersetting: `--github`/`--confirm`-flagg, fortsatt enkelt-student, `--generate` bevisst ikke utvidet

**Beslutning:** Den interaktive karaktersettingen over fikk et CLI-flagg-
motstykke: `--github <brukernavn>` identifiserer studenten (via GitHub-
brukernavn, slik læreren allerede navigerer i resten av verktøyet — Canvas
sin numeriske user-ID vises aldri i denne flyten), `--grade <verdi>` og
`--comment <tekst>` er selve innholdet (minst én av dem må oppgis, samme
regel som `gradeNothingToSend` i den interaktive flyten). `--confirm` er et
eget boolsk flagg: uten det skrives nøyaktig den samme oppsummeringen som i
den interaktive flyten ut, ingenting sendes til Canvas, og prosessen avsluttes
med exit 0 — en ren dry-run. Med `--confirm` sendes det faktisk.

**Begrunnelse for `--confirm` som eget, påkrevd flagg:** Bevisst strengere enn
resten av verktøyets flagg, som alle kjører direkte uten bekreftelse.
Karaktersetting er verktøyets eneste irreversible, skrivende handling mot
ekte elevdata — det skal ikke kunne skje ved et uhell fra en kopiert eller
scriptet kommando (f.eks. en `--grade`-kommando limt inn fra chat-historikk
uten at avsenderen tenkte over at den ville kjøre med en gang).

**`--github` fremfor Canvas user-ID:** Læreren kjenner GitHub-brukernavnet
fra resten av arbeidsflyten (mappenavn, `displayName`-default), ikke
Canvas sin interne numeriske ID — å kreve sistnevnte ville vært en unødvendig
ekstra oppslagsjobb og et fremmedelement i resten av verktøyets
brukeropplevelse.

**Bulk-karaktersetting via flagg er eksplisitt utenfor scope:** Samme
begrunnelse som for den interaktive flyten (se oppføringen over) — en
flagg-basert bulk/CSV-variant ville multiplisert feilsjansen med antall
studenter, og er en betydelig større funksjon enn det som ble bedt om her.

**`--generate` er bevisst ikke utvidet til å dekke dette:** Snarvei-
generatoren bygger kommandoer for *navigasjon* (kurs/kategori/oppgave), ikke
for skrivende handlinger — å la den generere en `--github ... --confirm`-
kommando ville gjort det for lett å ved et uhell dele eller gjenbruke en
ferdig karaktersettings-kommando uten å tenke gjennom innholdet på nytt hver
gang, noe som undergraver hele poenget med å kreve eksplisitt `--confirm`.

**Forkastede alternativer:** Canvas user-ID som identifikator i stedet for
GitHub-brukernavn (forkastet, se begrunnelse over). Et enkelt
`--yes`/`--force`-navn for bekreftelsesflagget — `--confirm` ble valgt for å
være eksplisitt om *hva* som bekreftes, i tråd med den interaktive flytens
`confirm()`-prompt. Å la `--generate` dekke karaktersetting — forkastet, se
begrunnelse over.

---

## 2026-10-27 — Øktmappe per kjøring under `~/canvas-clone/grading/`, og sletting alltid

**Beslutning:** Repoer klones til `~/canvas-clone/grading/<YYYYMMDD-HHMMSS>-<pid>/`
(`homedir()`, samme struktur på Linux, macOS og Windows), med
`<assignment_id>/<eier>_<repo>/` under (eller `<kurs>/<assignment_id>/...` ved
bulk på tvers av kurs) og `uten_lenke.txt` per oppgavemappe. Øktmappen slettes
alltid: Enter, Ctrl-C/SIGTERM/SIGHUP (exit 130), Esc, EOF på stdin, feil, og
`process.on("exit")`. Prosesser som dør uten å rydde (SIGKILL, krasj) ryddes ved
neste kjøring av en hvilken som helst kommando: øktmappen lages først, så slettes
øktmapper (ekte mapper med navn `<YYYYMMDD-HHMMSS>-<pid>`) der PID-en er død.
Annet under roten røres ikke, men gir en advarsel, og levende økter fra andre
kjøringer meldes (endret 2026-10-29 etter Lars' småfiks-runde; tidligere ble alt
annet slettet). Er roten eller `~/canvas-clone` en symlenke, ryddes ingenting ved
oppstart, bare en advarsel — vi nekter ikke å kjøre, fordi en symlenket mappe på en
annen disk er en legitim oppsett, og egen øktmappe slettes uansett via `safeRemove`. `~/canvas-clone/.gitignore`
(`*`) lages hvis den mangler. All sletting går gjennom `safeRemove()` i
`src/storage.js`, som krever at stien ligger strengt inni roten og verifiserer at
den er borte. Gamle `./grading/` i cwd gir bare en advarsel og røres aldri.
`--temp` godtas, men gjør ingenting annet enn å skrive en utfaset-melding.

**Erstatter:** `--temp`-beslutningene (2026-10-22 og bygget 2026-10-25) og
`./grading/`-strukturen i cwd (også i cross-course-oppføringen 2026-10-25).

**Begrunnelse:** Tilsynets vurdering (T3, T-N2, T-N3; `~/dotfiles/tilsynet/org/risikovurderinger.md`)
og Lars' bestilling 2026-10-27: verktøyet skal deles med andre lærere uten å etterlate
elevdata. `./grading` i cwd kunne havne i et annet git-repo og ble aldri slettet uten
`--temp`. Én øktmappe per kjøring med PID i navnet gjør at to samtidige kjøringer aldri
sletter hverandres data (kritikers B2), uten låsfil eller journal (en journal med stier
ville selv vært et spor, R-N3).

**Forkastede alternativer:** `--behold` for å beholde repoene (fjernet av Lars etter
tilsynet, ga lagring uten tidsgrense); egen slettekommando (ikke ønsket); felles
grading-mappe med sporing i minnet av hva som ble klonet (B2: samtidige kjøringer);
automatisk rydding av gamle `./grading` (kan være noe helt annet enn canvas-clone sin
mappe); låsfil/journal.

---

## 2026-10-27 — Mappenavn per innlevering: `<eier>_<repo>` med `-2`, `-3` ved kollisjon

**Beslutning:** Hver innlevering får sin egen mappe, `<eier>_<repo>` i små bokstaver,
med suffiks `-2`, `-3` … ved kollisjon innen samme oppgavemappe i økta
(`repoFolderName` i `src/storage.js`). Lista over repoer som kan åpnes peker alltid
på den mappen innleveringen faktisk ble klonet til.

**Begrunnelse:** Mappen het tidligere bare GitHub-eieren, så to elever med samme eier
(f.eks. samme repo levert av to, eller `Ola`/`ola`) delte mappe, og koden kunne vises
under feil elevs navn (kritikers B1). `_` kan ikke forekomme i GitHub-eiernavn, så
skillet er entydig (`a-b`+`c` ≠ `a`+`b-c`). Små bokstaver fordi macOS/Windows har
case-insensitive filsystemer.

**Forkastede alternativer:** Canvas `user_id` i mappenavnet (ny personidentifikator
på disk); løpenummer alene (ugjenkjennelig for læreren).

---

## 2026-10-27 — Karaktersetting: aldri første treff ved samme GitHub-eier, Canvas-navn i bekreftelsen

**Beslutning:** `--github` finner alle innleveringer med samme eier (case-insensitivt,
`findByGithub`). Ved flere treff: uten interaktiv terminal avbrytes det med exit 1
uansett `--confirm`; i terminal uten `--confirm` vises kandidatene (Canvas-navn) og
ingenting sendes; med `--confirm` velger læreren fra en liste med Canvas-navn, status
og nåværende karakter (aldri innleveringstekst). Bekreftelsen viser alltid
«Canvas-navn (GitHub: x)», både i flagg-flyten og i den interaktive flyten. I
interaktive lister står et skillende navn i parentes bare når to elever har samme
visningsnavn (`labelWithDuplicates`).

**Begrunnelse:** Tilsynets T1/T1a (blokkerende før deling): `--github` tok tidligere
første treff, og bekreftelsen viste GitHub-navnet, så karakter kunne havne på feil elev
uten at læreren så det. Parentes bare ved duplikat etter Lars' ønske, for å holde
listene korte.

**Forkastede alternativer:** Alltid vise Canvas-navn i parentes (Lars: bare ved
duplikat); velge første treff med en advarsel.

---

## 2026-10-27 — Bare `https://`, og `Link`-paginering bare på samme vert

**Beslutning:** Oppsettet krever `https://`; en eksisterende config med `http://`
avvises med beskjed om å kjøre `--setup`. `apiGetAll` følger `next` i `Link`-headeren
bare når den har samme origin som Canvas-URL-en; ellers avbrytes det med en feil som
bare viser vertsnavnet. Oppsettet anbefaler token med utløpsdato.

**Begrunnelse:** Tilsynets T4: tokenet sendes i hvert kall og skal aldri gå i klartekst
eller til en annen vert.

---

## 2026-10-27 — Windows: editorkommandoen skrives ut i stedet for å starte editoren

**Beslutning:** På win32 startes ingen editorprosess; verktøyet skriver ut
`code "<sti>"` (eller valgt editor) per repo (`planOpen` i `src/editor.js`). På POSIX
`spawnSync(editor, [dest])` uten shell, som før. Ingenting er forhåndsvalgt i lista
over repoer som skal åpnes, og det vises en advarsel om upålitelig kode.

**Begrunnelse:** `code`/`zed` er `.cmd`-filer på Windows og kan ikke startes uten
`shell: true`, som gir kommando-injeksjon via kursnavn/stier (tilsynets T-N4/R-N4).
Lars valgte utskrift (kritikers F4). Ikke forhåndsvalgt: tilsynets T5 (ukjent elevkode
åpnes ikke automatisk).

**Forkastede alternativer:** `shell: true` eller `cmd /c` med validerte argumenter
(mer kode og fortsatt risiko); regex på editornavnet (beskytter ikke uten shell og
ville stoppet full sti).

---

## 2026-10-29 — Kloning uten lærerens påloggingsdata (T18), felles for CLI og VS Code-utvidelse

**Beslutning:** All kloning (`src/github.js`) kjører `git` med et sanert miljø og
faste `-c`-flagg, slik at lærerens GitHub-pålogging aldri brukes:

- Fjernet fra miljøet: `GIT_ASKPASS`, `SSH_ASKPASS*`, `VSCODE_GIT_*`, `GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_PARAMETERS`,
  `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*` (navnene sammenlignes
  uten hensyn til store/små bokstaver, for Windows). Satt: `GIT_TERMINAL_PROMPT=0`
  og `GIT_ASKPASS=` (tom), og `LANGUAGE=C` + `LC_MESSAGES=C` (Lars 2026-10-29) slik
  at git-meldingene er engelske og «uten tilgang» gjenkjennes uansett lærerens
  språk; `LANGUAGE` går foran et arvet `LC_ALL` for meldinger, og `LC_ALL` røres
  ikke.
- Argumenter:
  `git -c credential.helper= -c core.askPass= -c http.extraHeader= -c http.<url>.extraHeader= -c url.<url>.insteadOf=<url> -c protocol.allow=never -c protocol.https.allow=always clone --quiet -- <url> <dest>`,
  der `<url>` er `https://github.com/<eier>/<repo>.git`.
- `cloneRepo` (synkron, CLI-et, samme Ctrl-C-oppførsel som før) og
  `cloneRepoAsync` (`spawn` uten shell, `AbortSignal`, for utvidelsen) deler URL,
  argumenter, miljø og tolkning av resultatet. Bare selve kjøringen er forskjellig.

**Begrunnelse:** Tilsynets T18 og D0 k (`.claude/docs/D0-vscode-verifisering.md`):
`GIT_TERMINAL_PROMPT=0` stopper ikke askpass, og VS Code kan lekke `GIT_ASKPASS`/
`VSCODE_GIT_*` inn i miljøet. Elevrepoene er offentlige, så pålogging trengs ikke.
Lars godkjente 2026-10-29 at CLI-et får samme isolasjon som utvidelsen.

De to argumentene med `<url>` kom til i D1, etter forsøk med git 2.56 mot en
lokal HTTP-server:
- `-c http.extraHeader=` tømmer bare den generelle lista. En URL-spesifikk
  `http.<url>.extraHeader` i lærerens config har høyere presedens og ble sendt
  likevel, og da overlevde også den generelle. `http.<klone-url>.extraHeader=` er
  den mest spesifikke nøkkelen som kan matche, og tømmer alt.
- `url."https://<token>@github.com/".insteadOf "https://github.com/"` skriver
  URL-en om til https med innebygd token, som `protocol.https.allow=always`
  slipper gjennom. `url.<klone-url>.insteadOf=<klone-url>` er lengste treff og
  vinner, så omskrivingen slår ikke inn.
Lars godkjente begge 2026-10-29.

**Bivirkning:** Også legitime `insteadOf`-regler for github.com (for eksempel et
speil eller en intern proxy-URL) slår ikke lenger inn ved kloning. Proxy og CA
(`http.proxy`, `http.sslCAInfo`, `schannel`) virker som før.

**Forkastede alternativer:** `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM=1` (fjerner
skolens proxy- og CA-oppsett). `GIT_TERMINAL_PROMPT=0` og `credential.helper=`
alene (stopper ikke askpass, extraHeader eller insteadOf). Å sende `-c`-verdiene
via `GIT_CONFIG_COUNT`-miljøet (ville spart to testendringer, men avviker fra
den godkjente formen).

**Unntak fra «eksisterende tester uendret»:** De nye `-c`-flaggene står foran
`clone`, så to eksisterende tester ble endret med én linje hver (godkjent av Lars
2026-10-29): `tests/github.test.js` sammenligner nå de fem siste argumentene
(`args.slice(-5)`), og den falske gitten i `tests/e2e.test.js` ser etter `clone`
hvor som helst i argumentene (`a.includes("clone")`).

---

## 2026-10-29 — `gh`-reserveløsningen fjernet fra kloning; egen grunn «uten tilgang»

**Beslutning:** Kloning bruker bare `git`. `gh repo clone` er fjernet, og `gh`
er ikke lenger nevnt som krav. Feiler kloningen fordi repoet er privat, slettet
eller feilstavet (git sier «could not read Username/Password», «terminal prompts
disabled», «Repository not found», «Authentication failed» eller HTTP
401/403/404), får innleveringen grunnen «uten tilgang» i `uten_lenke.txt` og i
utskriften, uten git sin feilmelding. Andre klonefeil (nettverk, disk) beholder
«klone-feil» med git sin melding. Klassifiseringen er en ren funksjon
(`classifyCloneError` i `src/github.js`), og resultatet fra `cloneRepo`/
`cloneRepoAsync` har feltet `reason: "no_access" | "failed"` i tillegg til
`error`. Utvidelsen skal bruke `reason` og ikke vise `error` (rå stderr med
repo-URL, T11).

**Erstatter:** «`git clone` med `gh` som fallback for private repo» (2026-10-22).

**Begrunnelse:** Lars 2026-10-29: elevrepoene er offentlige. `gh` ville brukt
lærerens pålogging, i strid med T18. Tilsynets R6 bortfaller. Egen grunn fordi
«klone-feil: … (fatal: could not read Username …)» ikke forteller læreren hva som
er galt.

**Forkastede alternativer:** Beholde `gh` som eget valg (i strid med T18).

---

## 2026-10-29 — Felles kjerne for CLI og VS Code-utvidelse: `config-store.js` og `workflow.js`

**Beslutning:** Logikk som både CLI-et og utvidelsen trenger, ligger i `src/` uten
`@inquirer`/`ora`/konsoll:
- `src/config-store.js`: config-sti, `isHttpsUrl`, `loadConfig`, `saveConfig`.
  `src/config.js` re-eksporterer dem og beholder oppsettet med prompts.
  `src/cache.js` importerer fra `config-store.js`.
- `src/workflow.js`: ren logikk flyttet ordrett ut av `bin/` (bulk-filter,
  levert/trenger retting, mappesti, nøkkel per oppgave, formatet i
  `uten_lenke.txt`, cross-course-kurset). Karakteriseringstester ble skrevet
  først (`tests/workflow.test.js`) og var grønne før og etter flyttingen.
Ingen filer er flyttet, og CLI-et oppfører seg likt for brukeren.

**Begrunnelse:** Bestillingen 2026-10-29 (utvidelsen bruker felles kjerne, CLI-et
uendret for brukeren) og plansteg D1. En bundle av `src/` uten `config.js` drar
da ikke inn `@inquirer` eller `ora`.

**Forkastede alternativer:** Flytte filer til en egen `core/`-mappe (større diff,
ingen gevinst nå).


---

## 2026-10-29 — VS Code-utvidelsen: build-steg bare i `vscode/`, CJS-bundle, ingen innstillinger

**Beslutning:** Utvidelsen ligger i `vscode/` med egen `package.json` og egne
devDependencies (`esbuild`, `@vscode/vsce`, `@vscode/test-electron`,
`@vscode/test-cli`, `mocha`). Ingen runtime-avhengigheter, og rot-`package.json`
er uendret.
- **Bygg:** `vscode/esbuild.mjs` bundler `vscode/src/extension.js` og det den
  importerer fra `../src` til én fil, `vscode/dist/extension.js`
  (`format: cjs`, `platform: node`, `target: node20`, `external: ['vscode']`,
  ingen sourcemap). Metafilen skrives til `dist/meta.json`.
  `vscode/package.json` har ikke `"type": "module"`, så `.js`-bundelen lastes
  som CJS (D0 h).
- **`engines.vscode: ^1.100.0`** (Node 20, global `fetch`, mulig å gå over til
  ESM senere uten å heve minimum). Testene kjører mot 1.100.0.
- **`capabilities.untrustedWorkspaces: { supported: "limited" }`**,
  `virtualWorkspaces: false`. Aktivering: `onStartupFinished` +
  `workspaceContains:.canvas-clone-okt` (øktmarkøren, navnet bestemt av Lars 2026-10-29).
- **Ingen `contributes.configuration`** (T8). URL i `globalState`, token i
  SecretStorage (D3).
- **Pakking:** `.vscodeignore` er en hviteliste (`**`, så `!dist/extension.js`,
  `!package.json`, `!README.md`, LICENSE/CHANGELOG). `vscode/scripts/check-package.mjs`
  leser den faktiske `.vsix`-fila og `vsce ls` mot samme hviteliste, og feiler
  hvis esbuild-metafilen viser `@inquirer/*`, `ora`, `src/config.js`, `bin/`
  eller andre eksterne enn `vscode` og Node-moduler (T14a).
- **Tester:** `vscode/vsc-tests/*.vsctest.js` (navn og mappe som rot-`node --test`
  ikke plukker opp). `npm test` i `vscode/` bruker `@vscode/test-cli`, som alltid
  legger til `--disable-workspace-trust`. Kjøringen uten tillit har derfor egen
  starter, `vscode/scripts/kjor-uten-tillit.mjs` (spawn uten shell, egen
  `--user-data-dir` under `.vscode-test/`). Begge med `--disable-extensions`.
- **CI:** `.github/workflows/ci.yml`, Ubuntu/Windows/macOS, Actions pinnet til
  commit-SHA, `permissions: contents: read`, `npm ci --ignore-scripts`, ingen
  secrets eller artefakter (T19).

**Begrunnelse:** Bestillingen 2026-10-29 (godkjente devDependencies, build-steg
bare for `vscode/`), D0 g/h/i og tilsynets T8, T14a, T15, T17 og T19. CLI-et
forblir uten build-steg.

**Avvik fra:** «Node.js (ESM) uten build-steg» (2026-10-22) gjelder fortsatt
for CLI-et og `src/`, men ikke for `vscode/`.

**Forkastede alternativer:** ESM-bundle med `"type": "module"` (krever 1.100+
uansett og gir ingen gevinst nå; testkjøreren er ikke dokumentert for ESM).
Bruke `runTests` fra `@vscode/test-electron` direkte for begge kjøringene (ble
unødvendig da `@vscode/test-cli` ble godkjent). Lese `.vsix` med en zip-pakke
(ny avhengighet; zip-katalogen leses for hånd i stedet).

---

## 2026-10-29 — VS Code-utvidelsen, D3: oppsett og token i SecretStorage, tekst i `src/strings.js`

**Beslutning:**
- **Kommandoer:** «Canvas Clone: Oppsett (Canvas-URL og token)» (`canvasClone.setup`) og
  «Canvas Clone: Slett token og Canvas-URL» (`canvasClone.deleteToken`). I tillegg en intern
  kommando `canvasClone._tilstand` (ikke i `package.json`, ikke i paletten) som gir
  `{ canvasUrl, token: "ok" | "forsvant" | "ikke_satt_opp" }`, aldri selve tokenet.
- **Lagring (T8, T13):** URL i `context.globalState` (`canvasClone.canvasUrl`), token bare i
  `context.secrets` (`canvasClone.canvasToken`), og et flagg `canvasClone.tokenLagret` i
  `globalState`. Ingen `contributes.configuration`, ingen `setKeysForSync`. Utvidelsen leser
  aldri CLI-ets config/token.
- **Flyt:** URL i `showInputBox` (samme regel som CLI-et: `isHttpsUrl`, skråstrek på slutten
  fjernes), token i `showInputBox({ password: true })` med råd om utløpsdato, så `whoAmI`. Bare
  ved `ok` lagres token, URL og flagg (token først). Ved feil lagres ingenting, og meldingen er
  CLI-ets (`tokenInvalid`, `tokenCheckNetworkError`, `tokenCheckOtherError`) med tokenet vasket
  bort.
- **Slett** fjerner token, URL og flagg, og minner om å slette tokenet i Canvas.
- **Token som forsvant (T13/R-V7):** Er flagget satt, men tokenet mangler, viser utvidelsen ved
  aktivering et varsel om at systemet trolig mangler nøkkelring, med knappen «Kjør oppsett».
  Ikke i øktvinduet (en mappe med `.canvas-clone-okt`), som ikke trenger tokenet.
- **Ren logikk** i `vscode/src/oppsett.mjs` (uten `vscode`-import, `.mjs` fordi
  `vscode/package.json` ikke har `"type": "module"`), testet med `node --test` i
  `tests/vscode-oppsett.test.js`. `vscode/src/extension.js` står for UI-et.
- **Tekst:** Utvidelsens tekster ligger i `src/strings.js` (nøkler `vsc*`), slik prosjektregelen
  krever. Språket velges med `createStrings(!erNorsk(vscode.env.language))`: norsk for
  `nb`/`nn`/`no`, ellers engelsk. Kommandotitlene står på norsk i `vscode/package.json`, som i D2.
- **Testoppsett:** Begge røyktestkjøringene startes med `--use-inmemory-secretstorage`, slik at
  de aldri rører nøkkelringen, `basic`-lagring fra `~/.vscode/argv.json` eller VS Codes modale
  keyring-dialog (D0, «D3-funn»). Falsk Canvas via `globalThis.fetch` og utbyttet
  `showInputBox` i `vsc-tests/hjelpere/falsk-canvas.js`.

**Begrunnelse:** Bestillingen (token i SecretStorage, separat fra CLI-et; språket følger
VS Code; ingen innstillinger), tilsynets T8, T13, T15, R-V1 og R-V7, og D0 c med D3-funnene.
Flagget i `globalState` er eneste måte å skille «aldri satt opp» fra «forsvant»: VS Code har
ikke noe API for å spørre om lagringen er i minnet.

**Forkastede alternativer:**
- Egen tekstfil i `vscode/src/` eller `vscode.l10n`/`package.nls.json`: strider mot regelen om
  all tekst i `src/strings.js`, og gjenbruk av CLI-ets tokenmeldinger hadde blitt dobbelt.
  `package.nls.*` for kommandotitlene kan vurderes i D7 (se Åpne spørsmål i STATUS).
- Bekreftelsesdialog før sletting: lite å tape (oppsettet kan kjøres igjen), og en modal dialog
  gjør kommandoen vanskeligere å teste.
- Å lagre URL-en selv om tokenet feiler: bestillingen sier at ingenting skal lagres ved feil.

## 2026-10-29 — Lars' avgjørelser etter D3

- **Språk:** beholdes som bygget. Meldingene i utvidelsen følger
  `vscode.env.language` (norsk for nb/nn/no, ellers engelsk), kommandotitlene i
  `vscode/package.json` og README er norske. Ingen `package.nls.json` i v1.
- **Karakterpanelet (D6)** ligger i hovedvinduet. Uten nøkkelring har
  øktvinduet ikke tokenet, og det trenger det heller ikke.
- **Manuelle sjekker** av ekte nøkkelring, den modale keyring-dialogen og
  varselet om token som forsvant tas i D8 (se STATUS, sjekklisten).

---

## 2026-10-29 — VS Code-utvidelsen, D4: økter, hjerteslag og én felles regel for sletting

**Beslutning:**
- **Rot og navn:** `~/canvas-clone/vscode/<YYYYMMDD-HHMMSS>-<8 hex>/` (egen rot, Lars og
  tilsynets T12). Tilfeldig hex i stedet for PID: PID-en er ikke låsen her (hjerteslaget er),
  og navnet skal aldri brukes om igjen (T9a, tillit gitt til en sti blir liggende). Mappen
  lages uten `recursive`; finnes navnet, prøves et nytt.
- **Innhold ved oppretting:** `<økt>/.vscode/settings.json` (bare den: `workbench.localHistory.enabled:
  false`, `search.followSymlinks: false`, `chat.useNestedAgentsMdFiles: false`, `files.exclude`
  for markørene og `.vscode`), og til slutt markøren `.canvas-clone-okt`. En mappe uten markør
  er ikke en økt, men kan slettes som *rest* (se Sletting). `ensureBaseGitignore` lager
  `~/canvas-clone/.gitignore`.
- **Hjerteslag:** markørens mtime, satt av øktvinduet hvert 5. s (`utimes`). Ingen stier,
  ingen journal.
- **«Ferdig»** (øktvinduet, kommando og statuslinjeknapp): advarer ved ulagrede faner
  (`tabGroups`, T11c) og tilbyr «Lukk editorene og avslutt» (`closeAllEditors`, VS Code spør
  om hver fil); er noe fortsatt ulagret, avsluttes ikke økten. Så stoppes hjerteslaget,
  `.canvas-clone-ferdig` skrives atomisk (`{ tid, workspaceStorage }`, der `workspaceStorage`
  er forelderen til `context.storageUri`), og `workbench.action.closeWindow` kjøres. Lever
  vinduet fortsatt 3 s etterpå, slås hjerteslaget på igjen (opphever markøren) og læreren
  får beskjed. Tidtakeren startes før `closeWindow`, så gjenopplivingen kommer selv om
  kommandoen aldri svarer. Venter `closeWindow` på en dialog og vinduet lukkes etter mer enn
  3 s, er «Ferdig» allerede opphevet, og økten slettes som forlatt etter ca. 3–4 min i stedet
  for etter 7 s.
- **Den felles regelen** (`vurderOkt`/`kanGjenopptas` i `vscode/src/okter.mjs`):
  - Hovedvinduet sletter en økt som er *ferdig* (markør, ingen hjerteslag etter `tid` + 2 s
    toleranse, minst 6 s siden) eller *forlatt* (hjerteslag eldre enn 180 s, og hovedvinduet
    selv har vært våkent minst 30 s, se under). Alt annet røres ikke; et ferskt hjerteslag
    slettes aldri. Et hjerteslag mer enn 24 t fram i tid (`FRAMTID_MAKS`, klokka stilt kraftig
    tilbake) regnes som gammelt, både for sletting og for å fortsette.
  - Et øktvindu som starter (nytt vindu, Reload, betrodd → ikke betrodd, eller gjenopprettet
    etter omstart av VS Code) fortsetter bare hvis økten ikke er ferdig og hjerteslaget er
    yngre enn 60 s. Ellers lukker det seg uten å slå («lukkes VS Code, er økten slutt»).
  - Fordi 60 s < 180 s kan et vindu som får fortsette, aldri samtidig bli slettet (testet
    over et rutenett av alder/ferdig-tid/våkentid).
- **Hvilemodus (B2):** hovedvinduet tikker hvert 3. s. Kommer et tikk mer enn 18 s for sent
  (eller klokka går bakover), regnes det som hvilemodus, og «våken siden» settes til nå.
  Forlatte økter slettes først når hovedvinduet har vært våkent i 30 s, så øktvinduet rekker å
  slå etter oppvåkning. Samme vakt gjelder rett etter oppstart (reserveoppryddingen).
- **Hovedvinduet holder** en økt det selv har opprettet (D5 kloner inn i den) ved å slå for den,
  til den åpnes eller høyst 30 min. Ved åpning slås det én gang, og holdet slippes. En økt med
  ferdig-markør holdes aldri. (I første prøvekjøring holdt hovedvinduet økten i 60 s også etter
  «Ferdig», så markøren ble opphevet; rettet og dekket av en regresjonstest.)
- **Roller:** et vindu med nøyaktig én workspace-mappe som består sti-sjekken er øktvindu; alle
  andre er hovedvinduer og rydder. Flere hovedvinduer kan rydde samtidig (idempotent).
- **Åpning (T9):** T9b (modal hvis `security.workspace.trust.enabled` er av, «Åpne likevel»),
  T9c (modal advarsel før første åpning, flagg `canvasClone.oktAdvarselVist` i `globalState`),
  deretter `vscode.openFolder(<økt>, { forceNewWindow: true, noRecentEntry: true })`. T9d:
  øktvinduet viser en modal ved `workspace.isTrusted` (ved aktivering og
  `onDidGrantWorkspaceTrust`) med «Lukk økten» først og «Fortsett likevel». Ingen knapp har
  `isCloseAffordance` (da ville VS Code gjort «Fortsett likevel» til standardknappen). Escape,
  VS Codes egen «Avbryt» og alt annet enn et klikk på «Fortsett likevel» kjører «Ferdig»
  (Lars, 2026-10-29).
- **Sletting:** all sletting via `safeRemove()`. Før det `sjekkOktSti`: navnet må være et
  øktnavn, mappen må ligge *direkte* under roten (realpath), være en ekte mappe (ikke
  symlenke) og ha markøren som vanlig fil; roten selv avvises. Er roten eller
  `~/canvas-clone` en symlenke, slettes bare ferdige økter, ikke forlatte (samme vakt som
  `startupCleanup`, der CLI-et også alltid sletter sin egen økt), og læreren får en advarsel.
- **Sletting i to steg:** økten får først navnet `<navn>.slettes-<8 hex>` (rename i samme
  mappe), så slettes den. Feiler renamen, står økten urørt. Feiler slettingen halvveis, slettes
  «slettes»-mappen neste runde uten ny vurdering (slettingen er allerede bestemt).
- **Rester (Lars, 2026-10-29):** en ekte mappe med øktnavn, men uten markør (f.eks. gjenskapt av
  VS Code fordi en fil ble lagret etter slettingen), slettes når mappen selv har stått urørt
  lenger enn 180 s og hovedvinduet har vært våkent i 30 s. Aldri under symlenket rot. En økt
  som akkurat opprettes (markøren skrives rett etter mappen) er ny og røres ikke. Samme
  sti-vakt som for økter (`sjekkRestSti`).
- **T11b:** `workspaceStorage/<id>/` fra ferdig-markøren slettes bare hvis den er en ekte mappe
  direkte under hovedvinduets `workspaceStorage/` (utledet fra `globalStorageUri`, også når
  utvidelsen kjører i en annen profil enn standard: `workspaceStorage` ligger alltid rett under
  `User/`), har et 32-hex id-navn, og dens `workspace.json` peker på nøyaktig denne øktmappen.
  Begge sider sammenlignes med realpath, så en symlenke over roten gir ikke falsk avvisning.
  Etter sletting kjøres `vscode.removeFromRecentlyOpened` som sikkerhetsnett.
- **T11b for økter uten «Ferdig»** (krasj, krysset, omstart): hovedvinduet skanner
  `workspaceStorage/*/workspace.json` omtrent hvert 20. tikk og sletter id-mapper der `folder`
  ligger direkte i øktroten, har øktnavn, og økten (eller en rest med samme navn) ikke finnes
  lenger. Samme vakt som over.
- **For D5:** interne kommandoer `canvasClone._nyOkt` (lager og holder en økt),
  `canvasClone._apneOkt(sti)`, `canvasClone._rydd`, `canvasClone._okt` og
  `canvasClone._tillitsSjekk` (bare øktnavn og status, ingen elevdata), og `oktUndermappenavn`
  (som `sanitizeFolderName`, men aldri med punktum først, T9a).
- **Tester:** ren logikk i `tests/vscode-okter.test.js` (rot-`npm test`). VS Code-testene får
  eget `HOME` under `vscode/.vscode-test/hjem-*` (`vsc-tests/hjelpere/testhjem.mjs`), slik at
  øktroten og `~/.vscode/argv.json` er testens egne. Ny testkjøring `oktvindu` (betrodd), og
  kjøringen uten tillit åpner nå en ekte økt med et falskt elevrepo.

**Begrunnelse:** Bestillingen (D4), kritikers B1/B2, tilsynets T9, T11/T11b/T11c og T12, Lars'
avklaringer 2026-10-29 («Ferdig» i øktvinduet, hovedvinduet sletter rett etterpå, egen rot,
hjerteslag uten stier) og D0 b, e, g og n. Prøvekjøringene står i D0-notatet («D4-funn»).

**Forkastede alternativer:**
- PID i øktnavnet som lås (som CLI-et): øktvinduet og hovedvinduet er ulike prosesser, og
  VS Code kan ikke spørres om andre vinduer (D0 n).
- Hjerteslag som innhold i markøren (JSON med tid): krever atomisk skriving hvert 5. s;
  `utimes` er enklere og leses med én `lstat`.
- Å skrive ferdig-markøren i `deactivate()` når vinduet lukkes med krysset: `deactivate` kjøres
  også ved Reload og tillitsoverganger, og et Reload som tar mer enn 6 s ville da fått økten
  slettet under seg.
- Å la «Ferdig» lagre eller forkaste ulagrede filer selv: VS Code har ikke API for å forkaste
  alle, og å lagre elevfiler uten å spørre er overraskende. VS Code spør i stedet.
- Å la øktvinduet rydde andre økter: det kjører uten tillit med elevkode åpen; ryddingen hører
  hjemme i hovedvinduet.

## 2026-10-29 — Lars' avgjørelser etter D4

- **Tidsgrensene** beholdes som bygget, også at en omstart innen 60 s lar økten fortsette.
- **Under symlenket rot** slettes bare ferdige økter. Tilsynet kvitterer ved punkt b.
- **Rydding av `workspaceStorage`** for økter uten «Ferdig» bygges (se D4 over).
- **Rester** (øktnavn-mapper uten markør) slettes etter 180 s (se D4 over). Tilsynet får regelen
  med til punkt b (T12/R-V6).
- **Escape i T9d-modalen** betyr «Lukk økten».
- **Test av tillitsoverganger** (ikke betrodd ↔ betrodd i praksis) flyttes til D8.
- **Testriggen** ligger i `vscode/scripts/` og kjøres for hånd.
- **T12:** «slett alle nå» og «vis hva som ble liggende» bygges i D5.

---

## 2026-10-30 — VS Code-utvidelsen, D5: bla og klone i en trevisning, T12 med samme regel som ryddingen

**Beslutning:**
- **Trevisning, ikke QuickPick, for å bla.** Visningen «Canvas Clone» i Utforskeren
  (`canvasClone.tre`, skjult i øktvinduet med `when: !canvasClone.oktvindu`): kurs →
  fagretning → modul → oppgave → innleveringer. Samme kategorisering
  (`buildCategoryTree`), sortering (`sortByGrading`) og tekster («N klare til retting»)
  som CLI-et. CLI-ets «Vis alle oppgaver» er kursnoden selv. Innleveringene hentes når
  en oppgave åpnes og holdes bare i minnet. QuickPick brukes for valg som tas én gang per
  kloning: bulk-filter, omfang for én oppgave, «Velg selv» (flervalg) og kloning på
  tvers av kurs.
- **«Klon» per nodetype:** innlevering = bare den; oppgave = «Kun de som trenger
  retting» (først, når det er et reelt valg) / «Alle innleverte» / «Velg selv», som
  CLI-ets `pickCloneScope`; kurs, fagretning og modul = bulk med `selectForBulk`.
- **Kurs på tvers** er en egen kommando (🌐 i visningens tittellinje og i paletten):
  QuickPick med flervalg av kurs → `buildCrossCourseCourse` → omfang (alle oppgaver, en
  fagretning eller «fagretning › modul») → «alle i denne listen» (bulk) eller én oppgave.
  Mappestrukturen er `<økt>/<kurs>/<assignment_id>/` uansett, som i CLI-et.
- **T16:** bulk-filteret velges i QuickPick med «trenger retting» øverst og forhåndsvalgt.
  Fra **20** repo (`STOR_BULK` i `vscode/src/bla.mjs`) kreves en modal bekreftelse med
  antallet, også for «Alle innleverte»/«Velg selv» på én oppgave. Antallet vises ellers i
  fremdriften og oppsummeringen.
- **Cache:** `src/cache.js` som i CLI-et, altså samme `cache.json` (CLI-ets config-mappe,
  nøkkelsatt på Canvas-URL-en, bare kurs og oppgaver) og CLI-ets standard-TTL på 15 min.
  «Oppdater fra Canvas» tilsvarer `--refresh`. Utvidelsen leser fortsatt ikke CLI-ets
  `config.json` (T13).
- **Kloning:** én ny økt per kloning (`hoved.nyOkt`, holdt av hovedvinduet, holdet fornyes
  etter hver klone). Planen (mappe per innlevering, `repoFolderName`) lages i rekkefølge
  før kloningen går i parallell (`mapWithConcurrency`, 4 samtidige git-prosesser) med
  `cloneRepoAsync` (T18). `withProgress` med Avbryt: avbrudd dreper git, og hele økten
  slettes (som Ctrl-C i CLI-et). `uten_lenke.txt` har CLI-ets format, men ved klone-feil
  står «klone-feil: <repo> (nettverk, disk eller git)» i stedet for git sin stderr
  (DECISIONS 2026-10-29: utvidelsen viser ikke `error`). Ble ingenting klonet, spør en modal
  melding om økten skal åpnes likevel; ellers slettes den. Så åpnes økten med D4-flyten
  (T9b/T9c, `forceNewWindow`, `noRecentEntry`); avbrytes den, slettes økten.
- **T9a:** mappene rett under økten navngis med `oktUndermappenavn` (oppgave-ID, og kursnavn
  på tvers av kurs). Ellers er strukturen lik CLI-ets `destRootFor`.
- **`finnGit()`** (`vscode/src/git-sti.mjs`, D0 j): Windows: Git for Windows under
  `ProgramW6432`/`ProgramFiles(x86)`/`ProgramFiles`/`LocalAppData\Programs`, så `git.exe` i
  PATH (aldri `.cmd`); macOS: git i PATH, men `/usr/bin/git` bare hvis `xcode-select -p`
  lykkes; ellers git i PATH. Relative PATH-oppføringer hoppes over. Full sti til spawn.
- **T11:** `TreeItem.id` = `cc<teller>` per vindu (telleren nullstilles ikke ved
  «Oppdater»). Ingen ny nøkkel i `globalState`/`workspaceState`. OutputChannel
  «Canvas Clone» (lages først når noe logges) får bare øktnavn og antall. Ingen
  `setState`/serializer.
- **T12:** «Vis hva som ble liggende» (QuickPick med begge røttene, bare øktnavn og status,
  og «Slett alle økter nå» øverst når noe kan slettes) og «Slett alle økter nå» (modal
  bekreftelse med antall per rot). `vscode/` slettes med hovedvinduets vanlige rydding,
  altså D4-regelen uendret: et ferskt hjerteslag og økter hovedvinduet holder, røres aldri,
  og forlatte økter først etter 180 s. `grading/` slettes med `startupCleanup` uendret
  (`ownName` null, `ownPid` −1). For at visningen og slettingen skal følge nøyaktig samme
  regel, er `ryddOkter` delt i `kartleggOkter` (ren kartlegging) og selve slettingen;
  oppførselen er uendret (D4-testene uendret og grønne).
- Kommandoene for bla, klone og T12 gjør ingenting i øktvinduet (melding om at de hører til
  hovedvinduet).
- **Tester:** ren logikk med `node --test` (`tests/vscode-bla.test.js`,
  `vscode-rester.test.js`, `vscode-git-sti.test.js`), inkl. T-A-vaktpost (body med unik
  streng gjennom `listSubmissions`) og at ingen direkte undermappe av økten begynner med
  punktum. VS Code: egen kjøring `bla` (eget HOME og `XDG_CONFIG_HOME`, falsk git først i
  PATH, `--force-disable-user-env` så login-skallet ikke bytter PATH). Prøveriggen har
  scenario `klone` med sqlite3-sjekk av `state.vscdb` (D0 m), fordi testkjøreren holder
  all tilstand i minnet.

**Begrunnelse:** Bestillingen (D5), tilsynets T-A, T9a, T11, T12, T15, T16 og T18, D0 j og m,
og Lars' avgjørelser etter D4 (T12 i D5). Trevisningen viser hele hierarkiet med tall på
hvert nivå samtidig og lar læreren gå fram og tilbake uten å starte på nytt; det er det
CLI-ets fase-navigasjon gjør i terminalen. Terskelen 20: én oppgave for én klasse ligger
som regel under, mens bulk over en modul, et kurs eller flere kurs fort går over.

**Forkastede alternativer:**
- QuickPick-trinn (som CLI-et) også for å bla: kortere kode, men hvert tilbake-steg
  starter flyten på nytt, og tallene på andre nivåer er ikke synlige samtidig.
- `vscode.git` sitt `getAPI(1).git.path` i `finnGit`: finnes bare når git-utvidelsen er
  aktiv (ikke i Restricted Mode eller med `git.enabled` av), og ville gjort testene
  avhengige av den.
- Egen cache for utvidelsen (f.eks. i `globalStorageUri`): ville doblet logikken; kurs- og
  oppgavenavn er ikke elevdata, og cachen er allerede nøkkelsatt på Canvas-URL-en.
- Å beholde økten ved avbrudd: halvferdig økt uten «Ferdig»-vindu ville blitt liggende til
  holdet gikk ut; CLI-et sletter også ved Ctrl-C.
- En egen, mer aggressiv regel for «Slett alle nå» (f.eks. slette økter med hjerteslag
  eldre enn 60 s): bestillingen sier «via D4-reglene», og et vindu i hvilemodus kan ha et
  så gammelt hjerteslag. Visningen sier i stedet «lukket nylig, slettes automatisk innen
  ca. 3 min».
- `viewsWelcome` for «ikke satt opp»: teksten måtte stått i `package.json`, ikke i
  `src/strings.js`. I stedet en rad med knapp og `TreeView.message`.

## 2026-10-30 — D5, rettingsrunde: hold uten utløp, interne kommandoer bare i testmodus, sandkasse og testmiljø

**Beslutning** (etter testverifiserer og leveranse-kritiker; Lars beholdt alle valgene fra D5):
- **Hold uten utløp:** `nyOkt` holder økten uten tidsgrense til `apneOkt` eller `slipp`
  (D4 hadde høyst 30 min). Ellers kunne en kloning som sto stille, eller en modal som sto
  åpen lenge (T9b/T9c, «ingenting klonet»), få økten slettet under seg. Holdet finnes bare
  i hovedvinduets minne, så det forsvinner med vinduet. `apneOkt` slipper holdet også når
  stien er ugyldig, og gir `borte` (ikke et unntak) hvis økten forsvant under dialogene.
- **Sletting sjekkes:** ved avbrudd, «ingenting klonet» og avbrutt åpning vises «slettet»
  bare når slettingen lyktes; ellers «prøves igjen» (`vscDeleteFailed`), og ryddingen tar
  den senere (forlatt etter 180 s, eller som «slettes»-mappe).
- **Interne kommandoer:** `_tre`, `_treMelding`, `_logg`, `_git` og `_holdt` (det
  trevisningen viser, med elevnavn) registreres bare når `context.extensionMode` er
  `ExtensionMode.Test`, og «Klon» godtar en node-id som tekst bare der (ellers bare noden
  fra trevisningen; en ukjent eller gammel id gir `ugyldig`). Prøveriggen kjører en vanlig
  VS Code og får de samme funksjonene gjennom et andre argument til `activate`
  (`{ testkrok }`) fra driveren i samme pakke; VS Code sender aldri det argumentet, og
  ingenting av dette blir `exports`. D4s interne kommandoer (`_okt`, `_nyOkt`, `_apneOkt`,
  `_rydd`, `_tillitsSjekk`, `_tilstand`) gir ikke ut elevdata og er uendret.
- **Sandkasse:** i Flatpak (`FLATPAK_ID` eller `/.flatpak-info`) ser `pidAlive` ikke
  vertens prosesser, så en pågående CLI-økt ville sett død ut. Da rører «Slett alle økter
  nå» ikke `grading/`, og det står i bekreftelsen, resultatet og visningen. `SNAP` tas ikke
  med (Lars, 2026-10-30): VS Code som snap er «classic» og ser vertens PID-er.
- **Feilmeldinger:** feil fra Canvas merkes (`fraCanvas`) og vises som «Feil fra Canvas»;
  lokale feil (disk, git) som «Uventet feil» med feilkoden. Begge vaskes for tokenet.
- **QuickPick:** `vscode/src/velg.js` bruker `createQuickPick`, slik at standardvalget
  («trenger retting») er den aktive raden (`activeItems`); `picked` virker bare ved flervalg.
- **Ellers:** «Klon» på en oppgave henter innleveringene på nytt; `regelTilstand()` tikker
  klokka (tidshopp oppdages også fra T12); feil og «ikke satt opp» caches ikke i treet;
  oppsett og sletting av token laster treet på nytt.
- **Testmiljø:** alle VS Code-kjøringer (`minimum`, `bla`, `oktvindu`, uten tillit og
  riggen) startes med `--force-disable-user-env` (PATH fra testhjemmet, ikke fra
  login-skallet) og på Linux `--ozone-platform=x11`. `WAYLAND_DISPLAY` og
  `ELECTRON_OZONE_PLATFORM_HINT` fjernes (de arves ellers gjennom `xvfb-run`), og
  `.vscode-test.mjs`/`kjor-uten-tillit.mjs` nekter å starte på Linux uten `xvfb-run`
  (`XAUTHORITY` fra xvfb-run). Riggen fjerner `DISPLAY`, `WAYLAND_DISPLAY` og `XAUTHORITY`
  før den starter `xvfb-run`. Testhjemmet og riggen setter `XDG_CONFIG_HOME`, så
  kurscachen aldri havner i lærerens config-mappe. D5-testene har egen kjøring (`bla`),
  fordi `@vscode/test-cli` ikke kjører filene i én kjøring i alfabetisk rekkefølge og de
  deler `globalState` (T9c-flagget).

**Begrunnelse:** funnene fra testverifiserer og leveranse-kritiker 2026-10-30, tilsynets
T11 og T12. Tilsynet vurderer de interne kommandoene ved punkt b.

**Forkastede alternativer:**
- En tidtaker som fornyer det tidsbegrensede holdet: måtte stoppes nøyaktig ved åpning
  (ellers holdes økten etter «Ferdig», feilen fra D4-prøvekjøringen); hold uten utløp er
  enklere og har samme virkning.
- Å fjerne elevdata fra `_tre` og beholde kommandoen for alle: testene trenger labels og
  tooltip for T-A-vaktposten og navigasjonen.
- Et miljøvariabel-flagg for riggen: kunne vært satt utenfra i en vanlig installasjon;
  `testkrok` krever kode i samme pakke.

## 2026-10-30 — D5, tredje rettingsrunde

- **`_nyOkt` holder nå uten utløp.** Den interne kommandoen `canvasClone._nyOkt` (D4, registrert
  også i vanlige installasjoner) bruker `hoved.nyOkt`, som etter forrige runde holder økten
  uten tidsgrense. Konsekvens: en tom økt laget med `_nyOkt` og aldri åpnet eller sluppet,
  holdes (hjerteslag fra hovedvinduet) til hovedvinduet lukkes; deretter slettes den etter den
  vanlige regelen (forlatt etter 180 s). Ingen elevdata følger med en slik økt. Tilsynet tar
  de interne kommandoene ved punkt b.
- **Feil ved åpning:** kaster `vscode.openFolder`, får læreren en egen melding
  (`vscSessionOpenFailed`), ikke «finnes ikke lenger» (`vscSessionGone`, bare for `borte`).
- **«Oppdater»** tvinger fersk henting til den har lyktes; feiler den, prøver neste utviding
  Canvas igjen i stedet for å bruke cachen.
- **«Klon» på en oppgave** henter innleveringene på nytt og bytter ut barna i treet (nye id-er;
  de gamle radene gir `ugyldig`). Oppgavens eget tall «klare til retting» kommer fra
  kurslisten og oppdateres først ved «Oppdater».
- **«Klon» med id som tekst** avgjøres av den rene funksjonen `nodeFraArg` (`bla.mjs`): bare i
  testmodus, og bare for en node som fortsatt er gjeldende.
- **Sletting i testene:** også testene sletter bare via `safeRemove` (de rene testene i
  `tmpdir()`). VS Code-testene (CJS, kan ikke laste `src/storage.js`) flytter i stedet en økt
  ut av øktroten til testhjemmet, som tømmes med `safeRemove` ved neste kjøring.
