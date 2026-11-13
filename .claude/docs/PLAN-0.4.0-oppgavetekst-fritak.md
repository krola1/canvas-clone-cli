# Plan 0.4.0 v2 — oppgavetekst, oppgaveknapp, vurdering (complete/incomplete/fritatt)

Laget av verkstedets `byggplanlegger` 2026-11-13 (kjørt som general-purpose med rollefilen; lesegrensen instruert,
ikke håndhevet). Lagret av Stabssjef. **Erstatter v1** (v1 oppsummert i `verkstedet/org/jobblogg.md`). Grunnlag: v1,
kritikers funn, Lars' svar «1a, 2a 3a» og «a», tilsynets punkt a med tillegg (O1–O11, O4 revidert) i
`tilsynet/org/risikovurderinger.md`. Status: godkjent for bygging 2026-11-13 (kritiker og tilsynet har vurdert v2; rettelser og Lars' svar nederst). Avviket fra O6 (Lars 2a) er godtatt av tilsynet (tillegg 2).

Merking: **[ny]** = ny i v2, **[endret]** = endret fra v1, umerket = som i v1.

## Mål
1. Oppgaveteksten i karakterpanelet, med formatering, uten bilder og klikkbare lenker; sammenfoldet (4a); alle
   URL-er som «[lenke]» (3a).
2. Knapp som åpner oppgavesiden i Canvas, i treet og i panelet (7c).
3. Vurdering etter tilsynets reviderte O4, valg bestemt av fersk oppgavetype og fersk levert-status:
   pass_fail → complete/incomplete/fritatt; poeng/bokstav ikke levert → bare fritatt (kan ikke angres i
   utvidelsen, Lars 1a); poeng/bokstav levert → fritekst som i dag; quiz → ingen nye handlinger.

**[ny]** Gruppeoppgaver vurdert samlet: meny og fritatt sperret med fast tekst (Lars 3a). «Ikke levert (N)» på
alle typer unntatt quiz (2b/2a); radene viser nåværende vurdering (Lars 2a; utvider O6, tilsynet må godta).

Rammer: bare `vscode/` endres, `src/` bare additivt. `bin/` og `src/workflow.js` urørt (5a, T17). **[endret]**
CLI-testene og `cache.json` helt uendret.

## Felles definisjon av «levert» [ny, kritiker B1, O4]
- Ny `vscode/src/levert.mjs`: `erLevert(sub)` = sann bare når `sub.submittedAt` er ikke-tom streng. **Ingen
  reserveregel via `workflowState`.** Mangler feltet → ikke levert (fikstur uten `submitted_at` feiler synlig).
- Brukes overalt i `vscode/`: `bla.mjs` `innleveringsnoder`/`innleveringsbeskrivelse`; `bindInnlevering`
  (`panel.mjs:108`), `vurderFersk` (`:446`), `vurderFerskSvar` (`:472`), statustekst (`:211`); G5-funksjonene.
- **Kloning (`splitSubmissions`, `src/workflow.js:24`, urørt):** utvidelsen filtrerer `subs.filter(erLevert)` før
  `splitSubmissions`/`selectForBulk` i `bla-vindu.js:466` (bulk) og `:508` (QuickPick). Tallene i QuickPick og treet
  blir like. Konsekvens: «graded» uten innlevering havner ikke i «Alle leverte»/`uten_lenke.txt` i VS Code (CLI
  uendret); slike elever har aldri `url`/`body`.
- B4 (0.3.0): bare predikatet på linje 446 byttes til `!erLevert(s)`; tester låser at oppførselen ellers er
  uendret. All ny logikk i egne funksjoner (G5).
- Statisk test: `"unsubmitted"` finnes ikke i `vscode/src/` (kommentarer unntatt).
- **Alle fiksturer får eksplisitt `submitted_at`** (null eller tid): `vsc-tests/hjelpere/bla-scenario.js:66`,
  `karakterpanel.vsctest.js:42/52`, falsk Canvas `standardPut`/lagrede innleveringer, rot-testene
  `tests/vscode-bla.test.js`/`vscode-panel.test.js`.
- Test: «karakter, men ingen `submitted_at`» → «Ikke levert»-rad med karakteren, binding `levert:false`, modal
  viser karakteren.

## O5: hva Canvas gjør med fritak
Verifisert i canvas-lms master (`submissions_api_controller.rb`, `abstract_assignment.rb`, API-dok, 2026-11-13):
`excuse` + karakter → 400; fritatt fjerner karakteren; karakter uten `excuse` fjerner fritaket; bare kommentar lar
fritaket stå; ingen sperre mot fritak på ikke-levert. Dok: «complete» gir full score også på poengoppgaver.
Valg: fritatt = bare `submission[excuse]=true` (+ evt. kommentar). Karakter fra utvidelsen = `posted_grade` +
`excuse=false` eksplisitt. **[endret]** Også fritekst fra panelet. Bare kommentar («Svar») sender ikke `excuse`.
Antatt, bekreftes i D8: skyversjonen lik master; `workflow_state`/`submitted_at` for fritatt ikke-levert;
kommentar med `excuse`; `submitted_at` på alle medlemmer ved gruppeinnlevering.

## Valideringsmatrise (extension host, fersk data) [ny, kritiker B2, O4 revidert, Lars 1a/3a/«a»]
Ren funksjon `tillatteHandlinger(ferskOppgave, ferskSub)` i ny `vscode/src/vurderingsregler.mjs` → lovlige
handlinger + fast avslagsgrunn. «Poeng/bokstav» = alle `grading_type` unntatt `pass_fail`. Data hentes direkte fra
Canvas rett før modalen, aldri fra `Map`/cache.

| Fersk tilstand | complete/incomplete | fritatt | fritekst | Svar (bare kommentar) |
|---|---|---|---|---|
| Quiz-lignende (`online_quiz`/`external_tool`, O11) | avvist | avvist | som 0.3.0 (quiz bindes ikke) | – |
| Gruppe vurdert samlet (`group_category_id` ≠ null og `grade_group_students_individually` ≠ true) | avvist, fast tekst | avvist, fast tekst | som 0.3.0 på poeng/bokstav levert; avvist på pass_fail | ja |
| pass_fail, levert | ja | ja | avvist | ja |
| pass_fail, ikke levert | ja | ja | avvist | ja |
| Poeng/bokstav, levert | avvist | avvist (2a) | ja | ja |
| Poeng/bokstav, ikke levert | avvist | ja, hvis ikke allerede fritatt | avvist | ja |
| Allerede fritatt (fersk), valg fritatt | – | avbryt «allerede fritatt» | – | – |

Overgangsregler i ny `vurderFerskVurdering(binding, ferske, ferskOppgave, valg)` (`vurderFersk` utvides ikke):
- `grading_type`, quiz- eller gruppestatus endret siden binding → avbryt.
- Fersk henting av oppgave/innleveringer feiler → **avbryt** med fast tekst/«HTTP nnn»; aldri reserve.
- 0 eller >1 treff på `user_id` → avbryt.
- Binding `levert:false`, fersk levert: poeng/bokstav → **avbryt** (Lars «a»); pass_fail → advarsel (12a), ny
  lenke nevnes.
- Binding `levert:true`, fersk ikke levert → avbryt «borte». Endret lenke → `endret_lenke` som i dag.
- Advarsler (12a): endret karakter, endret fritak, endret levert-status (pass_fail).

Meldinger: ny `{type:"vurdering", generasjon, valg, kommentar}`, `valg` ∈ `complete|incomplete|fritatt`; **[endret]**
ingen `valg:""` (bare kommentar via 0.3.0 «Svar»). `send` og `svar` uendret i form, begge gjennom matrisen.

Modaltekster (11b, nb/en i `src/strings.js`): alltid Canvas-navn (+ GitHub) fra fersk innlevering på bundet
`user_id`, «ikke levert» når aktuelt, nåværende karakter/score (også «graded» uten innlevering). Pluss:
«Fritatt — oppgaven teller ikke i elevens karakter.» / «Fjerner nåværende vurdering: X.» / på poeng/bokstav ikke
levert «Kan bare angres i Canvas.» / «Complete — fjerner fritaket.» / fritekst når fritatt «Karakteren fjerner
fritaket.»

Matrisetester: hver celle; eksplisitt complete/incomplete avvist på ikke-levert poeng, fritekst avvist på
ikke-levert poeng, fritatt avvist på levert poeng, fritekst avvist på pass_fail; gruppe samlet avvist;
`external_tool` avvist også via kommandoargument; levering mellom visning og modal (avbrudd poeng / advarsel
pass_fail); hint pass_fail men fersk «points» → avbrudd; fersk GET feiler → ingen PUT (spion på GET); bytt elev med
modal åpen → ingenting sendt; PUT-body per valg; mutasjonssjekk.

## Delsteg
Én commit per delsteg: `bygger` → utfyllingsmalen → `testverifiserer` + `leveranse-kritiker` med diff → retting →
commit. Kan stoppes etter hver commit. **[endret]** Felles levert-definisjon og treet før panelet; leverte og
ikke-leverte deler én matrise og ett delsteg (G5).

### G0 — Funn og beslutninger (bare dokumentasjon)
O5-funn i D0-notatet (kilde, dato, verifisert/antatt), det antatte i DECISIONS. STATUS: 0.3.0 committet (`2455a3c`).
Denne planfila committes.

### G1a — Tokenizer `src/oppgavetekst.js` (O1, O2, O7) [endret: delt ut]
`tilOppgavetekst(html)` → `{status:"ok", blokker} | {status:"tom"} | {status:"for_stor"}`, kaster aldri; hele
kroppen i try, ved feil fast status, aldri input-tekst.
- Entiteter: desimal, heks; `amp lt gt quot apos nbsp`, æøå/ÆØÅ, **[ny]** `rsquo lsquo ldquo rdquo mdash ndash hellip
  laquo raquo`; ukjente står. **[ny]** `fromCodePoint` vernet (>0x10FFFF, surrogater, 0 → U+FFFD).
- **[ny]** Kommentarer slutter bare på `-->`; uavsluttet kaster resten. `<!…>`/`<?…>` hoppes over.
- Attributter hoppes over med anførselstegn; **ingen kopieres**, unntak `alt` på `img` (som tekst, filtrert).
- **[ny]** Rå-tekst (`script style textarea title noscript template xmp`) hoppes til `</navn` case-insensitivt;
  mangler avslutning (også `</script` uten `>`) → resten kastes.
- `svg` fjernes med innhold; **[ny]** `math` → «[formel]». `iframe video audio object embed` → «[innebygd innhold]»;
  `img` → filtrert `alt` eller «[bilde]»; `a` → lenketekst. Uavsluttet tagg ved slutten → resten kastes.
- Modell: `overskrift{niva}`, `avsnitt`, `liste{nummerert, punkter}`, `sitat`, `kode`; tabellrad «celle | celle»;
  biter `{tekst, fet, kursiv}`, `\n` for `br`; `div`/`span`/`section`/`font` flates ut.
- **[endret] O7:** hard grense 2 MB rå → `for_stor` uten tokenisering; 200 kB gjelder ferdig tekst; maks 2000
  blokker; dybde telles bare i liste/sitat og flates ut til nivå 10 (avvises ikke).
- **[endret] O2-rørledning (rekkefølgen er krav):** 1) dekode entiteter; 2) **[ny]** fjerne NUL, C0/C1 (unntatt
  `\n`, `\t`), bidi (U+202A–202E, U+2066–2069, U+200E/F), usynlige (U+200B–200D, U+2060, U+FEFF, U+00AD); 3) URL-filter
  på sammenslått tekst per blokk (på tvers av biter) og separat på `alt`, før splitt; treff føres tilbake (biten med
  starten får «[lenke]», resten fjernes); 4) filteret fanger case-insensitivt `skjema://…`, `www.…`, `vert.tld/sti…`,
  `mailto:`/`data:`/`javascript:`, og ethvert `\S+` med `verifier`, `/files/\d` eller `://`; 5) siste
  sikkerhetsnett per utgående streng (bit og `alt`): inneholder den fortsatt `verifier`, `://`, `www.` eller
  `/files/\d` → hele biten «[lenke]»; teller i testene viser at nettet ikke slår til på korpuset.
