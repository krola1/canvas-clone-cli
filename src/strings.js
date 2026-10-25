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
  --all-courses         Bulk-klon på tvers av ALLE kursene dine i stedet for ett enkelt kurs
                        (kan ikke kombineres med --course; mappestruktur blir
                        grading/<kurs>/<assignment_id>/<bruker>/ i stedet for
                        grading/<assignment_id>/<bruker>/)
  --assignment <id>     Klon denne ene oppgaven (krever --course)
  --category <navn>     Bulk-klon hele denne fagretningen, f.eks. "Frontend" (krever --course eller --all-courses)
  --submodule <navn>    Snevre bulk-kloningen inn til ett nivå/modul, f.eks. "modul 1" (krever --category)
  --all                 Bulk-klon ALT i kurset/kursene, uavhengig av fagretning (krever --course eller --all-courses)
  --generate            Ikke klon - bare skriv ut den tilsvarende kommandoen (kan kombineres med
                         --course for å fortsette interaktivt derfra, eller stå alene for full navigasjon)
  --open <editor>       Åpne alle klonede repo automatisk i denne editoren (f.eks. "code" eller "zed"),
                        uten å spørre hvilke eller bekrefte editor
  --temp                Rydd opp automatisk: når du trykker Enter i terminalen etter at du er
                        ferdig i editoren, slettes repoene som ble klonet i DENNE kjøringen
                        (repo som lå der fra før røres ikke)
  --github <brukernavn> Sett karakter/tilbakemelding ikke-interaktivt for denne studenten,
                        identifisert via GitHub-brukernavn (krever --course og --assignment,
                        kan ikke kombineres med --category/--all/--all-courses)
  --grade <verdi>       Ny karakter (brukes sammen med --github)
  --comment <tekst>     Tilbakemeldingstekst (brukes sammen med --github)
  --confirm             Send faktisk til Canvas (brukes sammen med --github). Uten dette
                        flagget vises bare en forhåndsvisning av hva som ville blitt sendt -
                        ingenting sendes til Canvas før --confirm er med
  --joe-mode            Kjører applikasjonen i Joe Mode

--assignment, --category og --all er gjensidig utelukkende.
--course og --all-courses er gjensidig utelukkende.
--grade, --comment og --confirm krever --github; --github krever --course og --assignment.
--generate kan ikke kombineres med --github/--grade/--comment/--confirm.

Eksempler:
  canvas-clone --course 557 --assignment 11030 --open code
  canvas-clone --course 557 --category "Frontend" --submodule "modul 1"
  canvas-clone --course 557 --all
  canvas-clone --all-courses --category "Frontend"
  canvas-clone --course 557 --all --open code --temp
  canvas-clone --generate
  canvas-clone --course 557 --assignment 11030 --github oladev --grade A --comment "Bra jobbet" --confirm

I menyer: ← for å gå tilbake, Esc for å avbryte programmet.
(I oppgavesøket er ← reservert for tekstmarkøren - bruk "← Tilbake"-valget der.)

Nederst i kurslisten finner du også "Generer en snarvei-kommando" - gjør
akkurat det samme som --generate, bare startet fra menyen i stedet for flagg.
Der finner du også "Bulk-klon på tvers av flere kurs" - interaktiv variant av
--all-courses, med samme fagretning/modul-navigasjon som for ett enkelt kurs.
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
  --all-courses         Bulk-clone across ALL your courses instead of a single one (cannot be
                        combined with --course; folder structure becomes
                        grading/<course>/<assignment_id>/<user>/ instead of
                        grading/<assignment_id>/<user>/)
  --assignment <id>     Clone this one assignment (requires --course)
  --category <name>     Bulk-clone this entire subject track, e.g. "Frontend" (requires --course or --all-courses)
  --submodule <name>    Narrow the bulk clone to one level/module, e.g. "modul 1" (requires --category)
  --all                 Bulk-clone EVERYTHING in the course(s), regardless of subject track (requires --course or --all-courses)
  --generate            Don't clone - just print the equivalent command (can be combined with
                         --course to continue interactively from there, or stand alone for full navigation)
  --open <editor>       Automatically open all cloned repos in this editor (e.g. "code" or "zed"),
                        without asking which ones or confirming the editor
  --temp                Clean up automatically: once you press Enter in the terminal after
                        you're done in the editor, the repos cloned during THIS run are
                        deleted (repos that already existed are left untouched)
  --github <username>   Set grade/feedback non-interactively for this student, identified by
                        GitHub username (requires --course and --assignment, cannot be
                        combined with --category/--all/--all-courses)
  --grade <value>       New grade (used together with --github)
  --comment <text>      Feedback text (used together with --github)
  --confirm             Actually send it to Canvas (used together with --github). Without
                        this flag only a preview of what would be sent is shown - nothing is
                        sent to Canvas until --confirm is included
  --joe-mode            Runs the application in Joe Mode

