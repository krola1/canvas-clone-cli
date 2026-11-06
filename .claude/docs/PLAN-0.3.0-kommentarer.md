# Plan 0.3.0 — kommentartråden fra Canvas (VS Code-utvidelsen)

Byggplan fra verkstedets `byggplanlegger` (plan v2, 2026-11-05), med G0-funn fra v1 og endringene
etter kritikerens runde på v2, tilsynets tillegg og Lars' svar 2026-11-06 (del C). Gjenskapt av
Stabssjef 2026-11-06 fra øktens egne kopier etter at scratchpad i `/tmp` forsvant ved omstart.
Bakgrunn og ordrett logg: `~/dotfiles/verkstedet/org/jobblogg.md` («Ny funksjon (2026-11-05)») og
`~/dotfiles/tilsynet/org/risikovurderinger.md` (2026-11-05 + tillegg). HEAD ved planlegging: 59abb47.

**Del C går foran del A/B der de er uenige.**

---

## Del A — G0-funn om Canvas-API (fra v1, verifisert mot canvas-lms master-kildekode, ingen ekte instans)

Føres inn i `.claude/docs/D0-vscode-verifisering.md` under «Kommentar-funn».

- Felt (`lib/api/v1/submission_comment.rb`): `id`, `author_id`, `author_name`, `created_at`, `edited_at`,
  `comment` (ren tekst via Nokogiri `.text`; hent aldri `submission_html_comments`), `attempt`.
- `media_comment` {`content-type`, `display_name`, `media_id`, `media_type` audio/video, `url` →
  `user_media_download_url`, kan ha `location`} — `url` brukes aldri.
- `attachments[]` (`attachment_json`): `id`, `display_name`, `filename`, `content-type`, `url` (med
  `verifier=<uuid>`), `uuid`, `thumbnail_url`, `preview_url`. `uuid`/`thumbnail_url` er like hemmelige
  som `verifier`.
- `author` (`user_display_json`): `id`, `display_name`, `avatar_image_url`, `html_url`, `pronouns`.
  Anonym: `author_id` null, `author_name` «Anonymous User».
- `include[]=submission_comments` bruker `comments_excluding_drafts_for`: aldri utkast; skjulte og andre
  læreres kommer med for lærer, men `hidden` er ikke i JSON.
- `attempt` kan være null. PUT uten `comment[attempt]` → nåværende forsøk (null hvis ikke levert). Vi
  sender aldri `attempt`. «forsøk N» bare ved heltall.
- **PUT-svaret har alltid `submission_comments`** (`SubmissionsApiController#update`). `gradeSubmission`
  returnerer i dag hele objektet ut av `canvas.js` → 0.2.0 har `verifier`-URL-er og `body` i minnet.
  Må snevres inn (G1).
- **Lærersvar får `hidden: hide_comments_from_student?`** → ved manuell publisering skjult for eleven til
  karakterer publiseres. Må stå i README og bekreftelsen (K8).
- URL: innleveringsside `/courses/:k/assignments/:a/submissions/:user_id` (ingen query, virker også for
  ikke-leverte). SpeedGrader har query → forkastet. `/files/:id/download` krever innlogget sesjon; om
  lærer slipper inn uten verifier kan ikke avgjøres fra kildekode → bare manuell test i D8.
- Ikke-leverte: Canvas har trolig `unsubmitted`-rader for alle tildelte elever; kommentarer endrer ikke
  tilstand (ikke fullt bevist, D8).

## Del B — Plan v2

### Hvor ikke-leverte filtreres i dag
- `src/workflow.js` `splitSubmissions`/`selectForBulk` — felles med CLI — **uendret** (T17)
- `vscode/src/bla.mjs:148` `innleveringsnoder` (bruker `.submitted`) — endres
- `vscode/src/panel.mjs:81` `bindInnlevering` (gir `ikke_levert`) — endres
- `vscode/src/panel.mjs:278` `vurderFersk` (gir `borte`) — **uendret, se C/B4**
- `bla-vindu.js` `klonOppgave`, `omfangValg`/`velgSelvValg` (submitted) — uendret
`listSubmissions` returnerer allerede ikke-leverte.

### G1 – Kjernen (`src/canvas.js`)
- `listSubmissions(config,k,a,{kommentarer=false}={})`: bare `true` → `&include[]=submission_comments`.
  Ellers byte-lik URL og retur (K2, T17).
- `tilKommentarer(raw, elevId)`: **kaster aldri**; ikke-array → `null` («ikke hentet»). Hviteliste
  `{ id, fraEleven, forfatternavn, tekst, tid, forsok, vedlegg:[{filnavn,type}], media:{type}|null }`
  (ingen vedleggs-id). Sortert på `tid`, så `id`. `fraEleven` = `author_id === user_id`.