- Tester (rot): O1-listen; RCE-lignende HTML (tabell, YouTube-iframe, fillenke med `verifier`, likning/`math`,
  `style`/`span`, `&nbsp;`); **[ny]** vaktposter: URL splittet over `<span>`, URL med entiteter (`&#58;`, `&#x2F;`),
  uten skjema, `verifier` i `alt`, ødelagte attributter (`<a href="x>`, uavsluttet anførselstegn), bidi/NUL i URL,
  URL og `verifier` i ren tekst; rå-tekst, entiteter, `fromCodePoint`-grenser, `math`; **[ny]** fuzz/skjematest
  (seedet PRNG, ~5000 strenger; aldri kast, eksakt modellskjema, ingen `://`/`verifier`); O7-grenser (2 MB rå,
  1 MB `data:`-URI ok, dyp `div` ok, dyp liste flates, 2001 blokker → `for_stor`).

### G1b — `src/canvas.js` (additivt; O2, O8, O9) [endret: delt ut]
- `hentOppgave(config, k, a)`: én GET `/api/v1/courses/:k/assignments/:a` via ny `apiGetEn` (samme origin-sjekk og
  feilformat som `apiGetAll`) → `{gradingType, submissionTypes, gruppeSamlet, tekst}`; **[ny]** `gruppeSamlet =
  group_category_id != null && grade_group_students_individually !== true`. `description` forlater aldri
  funksjonen; `html_url` leses aldri.
