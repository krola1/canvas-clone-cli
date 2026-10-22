// All brukervendt tekst samlet ett sted, med en norsk og en engelsk variant
// per streng. Hvilket språk som brukes styres av `joeMode` (se config.js /
// bin/canvas-clone.js for hvordan den slås av/på - ingen forklaring her).
export function createStrings(joeMode) {
  const L = (no, en) => (joeMode ? en : no);

  return {
    help: () =>
      L(
        `Bruk: canvas-clone [valg]

Interaktivt verktøy: velg kurs og oppgave fra Canvas, klon elevenes
GitHub-repo til ./grading/<assignment_id>/<github-bruker>/, og åpne
valgfritt i editor etterpå.

  --setup               Kjør førstegangsoppsettet på nytt (bytt Canvas-URL/token/editor)
  --refresh             Ignorer cachet kurs-/oppgaveliste og hent ferske data fra Canvas
  --course <id>         Hopp rett til dette kurset (hopper over kursvalg)
  --assignment <id>     Klon denne ene oppgaven (krever --course)
  --category <navn>     Bulk-klon hele denne fagretningen, f.eks. "Frontend" (krever --course)
  --submodule <navn>    Snevre bulk-kloningen inn til ett nivå/modul, f.eks. "modul 1" (krever --category)
  --all                 Bulk-klon ALT i kurset, uavhengig av fagretning (krever --course)
  --generate            Ikke klon - bare skriv ut den tilsvarende kommandoen (kan kombineres med
                         --course for å fortsette interaktivt derfra, eller stå alene for full navigasjon)
  --open <editor>       Åpne alle klonede repo automatisk i denne editoren (f.eks. "code" eller "zed"),
                        uten å spørre hvilke eller bekrefte editor
  --joe-mode            Kjører applikasjonen i Joe Mode

--assignment, --category og --all er gjensidig utelukkende.

Eksempler:
  canvas-clone --course 557 --assignment 11030 --open code
  canvas-clone --course 557 --category "Frontend" --submodule "modul 1"
  canvas-clone --course 557 --all
  canvas-clone --generate

I menyer: ← for å gå tilbake, Esc for å avbryte programmet.
(I oppgavesøket er ← reservert for tekstmarkøren - bruk "← Tilbake"-valget der.)

Nederst i kurslisten finner du også "Generer en snarvei-kommando" - gjør
akkurat det samme som --generate, bare startet fra menyen i stedet for flagg.
Bulk-kloning filtreres av "bulkCloneFilter" i config.json (default: kun
innleveringer som trenger retting).
`,
        `Usage: canvas-clone [options]

Interactive tool: pick a course and assignment from Canvas, clone the
students' GitHub repos into ./grading/<assignment_id>/<github-user>/, and
optionally open them in an editor afterwards.

  --setup               Re-run first-time setup (change Canvas URL/token/editor)
  --refresh             Ignore the cached course/assignment list and fetch fresh data from Canvas
  --course <id>         Jump straight to this course (skips course selection)
  --assignment <id>     Clone this one assignment (requires --course)
  --category <name>     Bulk-clone this entire subject track, e.g. "Frontend" (requires --course)
  --submodule <name>    Narrow the bulk clone to one level/module, e.g. "modul 1" (requires --category)
  --all                 Bulk-clone EVERYTHING in the course, regardless of subject track (requires --course)
  --generate            Don't clone - just print the equivalent command (can be combined with
                         --course to continue interactively from there, or stand alone for full navigation)
  --open <editor>       Automatically open all cloned repos in this editor (e.g. "code" or "zed"),
                        without asking which ones or confirming the editor
  --joe-mode            Runs the application in Joe Mode

--assignment, --category and --all are mutually exclusive.

Examples:
  canvas-clone --course 557 --assignment 11030 --open code
  canvas-clone --course 557 --category "Frontend" --submodule "modul 1"
  canvas-clone --course 557 --all
  canvas-clone --generate

In menus: ← to go back, Esc to quit the program.
(In the assignment search, ← is reserved for the text cursor - use the "← Back" entry instead.)

At the bottom of the course list you'll also find "Generate a shortcut command" -
does exactly the same as --generate, just started from the menu instead of a flag.
Bulk cloning is filtered by "bulkCloneFilter" in config.json (default: only
submissions that need grading).
`
      ),

    errAssignmentNeedsCourse: () =>
      L("Feil: --assignment krever at --course også er oppgitt.", "Error: --assignment requires --course to also be given."),
    errCategoryNeedsCourse: () =>
      L("Feil: --category krever at --course også er oppgitt.", "Error: --category requires --course to also be given."),
    errSubmoduleNeedsCategory: () =>
      L("Feil: --submodule krever at --category også er oppgitt.", "Error: --submodule requires --category to also be given."),
    errAllNeedsCourse: () => L("Feil: --all krever at --course også er oppgitt.", "Error: --all requires --course to also be given."),
    errMutuallyExclusive: () =>
      L(
        "Feil: --assignment, --category og --all kan ikke kombineres.",
        "Error: --assignment, --category and --all cannot be combined."
      ),

    noDueDate: () => L("ingen frist", "no due date"),
    dueLabel: () => L("frist:", "due:"),
    gradingLabel: (n) =>
      n > 0 ? L(`${n} klare til retting`, `${n} ready to grade`) : L("ingen klare", "none ready"),
    backHint: () => L("← tilbake · Esc avbryt", "← back · Esc quit"),
    quitHint: () => L("Esc avbryt", "Esc quit"),

    fetchingCourses: () => L("Henter kurs...", "Fetching courses..."),
    fetchingCoursesProgress: (done, total) =>
      L(`Henter oppgaver og status... (${done}/${total} kurs)`, `Fetching assignments and status... (${done}/${total} courses)`),
    noCoursesFound: () => L("Fant ingen kurs du er lærer i.", "Found no courses you teach."),
    cacheNote: (minutes) => {
      const age =
        minutes < 1
          ? L("akkurat nå", "just now")
          : minutes === 1
            ? L("1 minutt siden", "1 minute ago")
            : L(`${minutes} minutter siden`, `${minutes} minutes ago`);
      return L(
        `(Cachet kursliste, ${age} — kjør med --refresh for ferske data.)`,
        `(Cached course list, ${age} — run with --refresh for fresh data.)`
      );
    },
    generateEntry: () =>
      L("✨ Generer en snarvei-kommando (uten å klone nå)", "✨ Generate a shortcut command (without cloning now)"),
    pickCourseMessage: () => L("Velg kurs:", "Select course:"),

    allAssignments: () => L("Vis alle oppgaver", "Show all assignments"),
    uncategorized: () => L("(Ukategorisert)", "(Uncategorized)"),
    pickCategoryMessage: () => L("Velg fagretning:", "Select subject track:"),
    pickSubmoduleMessage: () => L("Velg nivå/modul:", "Select level/module:"),

    filterAll: () => L("alle innleverte", "all submitted"),
    filterNeedsGrading: () => L("trenger retting", "needs grading"),
    searchHint: () =>
      L(
        '(Skriv for å filtrere. ← flytter tekstmarkøren her - velg "← Tilbake" i listen i stedet.)',
        '(Type to filter. ← moves the text cursor here - use the "← Back" entry in the list instead.)'
      ),
    back: () => L("← Tilbake", "← Back"),
    bulkGenerateLabel: (n) =>
      L(`📦 Generer snarvei for ALLE i denne listen (${n} oppgaver)`, `📦 Generate shortcut for ALL in this list (${n} assignments)`),
    bulkCloneLabel: (n, filterLabel) =>
      L(
        `📦 Klon ALLE i denne listen (${n} oppgaver, filter: ${filterLabel})`,
        `📦 Clone ALL in this list (${n} assignments, filter: ${filterLabel})`
      ),
    searchAssignmentMessage: () => L("Søk etter oppgave:", "Search for assignment:"),

    onlyNeedsGrading: (n) => L(`Kun de som trenger retting (${n})`, `Only the ones that need grading (${n})`),
    allSubmitted: (n) => L(`Alle innleverte (${n})`, `All submitted (${n})`),
    chooseYourself: () => L("Velg selv", "Choose yourself"),
    submissionSummary: (total, submitted, needsGrading) =>
      L(
        `${total} elever — ${submitted} levert, ${needsGrading} klare til retting, ${total - submitted} ikke levert.`,
        `${total} students — ${submitted} submitted, ${needsGrading} ready to grade, ${total - submitted} not submitted.`
      ),
    pickCloneScopeMessage: () => L("Hva vil du klone?", "What do you want to clone?"),
    pickSpecificMessage: () => L("Velg hvilke innleveringer som skal klones:", "Select which submissions to clone:"),

    fetchingBulkSubmissions: (done, total) =>
      L(`Henter innleveringer... (${done}/${total} oppgaver)`, `Fetching submissions... (${done}/${total} assignments)`),
    bulkFetchResult: (count, filterLabel, poolSize) =>
      L(
        `${count} innleveringer funnet (filter: ${filterLabel}) på tvers av ${poolSize} oppgaver.`,
        `${count} submissions found (filter: ${filterLabel}) across ${poolSize} assignments.`
      ),

    errCourseNotFound: (id) => L(`Fant ikke kurs med id ${id}.`, `Could not find course with id ${id}.`),
    errAssignmentNotFound: (id, courseName) =>
      L(`Fant ikke oppgave ${id} i "${courseName}".`, `Could not find assignment ${id} in "${courseName}".`),
    errCategoryNotFound: (name, courseName) =>
      L(`Fant ikke fagretning "${name}" i "${courseName}".`, `Could not find subject track "${name}" in "${courseName}".`),
    errSubmoduleNotFound: (name, categoryName) =>
      L(`Fant ikke modul "${name}" i "${categoryName}".`, `Could not find module "${name}" in "${categoryName}".`),
    noSubmissionsYet: (assignmentName) =>
      L(
        `Ingen innleveringer ennå for "${assignmentName}" - velg en annen oppgave.`,
        `No submissions yet for "${assignmentName}" - pick another assignment.`
      ),

    fetchingSubmissionsFor: (assignmentName) =>
      L(`Henter innleveringer for "${assignmentName}"...`, `Fetching submissions for "${assignmentName}"...`),

    setupUpdated: () =>
      L("Oppsett oppdatert. Kjør 'canvas-clone' på nytt for å fortsette.", "Setup updated. Run 'canvas-clone' again to continue."),
    shortcutTip: (cmd) => L(`\nSnarvei for å hoppe rett hit neste gang: ${cmd}`, `\nShortcut to jump straight here next time: ${cmd}`),
    nothingSelected: () => L("Ingenting valgt.", "Nothing selected."),
    noGithubLink: (name, assignmentName) =>
      L(`  – Ingen GitHub-lenke for ${name} (${assignmentName})`, `  – No GitHub link for ${name} (${assignmentName})`),
    reasonNoLink: () => L("ingen lenke funnet", "no link found"),
    skippedExists: (owner, repo) =>
      L(`  – Hopper over ${owner} (${repo}): mappe finnes allerede`, `  – Skipping ${owner} (${repo}): folder already exists`),
    cloning: (repo, dest) => L(`Kloner ${repo} -> ${dest}`, `Cloning ${repo} -> ${dest}`),
    cloned: (repo, via) => L(`Klonet ${repo} (${via})`, `Cloned ${repo} (${via})`),
    cloneFailed: (repo, error) => L(`Klarte ikke å klone ${repo}: ${error}`, `Failed to clone ${repo}: ${error}`),
    reasonCloneFailed: (repo, error) =>
      L(`klone-feil: ${repo} (${error})`, `clone error: ${repo} (${error})`),
    unexpectedItemError: (name, error) =>
      L(`  – Uventet feil for ${name}, hopper over: ${error}`, `  – Unexpected error for ${name}, skipping: ${error}`),
    reasonUnexpectedError: (error) =>
      L(`uventet feil: ${error}`, `unexpected error: ${error}`),
    skippedLog: (count) =>
      L(
        `\n${count} uten vellykket kloning – se uten_lenke.txt i hver oppgavemappe.`,
        `\n${count} without a successful clone – see uten_lenke.txt in each assignment folder.`
      ),
    doneBulk: (cloned, assignments) =>
      L(`\nFerdig. Klonet ${cloned} repo på tvers av ${assignments} oppgaver.`, `\nDone. Cloned ${cloned} repos across ${assignments} assignments.`),
    doneSingle: (cloned) => L(`\nFerdig. Klonet ${cloned} repo.`, `\nDone. Cloned ${cloned} repos.`),
    failedToOpen: (dest, editor) => L(`  Klarte ikke å åpne ${dest} i ${editor}`, `  Failed to open ${dest} in ${editor}`),
    openInEditorMessage: () => L("Åpne klonede repo i editor?", "Open cloned repos in editor?"),
    editorVsCode: () => "VS Code",
    editorZed: () => "Zed",
    editorNo: () => L("Nei", "No"),
    openTip: (editor) =>
      L(`(Tips: legg til "--open ${editor}" for å åpne automatisk neste gang.)`, `(Tip: add "--open ${editor}" to open automatically next time.)`),
    pickReposToOpenMessage: (editor) => L(`Hvilke repo vil du åpne i ${editor}?`, `Which repos do you want to open in ${editor}?`),

    aborted: () => L("\nAvbrutt.", "\nAborted."),
    genericError: (message) => L(`\nFeil: ${message}`, `\nError: ${message}`),

    // --- Førstegangsoppsett (src/config.js) ---
    setupIntro: () => L("Førstegangsoppsett av canvas-clone.\n", "First-time setup for canvas-clone.\n"),
    canvasUrlMessage: () => L("Canvas-URL (f.eks. https://din-skole.instructure.com):", "Canvas URL (e.g. https://your-school.instructure.com):"),
    canvasUrlValidate: () =>
      L("Må være en full URL som starter med http(s)://", "Must be a full URL starting with http(s)://"),
    canvasTokenMessage: () =>
      L("Canvas API-token (Account → Settings → New Access Token):", "Canvas API token (Account → Settings → New Access Token):"),
    canvasTokenValidate: () => L("Token kan ikke være tomt", "Token cannot be empty"),
    checkingToken: () => L("Sjekker token mot Canvas... ", "Checking token against Canvas... "),
    tokenCheckFailed: () => L("✗ feilet.", "✗ failed."),
    tokenInvalid: () =>
      L(
        "Klarte ikke å validere Canvas-URL/token. Sjekk at begge er riktige og prøv igjen.",
        "Could not validate Canvas URL/token. Check that both are correct and try again."
      ),
    loggedInAs: (name) => L(`✓ logget inn som ${name}.`, `✓ logged in as ${name}.`),
    editorPreferenceMessage: () => L("Standard editor å åpne klonede repo i?", "Default editor to open cloned repos in?"),
    editorAskEveryTime: () => L("Spør hver gang", "Ask every time"),
    joeModeSetupMessage: () => L("Starte med joeMode: true?", "Start with joeMode: true?"),
    savedTo: (path) => L(`\nLagret i ${path}\n`, `\nSaved to ${path}\n`),
  };
}
