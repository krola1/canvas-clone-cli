# ROADMAP.md

Ingen forpliktende plan her — bare struktur og konkrete spørsmål som trenger
svar fra deg før noe prioriteres. Ingenting under er gjettet.

## Løst (tidligere åpne spørsmål, 2026-10-25)

1. ~~Skal `--temp`-flagget fortsatt bygges?~~ Ja — bygget, se `STATUS.md`.
2. ~~Er cross-course bulk-kloning droppet for godt, eller bare utsatt?~~
   Bygget — `--all-courses`-flagg + menyvalg, se `STATUS.md` og ny
   `DECISIONS.md`-oppføring for mappestruktur-valget.
3. ~~Skal verktøyet distribueres til andre lærere?~~ Ja — `whoAmI`-
   feilklassifisering, `hasGit()`-varsel og README-"Feilsøking" er på plass
   som et første steg i den retningen.
4. ~~Er automatiserte tester ønskelig nå?~~ Ja — `npm test` finnes nå med
   dekning for de rene funksjonene og `whoAmI`.

## Åpne spørsmål

1. **Automatisert testdekning for selve orkestreringskoden
   (`bin/canvas-clone.js`)?** I dag er navigasjonsflyten, cross-course-
   sammenslåingen og `--temp`-oppryddingen bare manuelt verifisert (lesing +
   en ende-til-ende røyktest mot en fake Canvas-server/fake `git`/`code`,
   ikke en del av testsuiten). Å teste den ordentlig krever mocking av
   `@inquirer/prompts`, `spawnSync` og `fetch` sammen — en god del mer
   infrastruktur enn det `node:test` trengte for de rene funksjonene. Verdt
   investeringen nå, eller fortsatt for tidlig?
2. **Skal "enkelt-oppgave funnet via cross-course-navigasjon" fortsatt bruke
   `grading/<kurs>/...`-strukturen, eller falle tilbake til den vanlige
   `grading/<assignment_id>/...`-strukturen siden oppgaven uansett bare
   hører til ett kurs?** Valgt løsning (se `DECISIONS.md`): den beholder
   cross-course-strukturen gjennom hele økten den ble funnet i, for
   forutsigbarhet. Ikke eksplisitt bekreftet med deg — flagg hvis du vil ha
   det annerledes.

## Mulige fremtidige retninger (uprioritert, ikke forpliktende)

- Ekte Canvas-kategorimetadata i stedet for regex-gjetning, hvis/når Canvas
  noen gang tilbyr det på API-et.
- Egen håndtering av gruppeinnleveringer (i dag: kun den som faktisk leverte
  i Canvas telles).