- **[ny]** `apiGetEn` fanger `res.json()`-feil → fast melding «ugyldig svar fra Canvas (HTTP nnn)», aldri
  `err.message`.
- **[endret]** `listTeacherCoursesWithAssignments` uendret (ingen `gradingType` i cache).
- **[endret]** `listSubmissions(…, { levertOgFritak: true })` legger til `submittedAt` (`submitted_at ?? null`) og
  `excused` (`=== true`); URL uendret; uten valget byte-lik retur (`tests/canvas.test.js:254` står).
- `gradeSubmission(..., {grade, comment, excuse})`: `excuse:true` + karakter → kast; `true` → bare `excuse=true`
  (+ kommentar); `false` → `excuse=false` + karakter; `undefined` → byte-lik PUT. **[endret]** Innsnevret svar får
  `excused` bare når `excuse` ble sendt (`:94` og `:313` står).
- Tester: alt over; `hentOppgave` med fiendtlig `description` (vaktpost) → bare modellen ut; **[ny]** ugyldig JSON med
  `verifier` → ikke i feilmeldingen; CLI-testfila og `tests/e2e*.test.js` uendret og grønne (endres en påstand
  likevel: listes i utfyllingsmalen med begrunnelse).

### G2 — Knapp for oppgavesiden (O3, Lars 7c)
`canvaslenke.mjs` `oppgaveMal`; validering godtar nøyaktig to ankrede maler. `canvaslenke-vindu.js`
`apneOppgave(ider)`. Kommando `canvasClone.apneOppgave` inline/høyreklikk på `oppgave`, skjult i paletten,
`nodeFraArg(..., ["oppgave"])`. Panelknapp `{type:"apneOppgave", generasjon}`. Tester: maler, avvisning,
cross-course, statisk `openExternal`-liste uendret.

