# Canvas Clone for VS Code

**Under utvikling — ikke del denne utvidelsen ennå.** Det finnes ingen
utgivelse (release) ennå, og flere ting er ikke testet (se
[Kjente begrensninger](#kjente-begrensninger)).

Canvas Clone er en VS Code-utvidelse for lærere. Du velger kurs og oppgave i
Canvas, kloner elevenes GitHub-repo til en midlertidig mappe (en **økt**) som
åpnes i et eget vindu, kan sette karakter på én innlevering om gangen, og kan
lese og svare i kommentartråden fra Canvas. Når
du er ferdig, slettes økten. Utvidelsen hører til CLI-et `canvas-clone` i samme
repo, men kan brukes uten det.

## Innhold

- [Krav](#krav)
- [Installasjon fra .vsix](#installasjon-fra-vsix)
- [Kommandoer](#kommandoer)
- [Oppsett](#oppsett)
- [To tokens: CLI og utvidelse](#to-tokens-cli-og-utvidelse)
- [Linux uten nøkkelring (keyring)](#linux-uten-nøkkelring-keyring)
- [Bla og klone](#bla-og-klone)
- [Sett karakter](#sett-karakter)
- [Elevens GitHub Pages](#elevens-github-pages)
- [Kommentarer fra Canvas](#kommentarer-fra-canvas)
- [Økter: hvor elevrepoene ligger, og når de slettes](#økter-hvor-elevrepoene-ligger-og-når-de-slettes)
- [Rydde opp selv](#rydde-opp-selv)
- [Tillit (Workspace Trust)](#tillit-workspace-trust)
- [KI-assistenter](#ki-assistenter)
- [Personvern og nettverk](#personvern-og-nettverk)
- [Kjente begrensninger](#kjente-begrensninger)

## Krav

- VS Code 1.100 eller nyere.
- `git` installert. Finnes ikke git, sier utvidelsen fra når du prøver å klone.
- En Canvas-konto med tilgang til kursene, og et API-token (se «Oppsett»).

## Installasjon fra .vsix

Utvidelsen ligger ikke i VS Code Marketplace. Den skal deles som en
`.vsix`-fil via GitHub Releases for prosjektet, **bare til lærere på egen
skole**. Del ikke fila videre. **Det finnes ingen utgivelse ennå**, så
filnavnet under er en plassholder: `canvas-clone-vscode-X.Y.Z.vsix`.

**1. Sjekk SHA-256-summen før du installerer.** Sammen med `.vsix`-fila
følger en fil med samme navn og `.sha256` til slutt, for eksempel
`canvas-clone-vscode-X.Y.Z.vsix.sha256`. Den inneholder summen og filnavnet.
Last ned begge til samme mappe. Er summen ikke nøyaktig lik, ikke installer.

Linux (sjekker fila automatisk, skal skrive `OK`):

```sh
sha256sum -c canvas-clone-vscode-X.Y.Z.vsix.sha256
```

macOS (samme sjekk, skal skrive `OK`):

```sh
shasum -a 256 -c canvas-clone-vscode-X.Y.Z.vsix.sha256
```

Windows (PowerShell): regn ut summen og sammenlign den med første ord i
`.sha256`-fila (store og små bokstaver spiller ingen rolle):

```powershell
Get-FileHash .\canvas-clone-vscode-X.Y.Z.vsix -Algorithm SHA256
Get-Content .\canvas-clone-vscode-X.Y.Z.vsix.sha256
```

**2. Installer**, på en av to måter:

- I terminalen: `code --install-extension canvas-clone-vscode-X.Y.Z.vsix`
- I VS Code: åpne Utvidelser (Extensions), trykk «…» øverst i visningen og
  velg **Install from VSIX…**, og velg fila.

**Avinstallere:** kjør først **Canvas Clone: Slett token og Canvas-URL** (se
[To tokens](#to-tokens-cli-og-utvidelse)), så avinstaller utvidelsen i
Utvidelser-visningen eller med
`code --uninstall-extension krola1.canvas-clone-vscode`.

## Kommandoer

Åpne kommandopaletten (Ctrl+Shift+P, på macOS Cmd+Shift+P) og skriv
«Canvas Clone»:

- **Canvas Clone: Oppsett (Canvas-URL og token)** — spør om Canvas-URL og
  API-token, sjekker dem mot Canvas og lagrer dem.
- **Canvas Clone: Slett token og Canvas-URL** — fjerner begge fra VS Code.
- **Canvas Clone: Ferdig med økten (lukk og slett)** — bare i øktvinduet, også
  som knappen «Ferdig med økten» nederst til venstre. Se «Økter».
- **Canvas Clone: Oppdater fra Canvas** — henter kurs og oppgaver på nytt (også
  knappen ↻ i visningen «Canvas Clone»).
- **Canvas Clone: Klon på tvers av kurs …** — se «Bla og klone».
- **Klon …**, **Sett karakter …** og **Åpne elevens GitHub Pages** — bare på
  en rad i visningen «Canvas Clone» (knapp eller høyreklikk), ikke i
  kommandopaletten. Se «Bla og klone», «Sett karakter» og «Elevens GitHub
  Pages».
- **Åpne oppgaven i Canvas** — bare på en oppgave i visningen «Canvas Clone»
  (knapp eller høyreklikk), og som knapp i karakterpanelet. Åpner oppgavesiden
  i Canvas i nettleseren, bygget av Canvas-URL-en fra oppsettet og oppgavens
  nummer, aldri en lenke fra Canvas eller oppgaveteksten.
- **Åpne i karakterpanelet** — bare som knapp på raden til en elev under
  «Ikke levert (N)» (ikke ved høyreklikk og ikke i kommandopaletten). Se
  «Kommentarer fra Canvas».
- **Canvas Clone: Vis hva som ble liggende** og **Canvas Clone: Slett alle
  økter nå** — se «Rydde opp selv».
- **Canvas Clone: Om** — viser versjonen.

Kommandotitlene er på norsk. Meldingene følger språket i VS Code: norsk hvis
VS Code er på norsk (nb, nn eller no), ellers engelsk.

## Oppsett

1. Lag et API-token i Canvas: **Account → Settings → New Access Token**.
   **Gi tokenet en utløpsdato**, for eksempel slutten av semesteret, så slutter
   det å virke av seg selv.
2. Kjør **Canvas Clone: Oppsett (Canvas-URL og token)**.
3. Oppgi Canvas-URL-en, for eksempel `https://din-skole.instructure.com`.
   Bare `https://` godtas.
4. Lim inn tokenet. Det vises ikke mens du skriver.
5. Utvidelsen spør Canvas hvem tokenet tilhører. Bare hvis det lykkes, lagres
   noe. Ved feil (feil URL, ugyldig token, ingen nettverk) lagres ingenting,
   og du får en melding om hva som var galt. Tokenet vises eller logges aldri.

Hvor det lagres:

- **Tokenet** ligger bare i VS Codes hemmelighetslager (SecretStorage), som
  bruker operativsystemets nøkkelring eller kryptering: DPAPI på Windows,
  macOS-nøkkelringen eller Secret Service/KWallet på Linux.
- **Canvas-URL-en** ligger i utvidelsens egen tilstand i VS Code, ikke i
  `settings.json`. Utvidelsen har ingen innstillinger, så en mappe du åpner
  (for eksempel et elevrepo med `.vscode/settings.json`) kan ikke endre den.
  Utvidelsen ber ikke Settings Sync om å synkronisere den.

## To tokens: CLI og utvidelse

CLI-et (`canvas-clone` i terminalen) og VS Code-utvidelsen har **hvert sitt
token**. Utvidelsen leser aldri CLI-ets config-fil eller token, og CLI-et leser
ikke utvidelsens. Bruker du begge, lag to tokens i Canvas med hvert sitt navn
(«canvas-clone CLI», «canvas-clone VS Code»), og gi begge en utløpsdato. Da
kan du trekke tilbake det ene uten å røre det andre.

| | Hvor tokenet ligger | Slik sletter du det på maskinen |
|---|---|---|
| **Utvidelsen** | VS Codes hemmelighetslager (se «Oppsett») | Kjør **Canvas Clone: Slett token og Canvas-URL** |
| **CLI-et** | `config.json` i CLI-ets config-mappe: `~/.config/canvas-clone/` (Linux; på alle OS `$XDG_CONFIG_HOME/canvas-clone/` hvis den er satt), `~/Library/Application Support/canvas-clone/` (macOS), `%APPDATA%\canvas-clone\` (Windows) | Slett `config.json` i den mappen (CLI-et har ingen egen slettekommando) |

**Slett også tokenet i Canvas** (Account → Settings → Approved
Integrations), så kan det aldri brukes igjen, heller ikke fra en kopi. Det
gjelder begge tokens.

I samme config-mappe som CLI-ets `config.json` ligger `cache.json` med kurs-
og oppgavenavn (ingen elevdata). Den brukes av både CLI-et og utvidelsen (se
«Bla og klone») og kan trygt slettes.

## Linux uten nøkkelring (keyring)

Finner ikke VS Code noen nøkkelring, lagres tokenet **bare i minnet**:

- Det er borte når VS Code lukkes, og etter det vi kan se av VS Codes
  kildekode virker det bare i vinduet der du la det inn.
- Neste gang VS Code startes, sier utvidelsen fra om at tokenet mangler
  («sannsynligvis fordi systemet ikke har nøkkelring»). Da må du kjøre
  oppsettet på nytt.
- VS Code viser selv en melding når dette skjer. Har VS Code ikke funnet noe
  skrivebordsmiljø med nøkkelring, kommer det en dialog med knappen
  **«Use weaker encryption»**. Oppsettet venter til du har svart på den.

**Velg ikke «Use weaker encryption» på en delt maskin eller en maskin andre har
tilgang til.** Da lagres tokenet på disk med en nøkkel som er lik for alle
(«obfuskering, ikke kryptering», ifølge VS Code). Det samme gjelder hvis
`"password-store": "basic"` står i `~/.vscode/argv.json`. Bedre løsninger:

- Bruk en nøkkelring (GNOME Keyring, KWallet eller en annen Secret Service), og
  start VS Code fra en økt der den er låst opp.
- Eller lev med at tokenet bare ligger i minnet og legg det inn på nytt når du
  trenger det.

Se også VS Codes egen beskrivelse:
<https://code.visualstudio.com/docs/configure/settings-sync> (avsnittet om feilsøking av keychain).

## Bla og klone

Visningen **Canvas Clone** har sitt eget ikon i aktivitetslinjen (Activity Bar,
ikonraden helt til venstre): to rammer oppå hverandre med en hake. Trykk på det
for å åpne visningen. Den finnes i vanlige vinduer, ikke i øktvinduet (der er
ikonet borte). Den viser kurs → fagretning → modul → oppgave →
innleveringer, med antall «klare til retting» på hvert nivå. Fagretning og
modul gjettes fra oppgavenavnet, på samme måte som i CLI-et; oppgaver uten
treff ligger under «(Ukategorisert)». Uten oppsett viser visningen en knapp
til oppsettet.

Kurslisten caches i 15 minutter i samme cachefil som CLI-et bruker
(`cache.json` i CLI-ets config-mappe, bare kurs- og oppgavenavn).
**Oppdater fra Canvas** henter ferske data.

**Klon** (knappen ved hver rad, eller høyreklikk):

- **På en innlevering:** bare den.
- **På en oppgave:** velg «Kun de som trenger retting» (standard), «Alle
  innleverte» eller «Velg selv», som i CLI-et.
- **På et kurs, en fagretning eller en modul (bulk):** velg filter, «trenger
  retting» (standard) eller «alle innleverte». Innleveringene hentes for alle
  oppgavene i lista.
- **Klon på tvers av kurs** (🌐 øverst i visningen): velg flere kurs, så alle
  oppgaver, en fagretning eller en modul, så «alle i denne listen» eller én
  oppgave.

Skal det klones **20 repo eller flere**, får du en bekreftelse med antallet
først. Kloningen vises med fremdrift og kan avbrytes; avbryter du, slettes
hele økten. Etterpå får du en oppsummering (klonet, uten lenke, uten tilgang,
klone-feil), og økten åpnes i øktvinduet (se «Økter»). Ble ingenting klonet,
spør utvidelsen om du vil åpne økten likevel (for å se `uten_lenke.txt`);
ellers slettes den.

Mappene i økten er de samme som i CLI-et: `<økt>/<oppgave-id>/<eier>_<repo>/`,
eller `<økt>/<kurs>/<oppgave-id>/<eier>_<repo>/` på tvers av kurs. Innleveringer
uten vellykket kloning står i `uten_lenke.txt` i oppgavemappen, med grunn
(«ingen lenke funnet», «uten tilgang» for private, slettede eller feilstavede
repo, og «klone-feil» for nettverk, disk eller git; git sin egen feilmelding
tas ikke med). En mappe rett under økten begynner aldri med punktum (et kurs
som heter `.vscode`, får mappen `_.vscode`).

Kloningen bruker `git` uten din GitHub-pålogging: ingen credential-hjelpere,
ingen askpass, bare `https`, som i CLI-et. Innleveringsteksten fra Canvas vises
aldri, bare lenken som er funnet i den. Utvidelsens logg (Output → Canvas
Clone) inneholder bare øktnavn og antall, aldri navn eller repo.

## Sett karakter

> **Advarsel:** karaktersettingen fra utvidelsen er ennå ikke testet mot ekte
> Canvas, bare mot en falsk Canvas i testene. Ikke bruk den på ekte
> elevkarakterer før dette er gjort. CLI-et (`canvas-clone`) kan brukes i
> mellomtiden.

Høyreklikk en elev under en oppgave i visningen «Canvas Clone» (eller trykk
blyant-ikonet) og velg **Sett karakter …**. Et panel viser kurs, oppgave,
«Canvas-navn (GitHub: x)», status og nåværende karakter, med felt for ny
karakter (høyst 50 tegn) og tilbakemelding (høyst 8000 tegn). Quiz og
innleveringer som ikke er levert, kan ikke rettes her.

Når du trykker **Send til Canvas …**:

1. Innleveringen hentes på nytt fra Canvas. Har eleven levert en ny
   GitHub-lenke siden panelet ble vist, eller er innleveringen borte, sendes
   ingenting; trykk «Oppdater» og åpne eleven på nytt fra visningen.
2. En bekreftelse (modal dialog) viser elev, oppgave, kurs, karakter og
   tilbakemelding (de første 500 tegnene). Har eleven allerede en karakter i
   Canvas, står «Nåværende karakter: …» øverst, slik den er i Canvas akkurat nå
   (fra innleveringen som ble hentet i steg 1). Er karakteren endret i Canvas
   siden panelet ble vist, står det i tillegg en advarsel nederst om at den
   overskrives. **Avbryt**
   eller Escape sender ingenting.
3. Har du byttet elev eller lukket panelet mens bekreftelsen var åpen, sendes
   ingenting.
4. Karakteren sendes. Panelet viser den nye karakteren og tømmer skjemaet; ved
   feil står feilen i panelet, og det du skrev, blir stående.

Det du har skrevet, lagres ikke: bytter du fane eller elev, er utkastet borte.
Etter sendingen viser eleven i visningen «Canvas Clone» den nye karakteren
(«vurdert (nåværende: A)»). Det skjer også om du har byttet elev mens den ble
sendt. Tallene «klare til retting» oppdateres først når du trykker «Oppdater».
Utvidelsens logg får bare linjen «karakter sendt», aldri navn, karakter eller
tilbakemelding.

## Elevens GitHub Pages

Har eleven lagt ut oppgaven med GitHub Pages, kan du åpne siden i nettleseren
rett fra utvidelsen. Lenken er `https://<eier>.github.io/<repo>/` for repoet i
innleveringen (repoet `ola/ola.github.io` gir `https://ola.github.io/`).

- **Når sjekkes det?** Bare når du velger en elev i visningen «Canvas Clone»,
  eller åpner eleven i karakterpanelet. Da spør utvidelsen GitHub én gang om
  repoet har Pages slått på (uten din GitHub-pålogging). Hele oppgaven sjekkes
  ikke.
- **I visningen** står det `· Pages` etter statusen når GitHub har bekreftet
  at siden finnes, og `· Pages (ikke sjekket)` når det ikke er sjekket ennå,
  eller GitHub ikke svarte (se under). Da er lenken bare gjettet og kan gi
  «404». Sier GitHub at Pages ikke er slått på, vises ingen lenke. Hele
  adressen står i verktøytipset (hold musen over raden). Trykk ikonet ↗ på
  raden, eller høyreklikk og velg **Åpne elevens GitHub Pages**.
- **I karakterpanelet** står knappen **Åpne elevens GitHub Pages** under
  nåværende karakter. Knappen åpner alltid siden til eleven panelet viser.
- **Oppdater fra Canvas** glemmer det GitHub har svart, så eleven sjekkes på
  nytt neste gang du velger eleven. Svarene lagres ikke på disk.
- **Grense hos GitHub:** uten pålogging tillater GitHub omtrent 60 slike
  spørsmål i timen per IP-adresse. På skolenettet deler alle på samme
  IP-adresse, så grensen kan være brukt opp av andre. Er den nådd, viser
  utvidelsen `(ikke sjekket)` og spør ikke GitHub igjen før grensen er
  nullstilt (som oftest innen en time, også om du trykker «Oppdater»).

> **Siden er elevens egen.** Eleven bestemmer hva som står der, og nettstedet
> kan se IP-adressen din når du åpner det. **Logg aldri inn** på noe via
> lenker fra en elevside, og skriv ikke inn passord eller annet der.

## Kommentarer fra Canvas

> **Advarsel:** kommentartråden og «Svar» er ennå ikke testet mot ekte Canvas,
> bare mot en falsk Canvas i testene. Prøv først på en testelev.

Kommentarene eleven og lærerne har skrevet på innleveringen i Canvas (også på
tvers av forsøk) vises i karakterpanelet, så du slipper å åpne Canvas for å se
om eleven har rettet noe.

- **I visningen «Canvas Clone»** står antallet etter statusen, for eksempel
  `· 2 kommentarer`, og `· nytt` når den siste meldingen er fra eleven. Har en
  annen lærer svart sist, regnes tråden som besvart. Alle elever som **ikke har
  levert** (Canvas har ingen innleveringstid, også om eleven har fått karakter
  uten å levere), står i en sammenfoldet gruppe **Ikke levert (N)** nederst under
  oppgaven, med `ikke levert`, `ikke levert · fritatt` eller
  `ikke levert · <karakter>`. Quiz har ingen slik gruppe. Merkene oppdateres bare når du trykker
  **Oppdater** (eller kloner oppgaven), ikke av seg selv.
- **I karakterpanelet** står tråden under skjemaet, med navn, tid og «forsøk
  N». Vedlegg vises bare med filnavn, og lyd- og videokommentarer som
  «(lydkommentar)»/«(videokommentar)». Lenker i kommentarteksten er ren tekst.
  Knappen **Åpne i Canvas** åpner innleveringssiden til eleven i nettleseren
  (der ligger vedleggene).
- **Ikke levert:** trykk knappen **Åpne i karakterpanelet** på raden. Panelet viser
  tråden, men karakter og tilbakemelding er låst: her kan du bare lese og
  svare.
- **Svar:** skriv i feltet «Svar i kommentartråden» og trykk **Svar …**.
  Innleveringen hentes på nytt fra Canvas, og en bekreftelse viser elevens
  Canvas-navn (og GitHub), om eleven ikke har levert, oppgave, kurs og
  starten av svaret. Har eleven levert en annen GitHub-lenke siden panelet ble
  vist, står det i bekreftelsen, men svaret sendes likevel. Har du byttet elev
  eller lukket panelet mens bekreftelsen var åpen, sendes ingenting. Etter
  sendingen tømmes bare svarfeltet; det du har skrevet i karakterskjemaet,
  blir stående.
- **Svaret blir synlig for eleven** i Canvas og **kan ikke redigeres eller
  slettes fra utvidelsen**. Publiserer kurset karakterer manuelt, kan svaret
  være skjult for eleven til karakterene publiseres.
- **Feil ved sending:** svarer Canvas med en feil («HTTP nnn»), er svaret ikke
  sendt. Ved nettverksfeil vet ikke utvidelsen om Canvas fikk det: da står det
  «kan være sendt – Oppdater og sjekk tråden før du sender igjen».
- **Kunne ikke kommentarene hentes,** henter utvidelsen innleveringene på nytt
  uten kommentarer, og oppgaven får raden «Kommentarer ble ikke hentet –
  Oppdater for å prøve igjen». Ved ugyldig token eller manglende tilgang (HTTP
  401/403) prøves det ikke på nytt.
- **Quiz:** ingen kommentarer, ingen merker og ingen rader for elever som ikke
  har levert.

> **Kommentarene kan inneholde personopplysninger,** for eksempel om helse
> eller fravær. **Ikke vis panelet eller visningen ved skjermdeling eller på
> projektor:** også `ikke levert` og antall kommentarer i visningen sier noe om
> eleven. Trådene holdes bare i minnet i VS Code-vinduet, lagres ikke på disk,
> og glemmes ved **Oppdater** og når vinduet lukkes.

## Økter: hvor elevrepoene ligger, og når de slettes

Elevrepoene klones til en **økt**, en egen mappe per gang:
`~/canvas-clone/vscode/<dato>-<klokkeslett>-<tilfeldige tegn>/` (på Windows
`C:\Users\<deg>\canvas-clone\vscode\...`). CLI-et bruker
`~/canvas-clone/grading/`, så de to ser aldri hverandres økter. Et navn brukes
aldri om igjen.

Økten åpnes i **et eget VS Code-vindu, øktvinduet, uten tillit** (Restricted
Mode). Første gang får du en advarsel om hva du ikke skal gjøre der.
Øktvinduet havner ikke i «Åpne nylig» (Open Recent).

**Ferdig:** Trykk «Ferdig med økten» nederst i øktvinduet (eller kjør
kommandoen). Har du ulagrede filer, får du en advarsel først: lukk dem (VS Code
spør om hver fil), ellers avsluttes ikke økten. Så lukkes øktvinduet, og
vinduet du startet fra (hovedvinduet) sletter økten noen sekunder etterpå.

**Hva som slettes da:**

- hele øktmappen med elevrepoene
- VS Codes egen tilstand for øktvinduet (`workspaceStorage/<id>/` under VS Codes
  brukermappe), men bare hvis den peker på akkurat denne økten
- økten fjernes fra «Åpne nylig» (i tillegg til at den aldri legges der)

Lager VS Code øktmappen på nytt etter slettingen (f.eks. fordi en fil ble
lagret i siste øyeblikk), slettes den også, etter ca. 3–4 minutter.

**Hvis du ikke trykker «Ferdig»:**

- Lukker du øktvinduet med krysset, eller krasjer det, slettes økten av
  hovedvinduet etter ca. 3–4 minutter (øktvinduet har da sluttet å gi lyd fra
  seg).
- Lukker du hele VS Code, er økten slutt. Den slettes neste gang VS Code startes
  med et vanlig vindu. Gjenoppretter VS Code øktvinduet ved oppstart, lukker det
  seg selv (unntak: startes VS Code igjen innen ca. ett minutt, fortsetter
  økten som før).
- Er det bare øktvinduet som er åpent (ingen andre VS Code-vinduer), slettes
  ingenting før et vanlig vindu åpnes igjen.
- Hvilemodus på maskinen gjør ingenting med en åpen økt: hovedvinduet venter
  litt etter at maskinen har våknet, slik at øktvinduet rekker å melde seg.

**Hot exit (ulagrede endringer):** Lukker du hele VS Code mens øktvinduet har
ulagrede filer, kan VS Code ta vare på dem i sin egen sikkerhetskopi
(`Backups/` i VS Codes brukermappe) og vise dem igjen neste gang. Utvidelsen
kan ikke slå av dette fra øktmappen, og den sletter aldri VS Codes
sikkerhetskopier. Bruk «Ferdig med økten», så får du advarselen om ulagrede
filer i stedet.

**Lokal historikk (Local History) er slått av i øktmappen.** Utvidelsen lager
`.vscode/settings.json` i økten (skjult i Utforskeren) med
`"workbench.localHistory.enabled": false`. Vanligvis lagrer VS Code en kopi av
hver fil du lagrer, under `User/History/` i brukermappen, og de kopiene blir
liggende etter at økten er slettet. I øktmappen skjer ikke det. Det betyr også
at du ikke kan bruke Tidslinje (Timeline) eller Local History til å hente
fram en tidligere lagret versjon av en elevfil i øktvinduet. Innstillingen
gjelder bare øktmappen, ikke andre mapper du åpner.

**Dette kan bli liggende igjen:**

- Sikkerhetskopier fra hot exit (over).
- `workspaceStorage/<id>/` (VS Codes tilstand for øktvinduet, blant annet
  stien til økten og hvilke filer som var åpne) hvis øktvinduet brukte en
  annen brukermappe (`--user-data-dir`) enn hovedvinduet. Ellers slettes den
  også for økter som ble avsluttet uten «Ferdig» (krasj, krysset, VS Code
  lukket), innen et par minutter etter at økten selv er slettet.
- Gav du øktvinduet tillit, står stien i VS Codes liste over betrodde mapper.
  Fjern den under **Workspaces: Manage Workspace Trust** (se «Tillit»).
- VS Codes egne logger (`logs/` i brukermappen) kan nevne stien til økten.
- Er `~/canvas-clone` eller `~/canvas-clone/vscode` en symlenke, slettes
  gamle økter ikke automatisk (bare økter du avslutter med «Ferdig»). Du får en
  advarsel.

## Rydde opp selv

- **Vis hva som ble liggende** viser øktene under `~/canvas-clone/vscode/` og
  CLI-ets `~/canvas-clone/grading/`, med status (åpen i et vindu, lukket nylig,
  kan slettes nå …). Bare øktnavn, ikke innholdet.
- **Slett alle økter nå** sletter, etter en bekreftelse, det som kan slettes i
  begge: VS Code-økter som er avsluttet eller forlatt (samme regel som den
  automatiske ryddingen), og CLI-økter der CLI-et ikke lenger kjører. Økter som
  er åpne i et vindu, og CLI-kjøringer som pågår, røres aldri.
  Kjører VS Code i en sandkasse (Flatpak), røres ikke
  `~/canvas-clone/grading/` herfra, fordi utvidelsen da ikke kan se om CLI-et
  kjører. Kjør `canvas-clone` i terminalen for å rydde der.

## Tillit (Workspace Trust)

Øktvinduet åpnes uten tillit (Restricted Mode). Da kjører ikke VS Code tasks,
debug eller terminal fra elevrepoene uten å spørre deg først, og utvidelser
som ikke støtter Restricted Mode, er slått av. Du ser at vinduet er uten
tillit på «Restricted Mode» i VS Code-vinduet.

- **Ikke trykk «Trust»** i øktvinduet, heller ikke når VS Code spør fra en task,
  debug eller terminalen. I et betrodd vindu kan VS Code og andre utvidelser
  kjøre kode fra elevrepoene.
- **Gi aldri tillit til `~/canvas-clone`, hjemmemappen eller en annen mappe over
  øktene.** Tillit arves av alle undermapper, også nye økter. Har du for
  eksempel en gang gitt tillit til hele hjemmemappen, blir hvert øktvindu
  betrodd. Er øktvinduet betrodd likevel, viser utvidelsen en advarsel med
  «Lukk økten» som standardvalg.
- **Se og fjern tillit:** åpne kommandopaletten og kjør **Workspaces: Manage
  Workspace Trust**. Der står mappene du har gitt tillit. Fjern hjemmemappen,
  `~/canvas-clone` og alt under eller over den fra lista. En betrodd mappe over
  økten kan ikke overstyres for økten alene; den må fjernes.
- Har du slått av Workspace Trust (`security.workspace.trust.enabled`), må du
  bekrefte før en økt åpnes.
- Ikke installer utvidelser som et elevrepo anbefaler, og ikke åpne et elevrepo
  som egen mappe.

## KI-assistenter

Elevkode og elevnavn (i mappenavn, `uten_lenke.txt` og panelet) er
personopplysninger. Sender en KI-assistent dem til en tjeneste utenfor skolen,
er det en overføring av personopplysninger som skolen må ha godkjent.

- **Ikke la KI-assistenter lese øktmappen eller elevrepoene** (GitHub Copilot,
  Claude Code, chat i VS Code eller andre), med mindre skolen har godkjent
  det.
- **Slå dem av eller la være å bruke dem i øktvinduet.** Ikke spør en chat om
  elevkode, og ikke start en KI-agent i terminalen fra hjemmemappen eller
  `~/canvas-clone/`, der den kan lese alle øktene.
- **Tillegg (extensions) i hovedprofilen kjører også i øktvinduet.** Øktvinduet
  bruker de samme tilleggene som vinduet du startet fra. I Restricted Mode er
  tillegg som ikke støtter det, slått av, og ifølge VS Code er agenter av. Men
  tillegg som støtter Restricted Mode helt eller delvis, kjører, og noen
  KI-funksjoner kan derfor fortsatt virke. Hvilke det gjelder, avhenger av
  tillegget; det har vi ikke testet.
- Elevrepoer kan inneholde instruksjoner til KI-agenter (for eksempel
  `AGENTS.md` eller `.github/copilot-instructions.md`). En agent som leser dem,
  kan bli lurt til å gjøre noe annet enn du ba om.

**Hva utvidelsen gjør, og ikke gjør:** den setter
`"chat.useNestedAgentsMdFiles": false` i øktens `.vscode/settings.json`. Det
hindrer bare VS Codes egen chat i å lese `AGENTS.md` fra undermapper (elevrepoene)
hvis vinduet blir betrodd, og det er allerede av som standard. Utvidelsen kan
**ikke** slå av Copilot, Claude Code eller andre KI-tillegg. Det må du gjøre
selv.

## Personvern og nettverk

- **Ingen telemetri fra utvidelsen.** VS Code har sin egen telemetri, som
  styres av VS Code-innstillingen `telemetry.telemetryLevel`, ikke av denne
  utvidelsen.
- **Nettkall** går bare til Canvas-URL-en du har oppgitt (API-kall med
  tokenet), `git clone` mot github.com (bare `https`), og uautentiserte `GET`
  mot `api.github.com/repos/*` for å sjekke om eleven har GitHub Pages (se
  «Elevens GitHub Pages»). Det siste sender IP-adressen din og elevens
  GitHub-navn og repo til GitHub, uten token og uten din GitHub-pålogging.
  Svaret holdes bare i minnet. Kommentartråden hentes fra de samme
  Canvas-endepunktene som før (innleveringene for en oppgave, med
  `include[]=submission_comments`), og «Svar» bruker samme endepunkt som
  karaktersettingen. Ingen nye endepunkter, ingen nedlasting av vedlegg.
- **Åpne i Canvas** åpner innleveringssiden i nettleseren din
  (`<Canvas-URL>/courses/…/assignments/…/submissions/…`); der er du logget inn
  med din vanlige Canvas-pålogging, ikke tokenet.
- **Kommentarer** (tekst, navn, tid, filnavn på vedlegg) vises bare i
  karakterpanelet, holdes bare i minnet og skrives aldri til disk eller logg.
  Lenker til vedlegg fra Canvas brukes aldri.
- **Elevens GitHub Pages** åpnes i nettleseren din. Siden er elevstyrt og kan
  se IP-adressen din; logg aldri inn via lenker derfra.
- **Innleveringsteksten** fra Canvas vises aldri, bare GitHub-lenken som er
  funnet i den.
- **Utvidelsens logg** (Output → Canvas Clone) har bare øktnavn, antall,
  «karakter sendt» og «svar sendt», aldri navn, repo, karakter, tilbakemelding
  eller kommentarer.
- **Lokal historikk** er av i øktmappen, og økten slettes når du er ferdig (se
  «Økter»). Se også «Dette kan bli liggende igjen» der.
- **Sikkerhetskopier og sky-synk:** tar du sikkerhetskopi av hjemmemappen
  (OneDrive, Dropbox, Time Machine o.l.) mens en økt pågår, kan kopier av
  elevrepoene havne der. Vurder å utelate `~/canvas-clone/`.

## Kjente begrensninger

Utvidelsen er testet automatisk på Linux mot VS Code 1.100.0, med en falsk
Canvas og falsk git. Dette er **ikke** gjort ennå:

- **Ikke testet mot ekte Canvas.** Verken bla og klone eller karaktersetting
  er prøvd mot en ekte Canvas-instans. Karaktersetting mot ekte Canvas (riktig
  elev, karakter og tilbakemelding i SpeedGrader) må testes før utvidelsen
  deles.
- **Ikke testet på Windows eller macOS.** Det gjelder blant annet sletting av
  økter, at `git` blir funnet, og at «Avbryt» under kloning faktisk stopper
  kloningen på Windows.
- **Ikke testet med ekte nøkkelring** på noe operativsystem (testene lagrer
  tokenet bare i minnet), og heller ikke at tokenet overlever en omstart.
- **Kommentartråden** er ikke testet mot ekte Canvas: at tråden og ikke-leverte
  elever kommer med, at svaret havner hos riktig elev, at et svar til en elev
  som ikke har levert ikke endrer innleveringen, og om vedlegg kan åpnes uten
  innlogging. **Grupper** (gruppeinnleveringer), **redigering og sletting** av
  kommentarer og **filvedlegg i svar** støttes ikke. For **quiz** hentes og
  vises ingen kommentarer, og elever som ikke har levert vises ikke. Fagfellevurdering regnes
  ikke som «fra eleven». To elever som ikke har levert, med likt Canvas-navn og
  uten GitHub-lenke, kan ikke skilles i visningen (navnet vises uten
  tillegg).
- **Ikke testet med ekte klikk** i karakterpanelet, i bekreftelsesdialogene
  eller på «Avbryt» under kloning. Testene sender meldingene direkte.
- **GitHub Pages-lenken** er ikke testet mot ekte GitHub fra utvidelsen
  (testene bruker en falsk GitHub), heller ikke at nettleseren faktisk åpnes,
  at det å velge en elev med musa starter sjekken, eller hva som skjer når
  grensen på 60 i timen er nådd.
- **Ikke testet** med ekte hvilemodus, med VS Code som Flatpak, eller med stor
  bulk (100+ repo) mot ekte Canvas og GitHub.
- **Automatiske tester** kjører på Linux, Windows og macOS (CI) ved hver
  endring, med falsk Canvas og falsk git. På Windows hoppes testene av selve
  kloningen over.
- Fagretning og modul er gjettet fra oppgavenavnet, som i CLI-et.
