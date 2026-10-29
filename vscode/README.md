# Canvas Clone for VS Code

**Under utvikling — ikke del denne utvidelsen ennå.**

Dette er en tidlig versjon av en VS Code-utvidelse for canvas-clone (CLI-et i
samme repo). Foreløpig kan den bare settes opp med Canvas-URL og token. Å bla
i kurs, klone og sette karakter kommer senere. Full bruksbeskrivelse kommer
før første deling.

## Kommandoer

Åpne kommandopaletten (Ctrl+Shift+P, på macOS Cmd+Shift+P) og skriv
«Canvas Clone»:

- **Canvas Clone: Oppsett (Canvas-URL og token)** — spør om Canvas-URL og
  API-token, sjekker dem mot Canvas og lagrer dem.
- **Canvas Clone: Slett token og Canvas-URL** — fjerner begge fra VS Code.
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

## Personvern og nettverk

- Ingen telemetri fra utvidelsen.
- Nettkall går bare til Canvas-URL-en du har oppgitt (og senere `git clone`
  mot github.com).