- `gradeSubmission`: JSON-håndtering uendret (CLI ser samme ok/feil). Etter vellykket `res.json()` bygges
  `submission` i egen try/catch som aldri gjør ok til feil: `grade` bare når `Object.hasOwn(raw,"grade")`,
  `workflow_state`, `kommentarer` (`tilKommentarer` mot svarets `user_id`, eller `null`). CLI leser ikke
  `submission` (`bin/canvas-clone.js:495`, `:579`).
- Rot-tester: URL uten valg uendret; vaktposter (unik tekst, `verifier`, `uuid`, `avatar_image_url`,
  `html_url`, `media_comment.url`, `thumbnail_url`, `preview_url`) ikke i resultat unntatt teksten i
  `tekst`; søppel-`submission_comments` → `null`, ingen exception; PUT med ugyldig tråd → `ok:true`;
  CLI e2e grønn; `bin/` urørt.

### G2 – Tre (`bla.mjs`, `bla-vindu.js`)
- `hentInnleveringer` (treet, også `klonOppgave` sin ferske henting) med `{kommentarer:true}`
  (unntatt quiz, se C). **1b:** feiler → ett nytt forsøk uten kommentarer (ikke ved 401/403, K12);
  lykkes det → alle `kommentarer:null` + én info-node øverst under oppgaven «Kommentarer ble ikke hentet
  – Oppdater for å prøve igjen». Feiler begge → feil som i dag. Bulk-kloning og panelets ferske henting
  sender aldri `include`.
- `innleveringsnoder`: leverte som før; ikke-leverte med `kommentarer.length > 0` → ny nodetype
  `ikkeLevert`, etter de leverte; Canvas-navn som reserve uten repo. Ikke i `KLONBARE` eller
  `apnePages`-typer. `contextValue` `ikkeLevert`; `when`-regex for klon/settKarakter/apnePages treffer
  ikke (låst med test).
- Merke i `innleveringsbeskrivelse`: «· N kommentarer», «· nytt» (siste i sortert liste før avkorting
  har `fraEleven`; annen lærer = besvart); `null` → intet merke; `ikkeLevert` får «ikke levert» først;
  tooltip uendret (K10).
- `gjelderInnlevering`/`medNyKarakter` for begge typer; `medNyKarakter` tar `kommentarer` når array,
  beholder gammel ved `null`.
- `oppdater()` sender hendelse som tømmer tråden i panelet (K9).

### G3 – Panel: tråd, «Åpne i Canvas», ikke-levert-binding (K3, K4, K9)
- `bindInnlevering` godtar `ikkeLevert`: `levert:false`, frosset kopi av `kommentarer`; quiz avvises
  fortsatt. Visningsmodell får `kanSetteKarakter` (`VISNINGSFELT` + test). `false` → karakter- og
  kommentarfelt låst med fast tekst, `validerSend` gir `ikke_levert`.
- `tradModell(binding,t)` → `{ type:"trad", generasjon, status:"ok"|"ikke_hentet",
  meldinger:[{fraEleven,forfatter,tekst,tid,forsok,vedlegg:[filnavn],media}], skjulte, tekster }`.
  Ingen ID-er/URL. Siste 100 meldinger, 4000 tegn, faste merker «… (forkortet)», «N eldre ikke vist».
  Testet felthviteliste. Egen melding etter `vis` (som `pagesModell`).
- `panel-html.mjs`: `createElement`/`textContent`, `dir="auto"` per melding, ingen `innerHTML`/`<a`.
  Knapper `type=button`. Én knapp «Åpne i Canvas» per binding → `{type:"apneCanvas", generasjon}`.
  CSP uendret. `vis`/`tom` tømmer tråd; `trad` bare med gjeldende generasjon.
- `vscode/src/canvaslenke.mjs` (ren): `innleveringMal(canvasUrl,kursId,oppgaveId,userId)`;
  `erGyldigCanvasUri(uri,canvasUrl)`: https, samme vert/port, ingen userinfo, sti
  `^/courses/\d+/assignments/\d+/submissions/\d+$`, ingen query/fragment.
- `vscode/src/canvaslenke-vindu.js`: eneste `openExternal` for Canvas; ID-er fra bindingen, origin fra
  lagret oppsett; `vscode.Uri.from`; validerer Uri og streng rett før åpning; testkrok bare i testmodus.
  Avviket fra K4s `nr` noteres i DECISIONS (godtatt av tilsynet).
- `extension.js`: `setup` (ok) og `deleteToken` løser bindingen (`losne`); `oppdater` setter tråden
  «ikke hentet».

### G4 – «Svar» (K5, K6, Lars 3b)
- `MELDINGSFELT.svar = [type, generasjon, tekst]`; `validerSvar` som `validerSend` (8000,
  `ULOVLIG_KOMMENTAR`, tomt avvises).