### G3 — Felles levert-definisjon og «Ikke levert (N)» i treet (O4, O6 med avvik, Lars 2b/2a) [endret: flyttet frem]
- `levert.mjs` og bruk som over; utvidelsen kaller `listSubmissions` med `{levertOgFritak:true}`
  (`bla-vindu.js:158/466`, `panel-vindu.js:235/308`).
- `bla.mjs`: sammenfoldet `ikkeLevertGruppe` «Ikke levert (N)» etter de leverte, alle typer unntatt quiz-lignende
  (`online_quiz`/`external_tool`). Barn `ikkeLevert`; 0.3.0-radene med tråd flyttes hit. Ugjennomsiktig `TreeItem.id`.
- **[ny, Lars 2a]** Beskrivelse: «ikke levert», «ikke levert · fritatt» eller «ikke levert · <karakter>», pluss
  kommentarmerket. Leverte rader får «· fritatt» når `excused`.
- **[endret]** `ikkeLevert` har **én** kommando (eksisterende 0.3.0-kommando, nå på alle `ikkeLevert`-rader; tittel
  f.eks. «Åpne i karakterpanelet», ID beholdes). Panelet avgjør. Ingen tre-hint om karaktertype.
- I dette delsteget kan panelet for `ikkeLevert` fortsatt bare lese og svare; vurdering i G5.
- Tester: gruppe og antall; beskrivelser (uten kommentartekst/`verifier`); `contextValue`; «karakter uten
  `submitted_at`»; kloning med forfiltrering; ingen GitHub-kall/kloning/Pages for `ikkeLevert`; statisk test uten
  `"unsubmitted"`; quiz og `external_tool` gir ingen gruppe.

