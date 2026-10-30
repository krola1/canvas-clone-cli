# Canvas Clone for VS Code

**Under utvikling — ikke del denne utvidelsen ennå.**

Dette er en tidlig versjon av en VS Code-utvidelse for canvas-clone (CLI-et i
samme repo). Den kan settes opp med Canvas-URL og token, bla i kurs og
oppgaver, og klone elevenes repo til en økt som åpnes i et eget vindu (se
«Bla og klone» og «Økter» under). Å sette karakter kommer senere. Full
bruksbeskrivelse kommer før første deling.

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
- **Canvas Clone: Vis hva som ble liggende** og **Canvas Clone: Slett alle
  økter nå** — se «Rydde opp selv».
- **Canvas Clone: Om** — viser versjonen.

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

## To separate tokens: CLI og utvidelse

CLI-et (`canvas-clone` i terminalen) og VS Code-utvidelsen har **hvert sitt
token**. Utvidelsen leser aldri CLI-ets config-fil eller token, og CLI-et leser
ikke utvidelsens. Bruker du begge, lag gjerne to tokens i Canvas med hvert sitt
navn («canvas-clone CLI», «canvas-clone VS Code»), så kan du trekke tilbake det
ene uten å røre det andre.

## Slette tokenet

Kjør **Canvas Clone: Slett token og Canvas-URL**. Det fjerner tokenet og URL-en
fra VS Code. **Slett også tokenet i Canvas** (Account → Settings → Approved
Integrations), så kan det aldri brukes igjen, heller ikke fra en kopi.

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

Visningen **Canvas Clone** ligger i Utforskeren (Explorer) i vanlige vinduer,
ikke i øktvinduet. Den viser kurs → fagretning → modul → oppgave →
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

Kloningen bruker `git` (finnes ikke git, sier utvidelsen fra) uten din
GitHub-pålogging: ingen credential-hjelpere, ingen askpass, bare `https`, som
i CLI-et. Innleveringsteksten fra Canvas vises aldri, bare lenken som er funnet
i den. Utvidelsens logg (Output → Canvas Clone) inneholder bare øktnavn og
antall, aldri navn eller repo.

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

**Dette kan bli liggende igjen:**

- Sikkerhetskopier fra hot exit (over).
- `workspaceStorage/<id>/` (VS Codes tilstand for øktvinduet, blant annet
  stien til økten og hvilke filer som var åpne) hvis øktvinduet brukte en
  annen brukermappe (`--user-data-dir`) enn hovedvinduet. Ellers slettes den
  også for økter som ble avsluttet uten «Ferdig» (krasj, krysset, VS Code
  lukket), innen et par minutter etter at økten selv er slettet.
- Gav du øktvinduet tillit, står stien i VS Codes liste over betrodde mapper.
  Fjern den under **Workspaces: Manage Workspace Trust**.
- VS Codes egne logger (`logs/` i brukermappen) kan nevne stien til økten.
- Er `~/canvas-clone` eller `~/canvas-clone/vscode` en symlenke, slettes
  gamle økter ikke automatisk (bare økter du avslutter med «Ferdig»). Du får en
  advarsel.

Lokal historikk (Local History) er slått av i øktmappen (`.vscode/settings.json`
som utvidelsen lager der), så VS Code lager ikke kopier av elevfiler du lagrer.

## Tillit (Workspace Trust)

- **Ikke trykk «Trust»** i øktvinduet, heller ikke når VS Code spør fra en task,
  debug eller terminalen. I et betrodd vindu kan VS Code og andre utvidelser
  kjøre kode fra elevrepoene.
- **Gi aldri tillit til `~/canvas-clone`, hjemmemappen eller en annen mappe over
  øktene.** Tillit arves av alle undermapper, også nye økter. Er øktvinduet
  betrodd likevel, viser utvidelsen en advarsel med «Lukk økten» som
  standardvalg. Fjern slik tillit under **Workspaces: Manage Workspace Trust**.
- Har du slått av Workspace Trust (`security.workspace.trust.enabled`), må du
  bekrefte før en økt åpnes.
- Ikke installer utvidelser som et elevrepo anbefaler, og ikke åpne et elevrepo
  som egen mappe.
- KI-assistenter og agenter i øktvinduet kan lese instruksjoner som ligger i
  elevrepoene (for eksempel `AGENTS.md`). Vær forsiktig med dem der.

## Personvern og nettverk

- Ingen telemetri fra utvidelsen.
- Nettkall går bare til Canvas-URL-en du har oppgitt, og `git clone` mot
  github.com.