- Flyt med samme `sender`-flagg: (1) fersk henting uten kommentarer; (2) `vurderFerskSvar`: flere treff
  → tvetydig/avbryt, ingen → borte/avbryt, ellers send (også ikke levert / endret lenke; endret lenke →
  advarsel `{type:"lenke",da,na}`); (3) `bekreftSvar`: Canvas-navn + GitHub fra bundet `user_id`,
  «ikke levert» når aktuelt, oppgave/kurs, ~300 første tegn, ev. lenkeendring, fast linje (synlig for
  eleven, kan være skjult til karakterene publiseres, kan ikke slettes herfra); (4) generasjon sjekkes
  etter modal; (5) `gradeSubmission` med bare `{comment}` (bare `comment[text_comment]`).
- Etter vellykket PUT (svar og karakter): webview tømmer **bare** feltet som ble sendt (utkast i det
  andre feltet beholdes) — se C/B5 for meldingsform. Tråd fra PUT-svaret, gammel ved `null`.
  `vedSendt` med `kommentarer`.
- OutputChannel bare «svar sendt» (`vscLogReplySent`); feil «HTTP nnn» via `sendefeil`. Dagens
  kommentarfelt sammen med karakter uendret.

### G5 – Testrigg som fanger K2-brudd
- `installerScenario` (`vsc-tests/hjelpere/falsk-canvas.js`): logger `search`; `submission_comments`
  bare når `include[]=submission_comments`; krok som får include-kallet til å feile (1b), også med
  401/403 (K12); PUT-svar med `submission_comments` og vaktposter.
- `erTillattKall` — hviteliste (metode+sti+query): `GET /users/self`; `GET /courses?<eksakt query>`;
  `GET …/assignments?per_page=100`; `GET …/submissions?include[]=user&per_page=100` med/uten
  `&include[]=submission_comments`; `PUT …/submissions/:id` uten query. Alt annet forbudt. (Plassering:
  se C/B3.)
- Test: panelets ferske henting og bulk-kloning uten include; `klonOppgave` med (ikke quiz).
- `provekjoring.mjs`: logger path+search for Canvas med samme regel; riggdata med tråder og en
  ikke-levert elev med tråd; T15 ≥ 18/18.
- Vaktposttest mot `cache.json`, `globalState`/`workspaceState`, `canvasClone._logg`, `treBarn`
  (label/description/tooltip), QuickPick (stubbet), feilmeldinger, `innsyn.sendt` — `verifier`/`uuid`
  aldri, vaktposttekst bare i `trad`.
- VS Code-tester: bytt elev med svar-modal åpen → intet sendt; PUT-body nøyaktig
  `comment[text_comment]`; svar ved endret lenke med advarsel; svar til ikke-levert når riktig
  `user_id`, karakter avvises; `ikkeLevert` uten klon/Pages/settKarakter og uten GitHub-kall (K13);
  utkast i andre felt overlever sending; 1b-fallback → info-node og «ikke hentet»; ingen fallback ved
  401/403; `oppdater`/`setup`/`deleteToken` tømmer/løser; `apneCanvas` → validert Uri, byttet generasjon
  → ingen åpning.
- Statisk `openExternal`-test (`tests/vscode-pages.test.js:409`): eksakt alfabetisk liste
  `["canvaslenke-vindu.js", "pages-vindu.js"]`.
- Rot-tester: `tradModell`, `validerMelding` (`svar`, `apneCanvas`), `vurderFerskSvar`, `bekreftSvar`,
  `canvaslenke.mjs`, merke/«nytt».
- Mutasjon: fjern sjekken etter modal / hvitelisten / include-vakten i falsk Canvas → røde tester; rull
  tilbake.

### G6 – Tekster/dok/versjon (K7, K8)
- `src/strings.js`: `vscComments*`, `vscReply*`, `vscOpenInCanvas`, `vscNotSubmittedThread`, kommando
  «Vis kommentarer» (nb/en).
- `vscode/package.json` + `package-lock.json` 0.3.0, ny kommando og meny.
- README: «Kommentarer fra Canvas» (K8: helse/fravær, ikke vis ved skjermdeling, svaret synlig for eleven
  og kan ikke slettes, kan være skjult til publisering, ikke-leverte vises bare med tråd, treet viser
  «ikke levert» + antall, merkene oppdateres bare ved «Oppdater»); «Personvern og nettverk» (samme
  endepunkter, `include`, nettleser åpner Canvas); «Kjente begrensninger» (grupper, quiz,
  redigering/sletting, fagfellevurdering = ikke fra eleven, T1a ved like navn uten repo).