### G4 — Oppgaveteksten i panelet (O1, O2, O7, Lars 4a)
- `panel-vindu.js` henter med `hentOppgave` ved binding hvis ikke hentet; `Map` i minnet «k:a» →
  `{gradingType, submissionTypes, gruppeSamlet, tekst}`; feil lagres ikke; tømmes ved «Oppdater fra Canvas», oppsett,
  sletting av token. **[ny]** Samtidige kall slås sammen (ett løfte per nøkkel); resultat merkes med generasjon,
  melding bare om gjeldende binding har samme «k:a» og generasjon; `visGjeldende()` sender `oppgavetekst` fra `Map`
  (fanebytte).
- Melding `oppgavetekst` (`oppgavetekstModell` i `panel.mjs`, felthviteliste), etter `vis`, bare gjeldende generasjon.
  **[ny]** `sammeOppgave` beholder `<details>`-tilstand ved elevbytte i samme oppgave; ny oppgave/nylasting →
  sammenfoldet.
- Visning: statisk `<details>` i `panel-html.mjs`; fast tabell type → tagg; `createElement` bare med navn fra tabellen;
  `textContent`; ukjente ignoreres; CSP uendret; `for_stor`/feil → fast tekst/«HTTP nnn» + henvisning til knappen.
- Skjemaet låses (fast tekst) til typen er kjent, og ved feil.
- Falsk Canvas: GET én oppgave med fiendtlig `description`; `erTillattKall` + `GET /api/v1/courses/\d+/assignments/\d+`
  med tom query; riggkopien i `provekjoring.mjs` oppdateres.
- Vaktpost: unik tekst + `verifier` + URL i ren tekst ikke i `cache.json`, `globalState`/`workspaceState`, `_logg`,
  `treBarn`, feilmeldinger, tooltip. **[ny] Positiv kontroll:** unik tekst SKAL finnes i `oppgavetekst`-meldingen i
  `innsyn.sendt` og ingen andre steder; `verifier` ingen steder.
- Statisk test: ingen `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser`, **[ny]** `document.write`,
  `createContextualFragment`, `setHTMLUnsafe`, `srcdoc`, `setAttribute`; `createElement` bare med strenglitteraler
  fra fast liste.
- Tester: fanebytte → tekst igjen uten ny GET; elevbytte under henting → ingen gammel tekst; to raske bindinger på
  samme oppgave → én GET.

### G5 — Vurdering for leverte og ikke-leverte (O4 revidert, O5, Lars 2a/3a/11b/12a/1a/1b/«a») [endret: v1 G4+G5]
- `vurderingsregler.mjs` med matrisen; ny `vurderFerskVurdering`; `vurderFersk` får bare `erLevert`.
- **[ny]** Fersk henting før modal (`hentOppgave` + `listSubmissions`) med **egen try**, ikke `handter` sin fang-alt
  (`panel-vindu.js:205`); feil → avbrudd, ingen reserve.
- Webview (bare visning, host avgjør på fersk data): meny når `Map`-typen er pass_fail; poeng/bokstav ikke levert →
  bare «Fritatt»-knapp; poeng/bokstav levert → fritekst; **[ny]** gruppe samlet → fast tekst («Gruppen vurderes
  samlet — sett vurderingen i Canvas»).
- `vurderingArgumenter`: `{excuse:true, comment}` eller `{grade, excuse:false, comment}`; **[endret]** fritekst sender
  også `excuse:false`.
- Treet: `medNyKarakter`/`karakterSatt` tar med `excused` når svaret har feltet.
- Falsk Canvas `standardPut` som Canvas (400 ved excuse+karakter; fritatt nuller karakter; karakter uten excuse
  fjerner fritak; `submitted_at` beholdes).
- **[ny]** `erTillattKall` sjekker PUT-body: bare `submission[posted_grade]`, `submission[excuse]`,
  `comment[text_comment]`; `excuse` ∈ {`true`,`false`}; aldri `excuse=true` med `posted_grade`. Riggkopien oppdateres.
- Tester: matrisetestene + fritatt over karakter (modaltekst), complete etter fritatt («fjerner fritaket»),
  ikke-levert poeng («kan bare angres i Canvas»), «allerede fritatt» → avbryt, verdi utenfor lista, K13 (ingen
  kloning/GitHub for ikke-leverte).

