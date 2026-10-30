# Endringslogg

## 0.1.0

Første versjon som deles, bare med lærere på egen skole.

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
- Fagretning og modul er gjettet fra oppgavenavnet.
