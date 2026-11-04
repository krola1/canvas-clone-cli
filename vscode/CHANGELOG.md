# Endringslogg

## 0.2.0

- **Lenke til elevens GitHub Pages:** når du velger en elev i visningen
  **Canvas Clone** (eller åpner eleven i karakterpanelet), spør utvidelsen
  GitHub én gang, uten pålogging, om repoet har Pages slått på. Raden får
  `· Pages` (bekreftet) eller `· Pages (ikke sjekket)` (ikke sjekket ennå,
  eller GitHub svarte ikke), med hele adressen i verktøytipset. Ikonet ↗ på
  raden, **Åpne elevens GitHub Pages** ved høyreklikk og en knapp i
  karakterpanelet åpner `https://<eier>.github.io/<repo>/` i nettleseren.
  Sier GitHub nei, vises ingen lenke. Svarene ligger bare i minnet;
  **Oppdater fra Canvas** sjekker på nytt. Når GitHubs grense (omtrent 60 i
  timen per IP-adresse) er nådd, spør utvidelsen ikke igjen før grensen er
  nullstilt.
- **Personvern:** utvidelsen gjør nå også uautentiserte `GET` mot
  `api.github.com/repos/*`. Siden som åpnes er elevens egen; logg aldri inn
  via lenker derfra (se README, «Elevens GitHub Pages»).

## 0.1.1

Endringer etter 0.1.0, etter test mot ekte Canvas.

- **Eget ikon i aktivitetslinjen (Activity Bar):** visningen **Canvas Clone**
  ligger nå i en egen beholder med eget ikon, ikke nederst i Utforskeren.
- **Nåværende karakter i bekreftelsen:** har eleven allerede en karakter i
  Canvas, viser bekreftelsen før sending «Nåværende karakter: …» øverst, hentet
  fra Canvas rett før bekreftelsen. Advarselen når karakteren er endret siden
  panelet ble vist, er som før.

## 0.1.0

Første versjon som er gjort klar for deling, bare med lærere på egen skole.
Den deles ikke før den er testet mot ekte Canvas.

**Hva utvidelsen gjør:**

- **Oppsett:** Canvas-URL (bare `https://`) og API-token. Tokenet lagres i
  VS Codes hemmelighetslager (SecretStorage), ikke i en fil, og kan slettes med
  **Canvas Clone: Slett token og Canvas-URL**.
- **Bla og klone:** kurs, fagretning, modul, oppgave og innlevering i en
  trevisning i Utforskeren. Elevenes GitHub-repo klones til en midlertidig økt
  som åpnes i et eget vindu uten tillit (Restricted Mode). Kloningen bruker
  aldri din egen GitHub-pålogging.
- **Klon på tvers av kurs.** Ved kloning av flere er «trenger retting»
  standardfilter, og du må bekrefte antallet før 20 repo eller flere klones.
- **Sett karakter** på én innlevering om gangen i et eget panel, med
  bekreftelse før noe sendes til Canvas.
- **Økter slettes** når du trykker «Ferdig med økten». Lukkes øktvinduet på
  en annen måte, slettes økten senere av hovedvinduet (se «Økter» i
  README). **Vis hva som ble liggende** og **Slett alle økter nå** lar deg
  rydde selv.
- Ingen telemetri. Utvidelsen snakker bare med Canvas-URL-en din og med
  github.com (ved kloning).

**Kjente begrensninger** (se «Kjente begrensninger» i README):

- Ikke testet mot ekte Canvas, verken bla og klone eller karaktersetting.
- Ikke testet på Windows eller macOS, bare automatisk på Linux mot VS Code
  1.100.0 med falsk Canvas og falsk git.
- Ikke testet med ekte nøkkelring, ekte klikk i panelet og dialogene, ekte
  hvilemodus, VS Code som Flatpak eller stor bulk (100+ repo).
- Automatiske tester kjører på Linux, Windows og macOS, men på Windows hoppes
  testene av selve kloningen over.
- Fagretning og modul er gjettet fra oppgavenavnet.