### G6 — Tekster, dokumentasjon og versjon
- nb/en i `src/strings.js` (8c); norske kommandotitler. `vscode/package.json` og lock til 0.4.0.
- README: oppgavetekst uten bilder/lenker; fritatt og matrisen i klartekst; fritak på ikke-levert poeng/bokstav kan
  bare angres i Canvas; «Ikke levert»-gruppen med vurderingsvisning; skjermdeling (kan være hele klassen); kjente
  begrensninger (gruppe samlet sperret for meny/fritatt, fritekst går til hele gruppen som i dag, pass_fail-gruppe
  kan ikke vurderes i utvidelsen, on_paper/none og «graded uten innlevering» i «Ikke levert» kan bare fritas, to
  ikke-leverte uten repo med likt navn kan ikke skilles, New Quizzes/`external_tool` regnes som quiz); CLI `--grade`
  fjerner fritak (O10).
- CHANGELOG og DECISIONS 2026-11-13: tokenizer og O2-rørledning, O5-funn, `excuse=false` eksplisitt, `erLevert` og
  forfiltrering ved kloning, avvik fra O6 (2b + 2a), matrisen, gruppesperre, ingen `gradingType` i cache, O9.
- STATUS: D8-punkter; O10; observasjon om `gradeSubmission` (se Usikkerhet).
- Forslag til `CLAUDE.md` (krever Lars): «`description` hentes bare i `hentOppgave` og forlater `src/canvas.js` bare
  gjennom `tilOppgavetekst`. Aldri `html_url`.»

### G7 — Avslutning
Tilsynet punkt b (inkl. Lars 2a/O6). D8 for 0.3.0 og 0.4.0 samlet (9b) mot testelev: alle tre valg på levert og
ikke-levert pass_fail; fritatt på ikke-levert poengoppgave og at totalkarakteren endres; fritatt på «graded» uten
innlevering; fritak fjernes med complete/incomplete; kommentar med fritatt; `workflow_state`/`submitted_at` for
fritatt ikke-levert; SpeedGrader; oppgavetekst fra ekte RCE; oppgavesiden fra tre og panel; **[ny]** sperretekst på
gruppeoppgave vurdert samlet (hvis testkurset har en). K5-rest, T14/T14a.

## Ferdig betyr
1. Rot-`npm test` grønn; xvfb `minimum`/`bla`/`panel`/`oktvindu` og uten tillit; rigg `klone`; `check-package`,
   `sjekk-audit`, `vsce package` 0.4.0.
2. `bin/`, `src/workflow.js` urørt. `tests/canvas.test.js` og e2e urørt og grønne; CLI-PUT og `listSubmissions` uten
   valg byte-like; `cache.json` helt uendret.
3. Grønne: O1-listen; O2-vaktposter med positiv kontroll og fuzz; O3-maler og `openExternal`-liste; matrisetester
   (O4); statisk test uten `"unsubmitted"`; `erTillattKall` med body-regel. Ingen nye endepunkter utover GET én
   oppgave (O9).
4. README, CHANGELOG, DECISIONS, STATUS oppdatert.
5. Tilsynet punkt b ferdig (inkl. 2a/O6); D8 gjort av Lars (6a). Først da deling.

## Forkastet
Parser som devDependency; `description` fra oppgavelista; `html_url`; DOMParser i webview (som v1). **[ny]** Endre
`splitSubmissions` (T17); kloning via `workflowState` (treet og QuickPick ville telt ulikt); reserveregel i
`erLevert` (skjuler fiksturer uten `submitted_at`); `excused`/`submittedAt` alltid i `listSubmissions` (bryter
`deepEqual`); `gradingType` i cache, `valg:""`, to kommandoer på `ikkeLevert` (fjernet etter kritiker); utvide
`vurderFersk` (B4); avvise dyp nesting.

## Kritikerpunkter
Ingen utelatt. Presisert: `splitSubmissions` via forfiltrering; `<details>`-tilstand huskes ved elevbytte i samme
oppgave, ikke over skjul/vis (ingen `setState` = intet nytt lagringssted); `data:`-URI via 200 kB på ferdig tekst +
2 MB rå; CLI-testene via valg, ingen påstander endres.

## Usikkerhet
- Ikke verifisert mot skyversjon: `submitted_at` null for «graded uten innlevering» og fritatt ikke-levert, og satt
  for alle medlemmer ved gruppeinnlevering; betydningen av `grade_group_students_individually`; at `excused` alltid
  følger med. D8 må bekrefte.