- CHANGELOG 0.3.0; DECISIONS 2026-11-05 (hviteliste, ett kall + 1b-fallback, innsnevret PUT, URL-mal +
  avvik fra `nr`, `ikkeLevert`, K7: ingen nye endepunkter); STATUS med D8 (ekte tråd + svar, ikke-levert
  testelev, `/files/ID/download` manuelt, skjult svar ved manuell publisering, unsubmitted-rader).
- Prosjektets `CLAUDE.md` endres **ikke** (krever Lars). Forslag til T-A-linje («kommentarer kun via
  `tilKommentarer`») leveres i rapporten.

### Ferdig
1. Rot `npm test`; VS Code minimum/bla/panel/oktvindu + `test:uten-tillit` (xvfb); rigg `klone` med T15;
   `check-package`; `sjekk-audit`; `vsce package` 0.3.0.
2. `bin/` og `src/workflow.js` uendret; `listSubmissions` uten valg samme URL; CLI e2e grønn.
3. Vaktposttest, Canvas-hvitelistetest (inkl. ingen include i fersk/bulk), `openExternal` eksakt liste
   grønne; ingen `innerHTML`/`<a`/`submission_html_comments`/`submission_history`.
4. README/CHANGELOG/DECISIONS/STATUS.
5. Tilsynet punkt b. Før kollega: K1 dokumentert av Lars; D8 med ekte tråd hos testelev (også ikke-levert).

---

## Del C — Endringer etter plan v2 (går foran)

### Lars' svar 2026-11-06 («1-4 går vi med dine anbefaelinger, 5a»)
- Ikke-leverte: bare lese og svare, aldri karakter.
- Ikke-leverte åpnes med ny kommando «Vis kommentarer» — **én** plassering: inline på raden.
- Quiz: ingen tråd i panelet, og `isQuizAssignment` styrer også treet: ingen `include`, ingen merker,
  ingen `ikkeLevert`-rader på quiz. Låses med test.
- `ikkeLevert` vises når tråden har minst én kommentar (også bare fra lærer).

### Kritiker på v2 (alle fikses)
- **B1:** `nodeFraArg` (KLONBARE-standard, `bla.mjs:166-171`) og `panel-vindu.js:272`
  (`node.type !== "innlevering"`) sperrer `ikkeLevert`. Ny kommando bruker eksplisitt typeliste
  `["ikkeLevert"]`; `settKarakter`/`bindOgVis` får eksplisitte typelister. Minst én VS Code-test går
  gjennom den **ekte** kommandoen med node-id, ikke `_panelBind`.
- **B2:** quiz, se over.
- **B3:** flytt `erTillattKall` til `vsc-tests/hjelpere/falsk-canvas.js`; kjør den på slutten av hver
  panel- og tretest; riggen beholder kopi med kommentar om at den speiler hjelperen; `GET /courses` med
  eksakt query.
- **B4:** `vurderFersk` er **uendret** (gir fortsatt `borte` ved unsubmitted, låst med test); all ny
  logikk i `vurderFerskSvar`.
- **B5:** meldingen etter sending — enten egen `sendt` `{type, generasjon, felt:"svar"|"skjema",
  karakter, status}` eller forenklingen «`vis` med samme generasjon beholder felt som ikke ble sendt»;
  velg det enkleste som er trygt og begrunn. Uansett: ferdig formaterte tekster fra host, felthviteliste
  og test. `visGjeldende()` sender `trad` etter `vis`, også etter `klar`. `etterSending`/`lagPanel` får
  med `kommentarer`.
- **Småting:** ved ikke-HTTP-feil etter «Svar»: tekst «kan være sendt – Oppdater og sjekk tråden før du
  sender igjen»; lås feltet under sending; `labelWithDuplicates` over leverte + ikke-leverte med tråd,
  noter T1a; ikon for `ikkeLevert` i `IKON` (`bla-vindu.js:63`); fast statustekst for `unsubmitted`;
  1b-flagget lagres per oppgavenøkkel ved siden av innleveringene og overlever
  `karakterSatt`/`klonOppgave`.

### Tilsynets tillegg (2026-11-05)
- **K2 aldri-liste:** `url`, `verifier`, `uuid`, `thumbnail_url`, `preview_url`, `avatar_image_url`,
  `author.html_url`, `media_comment.url`; vedlegg bare filnavn+type; verken `verifier` eller `uuid` i
  webview-meldinger; vaktposttest dekker PUT-svar og GET.
- **K4 revidert:** `apneCanvas` som over (godtatt).
- **K5 utvidet** til `ikkeLevert` (modal viser «ikke levert»).
- **K12:** ingen 1b-fallback ved 401/403; info-node/feil bare fast tekst eller «HTTP nnn».
- **K13:** `ikkeLevert` gir aldri GitHub-kall, låst med test.
- **K8 utvidet:** README om «ikke levert» + antall i treet og skjermdeling.