--assignment, --category and --all are mutually exclusive.
--course and --all-courses are mutually exclusive.
--grade, --comment and --confirm require --github; --github requires --course and --assignment.
--generate cannot be combined with --github/--grade/--comment/--confirm.

Examples:
  canvas-clone --course 557 --assignment 11030 --open code
  canvas-clone --course 557 --category "Frontend" --submodule "modul 1"
  canvas-clone --course 557 --all
  canvas-clone --all-courses --category "Frontend"
  canvas-clone --course 557 --all --open code --temp
  canvas-clone --generate
  canvas-clone --course 557 --assignment 11030 --github oladev --grade A --comment "Nice work" --confirm

In menus: ← to go back, Esc to quit the program.
(In the assignment search, ← is reserved for the text cursor - use the "← Back" entry instead.)

At the bottom of the course list you'll also find "Generate a shortcut command" -
does exactly the same as --generate, just started from the menu instead of a flag.
You'll also find "Bulk-clone across multiple courses" there - the interactive
equivalent of --all-courses, with the same subject track/module navigation as a
single course.
Bulk cloning is filtered by "bulkCloneFilter" in config.json (default: only
submissions that need grading).
`
      ),

    errAssignmentNeedsCourse: () =>
      L("Feil: --assignment krever at --course også er oppgitt.", "Error: --assignment requires --course to also be given."),
    errCategoryNeedsCourse: () =>
      L(
        "Feil: --category krever at --course eller --all-courses er oppgitt.",
        "Error: --category requires --course or --all-courses to be given."
      ),
    errSubmoduleNeedsCategory: () =>
      L("Feil: --submodule krever at --category også er oppgitt.", "Error: --submodule requires --category to also be given."),
    errAllNeedsCourse: () =>
      L("Feil: --all krever at --course eller --all-courses er oppgitt.", "Error: --all requires --course or --all-courses to be given."),
    errMutuallyExclusive: () =>
      L(
        "Feil: --assignment, --category og --all kan ikke kombineres.",
        "Error: --assignment, --category and --all cannot be combined."
      ),
    errCourseAndAllCoursesExclusive: () =>
      L(
        "Feil: --course og --all-courses kan ikke kombineres.",
        "Error: --course and --all-courses cannot be combined."
      ),
    errGithubNeedsCourseAndAssignment: () =>
      L(
        "Feil: --github krever at både --course og --assignment er oppgitt.",
        "Error: --github requires both --course and --assignment to be given."
      ),
    errGradeFlagsNeedGithub: () =>
      L(
        "Feil: --grade, --comment og --confirm krever at --github også er oppgitt.",
        "Error: --grade, --comment and --confirm require --github to also be given."
      ),
    errGithubExclusiveWithBulk: () =>
      L(
        "Feil: --github kan ikke kombineres med --category, --all eller --all-courses.",
        "Error: --github cannot be combined with --category, --all or --all-courses."
      ),
    errGradeFlagsNothingToSend: () =>
      L(
        "Feil: verken --grade eller --comment er oppgitt sammen med --github - ingenting å sende.",
        "Error: neither --grade nor --comment given together with --github - nothing to send."
      ),
    errGenerateExclusiveWithGithub: () =>
      L(
        "Feil: --generate kan ikke kombineres med --github/--grade/--comment/--confirm.",
        "Error: --generate cannot be combined with --github/--grade/--comment/--confirm."
      ),
    errGradeStudentNotFound: (github) =>
      L(
        `Fant ingen innlevering fra GitHub-brukeren "${github}" på denne oppgaven.`,
        `Found no submission from the GitHub user "${github}" on this assignment.`
      ),
    errGradeStudentNotSubmitted: (github) =>
      L(
        `"${github}" har ikke levert denne oppgaven ennå - ingenting å karaktersette.`,
        `"${github}" has not submitted this assignment yet - nothing to grade.`
      ),
    gradeDryRunNotice: () =>
      L(
        "\nDette var en forhåndsvisning - ingenting ble sendt til Canvas. Legg til --confirm for å faktisk sende.",
        "\nThis was a preview - nothing was sent to Canvas. Add --confirm to actually send it."
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
    crossCourseEntry: () =>
      L("🌐 Bulk-klon på tvers av flere kurs", "🌐 Bulk-clone across multiple courses"),
    crossCourseHeader: () => L("Kurs på tvers", "Cross-course"),
    pickCoursesForCrossCourseMessage: () =>
      L("Velg hvilke kurs som skal inkluderes:", "Select which courses to include:"),
    allCoursesLabel: (n) => L(`${n} valgte kurs`, `${n} selected courses`),
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
    tempWaitingMessage: (n) =>
      L(
        `\n(--temp) Trykk Enter her i terminalen når du er ferdig, så fjernes de ${n} repoene som ble klonet nå.`,
        `\n(--temp) Press Enter here in the terminal when you're done, then the ${n} repos cloned just now will be removed.`
      ),
    tempCleaned: (n) =>
      L(`Fjernet ${n} midlertidige repo.`, `Removed ${n} temporary repos.`),
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

    // --- Karaktersetting (bin/canvas-clone.js, src/canvas.js: gradeSubmission) ---
    gradeMenuEntry: () => L("🎓 Sett karakter/tilbakemelding", "🎓 Set grade/feedback"),
    quizGradingNotSupported: () =>
      L(
        "Quiz-oppgaver må rettes direkte i Canvas - karaktersetting er ikke tilgjengelig her for denne oppgaven.",
        "Quiz assignments must be graded directly in Canvas - grading is not available here for this assignment."
      ),
    pickStudentForGradeMessage: () => L("Velg student:", "Select student:"),
    currentGradeLabel: (grade) => L(`nåværende: ${grade}`, `current: ${grade}`),
    currentGradeDisplay: (grade) =>
      grade != null
        ? L(`Nåværende karakter: ${grade}`, `Current grade: ${grade}`)
        : L("Ingen karakter satt ennå.", "No grade set yet."),
    newGradeMessage: () => L("Ny karakter:", "New grade:"),
    feedbackCommentMessage: () =>
      L("Tilbakemelding (valgfritt, Enter for å hoppe over):", "Feedback (optional, press Enter to skip):"),
    gradeConfirmSummaryHeader: () => L("Oppsummering:", "Summary:"),
    gradeConfirmSummary: (student, assignmentName, courseName, grade, comment) =>
      L(
        `Student:       ${student}\nOppgave:       ${assignmentName}\nKurs:          ${courseName}\nNy karakter:   ${grade || "(ingen endring)"}\nTilbakemelding: ${comment || "(ingen)"}`,
        `Student:      ${student}\nAssignment:   ${assignmentName}\nCourse:       ${courseName}\nNew grade:    ${grade || "(no change)"}\nFeedback:     ${comment || "(none)"}`
      ),
    confirmGradeMessage: () =>
      L("Sette denne karakteren/tilbakemeldingen på Canvas?", "Set this grade/feedback on Canvas?"),
    gradeNothingToSend: () =>
      L("Verken karakter eller tilbakemelding oppgitt - ingenting å sende.", "Neither a grade nor feedback given - nothing to send."),
    gradeCancelled: () => L("Avbrutt - ingen karakter satt.", "Cancelled - no grade set."),
    gradingInProgress: () => L("Setter karakter...", "Setting grade..."),
    gradeSuccess: (student) => L(`Karakter satt for ${student}.`, `Grade set for ${student}.`),
    gradeFailed: (reason, detail) => {
      const reasonText =
        reason === "network"
          ? L("nettverksfeil", "network error")
          : reason === "invalid_token"
            ? L("ugyldig token", "invalid token")
            : L("uventet feil", "unexpected error");
      return L(
        `Klarte ikke å sette karakter (${reasonText}): ${detail}`,
        `Failed to set grade (${reasonText}): ${detail}`
      );
    },

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
        "Ugyldig token. Canvas avviste tokenet (401/403) - lag et nytt under Account → Settings → New Access Token.",
        "Invalid token. Canvas rejected the token (401/403) - create a new one under Account → Settings → New Access Token."
      ),
    tokenCheckNetworkError: (detail) =>
      L(
        `Nettverksfeil mot Canvas-URL-en. Sjekk at URL-en er riktig (stavefeil?) og at du har nettverkstilgang. (${detail})`,
        `Network error reaching the Canvas URL. Check that the URL is correct (typo?) and that you have network access. (${detail})`
      ),
    tokenCheckOtherError: (detail) =>
      L(
        `Uventet feil ved sjekk av Canvas-URL/token - er du sikker på at URL-en peker til en Canvas-instans? (${detail})`,
        `Unexpected error checking the Canvas URL/token - are you sure the URL points to a Canvas instance? (${detail})`
      ),
    loggedInAs: (name) => L(`✓ logget inn som ${name}.`, `✓ logged in as ${name}.`),
    gitMissingWarning: () =>
      L(
        "⚠ Fant ikke `git` på denne maskinen. canvas-clone trenger git for å klone repo - installer det før du fortsetter (se README, seksjonen «Feilsøking»).",
        "⚠ Could not find `git` on this machine. canvas-clone needs git to clone repos - install it before continuing (see README, «Troubleshooting» section)."
      ),
    editorPreferenceMessage: () => L("Standard editor å åpne klonede repo i?", "Default editor to open cloned repos in?"),
    editorAskEveryTime: () => L("Spør hver gang", "Ask every time"),
    joeModeSetupMessage: () => L("Starte med joeMode: true?", "Start with joeMode: true?"),
    savedTo: (path) => L(`\nLagret i ${path}\n`, `\nSaved to ${path}\n`),
  };
}