- Én `erLevert`: on_paper/none med karakter kan ikke lenger få ny karakter fra utvidelsen (0.3.0 tillot fritekst).
- pass_fail-gruppeoppgaver vurdert samlet kan ikke vurderes i utvidelsen (mulig regresjon).
- URL-filter: domener uten skjema og sti (f.eks. «vg.no») står som tekst, ellers blir «index.html»/«Node.js» til
  «[lenke]» — innsnevring av Lars 3a (spørsmål 2).
- Fuzz er ikke bevis; sikkerheten bygger på ingen kopierte attributter, rørledningen og sikkerhetsnettet.
- `external_tool` regnes som quiz-lignende; vanlige LTI-oppgaver mister gruppen og fritak.
- Utenfor omfanget: eksisterende `gradeSubmission` returnerer `err.message` fra `res.json()` → `SyntaxError` kan
  sitere PUT-svar med `verifier` (K2-hull fra 0.3.0). Ikke tatt inn (endrer CLI-feiltekst); i STATUS; til tilsynet.
- Antall fiksturer som må få `submitted_at` kan være stort; G3 kan bli tungt.

## Åpne spørsmål til Lars (v2)
1. Elever uten innlevering som har karakter (on_paper) kan bare fritas fra utvidelsen: a) kjent begrensning,
   b) egen jobb senere. Anbefaling a.
2. Adresser uten `http`/`www` og uten sti («vg.no»): a) vises som tekst, b) «[lenke]». Anbefaling a; tilsynet ser på det.

## Historikk
- v1 (2026-11-13): Lars «1b 2a 3a 4a»; tilsynets tillegg O4 revidert; Lars «a» (levert siden → avbryt).
- v2 (2026-11-13): kritikers funn + Lars «1a, 2a 3a».

## Lars' svar på v2-spørsmålene (2026-11-13, ordrett): «1a 2a»
1a: on_paper/«graded uten innlevering» kan bare fritas — kjent begrensning i README. 2a: rene domener står som tekst,
men **bare** når ordet i sin helhet er `vertsnavn.tld` (tilsynets presiserte O2: `/ ? # : @` etter, eller `@` foran →
«[lenke]»; vaktposter `vert.no?token=x`, `vert.no#x`, `vert.no:8080/x`, `bruker:pw@vert.no`; `vg.no` og `index.html` står).
Tilsynets tillegg 2 gjelder også: O5 utvidet (D8 bekrefter `submitted_at` for gruppemedlemmer, ellers sperres fritatt
også på individuelt vurderte gruppeoppgaver), O6 revidert (rader viser karakter, aldri kommentartekst), O12 (CLI-feiltekst,
egen jobb, i STATUS).

## Rettelser etter kritiker på v2 (godkjent av Lars 2026-11-13: «1 ja») — gjelder foran teksten over
1. **(blokkerende)** `excuse=false` sendes **bare** sammen med `posted_grade`. Fritekst med bare kommentar sender
   ingen `excuse` (fritaket står). `gradeSubmission` kaster ved `excuse:false` uten karakter. PUT-body-test: fritekst
   med bare kommentar på fritatt elev → ingen `excuse` i body. Modalteksten «Karakteren fjerner fritaket» bare når det
   er en karakter.
2. `erLevert`: `submittedAt === undefined` → kast/synlig feil (glemt `{levertOgFritak:true}`); bare `null` → ikke levert.
3. Sikkerhetsnettets teller skal være 0 for hver enkelt vaktpost og for fuzz-korpuset (alternativt kjøres de også med
   nettet slått av), så feil i filteret ikke skjules.
4. Fast test-tabell for ikke-treff, kjørt med og uten entiteter og nullbredde-tegn: `index.html`, `style.css`,
   `Node.js`, `src/app.js`, `css/style.css`, «f.eks.», «kl. 10.30», `1.5/2`, `v1.2/docs` skal stå urørt; treffsiden som
   i tilsynets O2-presisering.
5. Aldri `excuse` når `gruppeSamlet` er sann (fritekst sender samme PUT som i 0.3.0), med test.
Småting tas med: K2-observasjonen gjelder bare CLI-et (O12, egen jobb — Lars «2a»); «verifier» i vanlig tekst →
«[lenke]» noteres i README/DECISIONS; `submissionSummary` før/etter filter velges og låses med test; `external_tool`
som quiz i README. `sammeOppgave` beholdes (liten kostnad).
