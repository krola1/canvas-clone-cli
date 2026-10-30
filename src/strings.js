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
GitHub-repo til en egen øktmappe per kjøring,
~/canvas-clone/grading/<økt>/<assignment_id>/<eier>_<repo>/, og åpne
valgfritt i editor etterpå. Øktmappen slettes ALLTID når du er ferdig
(Enter i terminalen, Ctrl-C eller Esc), og rester etter en krasj ryddes
ved neste kjøring. Det finnes ingen måte å beholde repoene på.

  --setup               Kjør førstegangsoppsettet på nytt (bytt Canvas-URL/token/editor)
  --refresh             Ignorer cachet kurs-/oppgaveliste og hent ferske data fra Canvas
  --course <id>         Hopp rett til dette kurset (hopper over kursvalg)
  --all-courses         Bulk-klon på tvers av ALLE kursene dine i stedet for ett enkelt kurs
                        (kan ikke kombineres med --course; mappestruktur blir
                        <økt>/<kurs>/<assignment_id>/<eier>_<repo>/ i stedet for
                        <økt>/<assignment_id>/<eier>_<repo>/)
  --assignment <id>     Klon denne ene oppgaven (krever --course)
  --category <navn>     Bulk-klon hele denne fagretningen, f.eks. "Frontend" (krever --course eller --all-courses)
  --submodule <navn>    Snevre bulk-kloningen inn til ett nivå/modul, f.eks. "modul 1" (krever --category)
  --all                 Bulk-klon ALT i kurset/kursene, uavhengig av fagretning (krever --course eller --all-courses)
  --generate            Ikke klon - bare skriv ut den tilsvarende kommandoen (kan kombineres med
                         --course for å fortsette interaktivt derfra, eller stå alene for full navigasjon)
  --open <editor>       Åpne alle klonede repo automatisk i denne editoren (f.eks. "code" eller "zed"),
                        uten å spørre hvilke eller bekrefte editor. På Windows startes ingen
                        editor - kommandoen skrives ut i stedet
  --temp                Utfaset: gjør ingenting (øktmappen slettes nå alltid)
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
students' GitHub repos into a separate session folder per run,
~/canvas-clone/grading/<session>/<assignment_id>/<owner>_<repo>/, and
optionally open them in an editor afterwards. The session folder is ALWAYS
deleted when you are done (Enter in the terminal, Ctrl-C or Esc), and
leftovers after a crash are cleaned up on the next run. There is no way to
keep the repos.

  --setup               Re-run first-time setup (change Canvas URL/token/editor)
  --refresh             Ignore the cached course/assignment list and fetch fresh data from Canvas
  --course <id>         Jump straight to this course (skips course selection)
  --all-courses         Bulk-clone across ALL your courses instead of a single one (cannot be
                        combined with --course; folder structure becomes
                        <session>/<course>/<assignment_id>/<owner>_<repo>/ instead of
                        <session>/<assignment_id>/<owner>_<repo>/)
  --assignment <id>     Clone this one assignment (requires --course)
  --category <name>     Bulk-clone this entire subject track, e.g. "Frontend" (requires --course or --all-courses)
  --submodule <name>    Narrow the bulk clone to one level/module, e.g. "modul 1" (requires --category)
  --all                 Bulk-clone EVERYTHING in the course(s), regardless of subject track (requires --course or --all-courses)
  --generate            Don't clone - just print the equivalent command (can be combined with
                         --course to continue interactively from there, or stand alone for full navigation)
  --open <editor>       Automatically open all cloned repos in this editor (e.g. "code" or "zed"),
                        without asking which ones or confirming the editor. On Windows no
                        editor is started - the command is printed instead
  --temp                Deprecated: does nothing (the session folder is now always deleted)
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
    errGradeAmbiguousNoTty: (github, names) =>
      L(
        `Flere innleveringer peker på GitHub-brukeren "${github}":\n${names.map((n) => `  - ${n}`).join("\n")}\nKan ikke velge trygt uten en interaktiv terminal - ingenting ble sendt. Sett karakteren interaktivt i stedet.`,
        `Several submissions point to the GitHub user "${github}":\n${names.map((n) => `  - ${n}`).join("\n")}\nCannot choose safely without an interactive terminal - nothing was sent. Set the grade interactively instead.`
      ),
    gradeAmbiguousPreview: (github, names) =>
      L(
        `Flere innleveringer peker på GitHub-brukeren "${github}":\n${names.map((n) => `  - ${n}`).join("\n")}\nDette var en forhåndsvisning - ingenting ble sendt. Med --confirm får du velge eleven eksplisitt.`,
        `Several submissions point to the GitHub user "${github}":\n${names.map((n) => `  - ${n}`).join("\n")}\nThis was a preview - nothing was sent. With --confirm you will be asked to pick the student explicitly.`
      ),
    pickAmbiguousStudentMessage: (github) =>
      L(
        `Flere innleveringer peker på "${github}" - velg riktig elev (Canvas-navn):`,
        `Several submissions point to "${github}" - pick the right student (Canvas name):`
      ),
    gradeCandidateLabel: (canvasName, state, grade) =>
      grade != null
        ? L(`${canvasName} — ${state}, nåværende: ${grade}`, `${canvasName} — ${state}, current: ${grade}`)
        : L(`${canvasName} — ${state}`, `${canvasName} — ${state}`),
    gradeStudentLabel: (canvasName, github) =>
      github ? `${canvasName} (GitHub: ${github})` : canvasName,
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
    cloning: (repo, dest) => L(`Kloner ${repo} -> ${dest}`, `Cloning ${repo} -> ${dest}`),
    cloned: (repo, via) => L(`Klonet ${repo} (${via})`, `Cloned ${repo} (${via})`),
    cloneFailed: (repo, error) => L(`Klarte ikke å klone ${repo}: ${error}`, `Failed to clone ${repo}: ${error}`),
    cloneNoAccess: (repo) =>
      L(
        `Uten tilgang til ${repo}: repoet er privat, slettet eller feilstavet`,
        `No access to ${repo}: the repo is private, deleted or misspelled`
      ),
    reasonNoAccess: (repo) =>
      L(`uten tilgang: ${repo} (privat, slettet eller feilstavet repo)`, `no access: ${repo} (private, deleted or misspelled repo)`),
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
    tempDeprecated: () =>
      L(
        "Merk: --temp er utfaset og gjør ingenting - øktmappen slettes nå alltid når du er ferdig.",
        "Note: --temp is deprecated and does nothing - the session folder is now always deleted when you are done."
      ),
    sessionPathNotice: (p) =>
      L(`Øktmappe (slettes når du er ferdig): ${p}`, `Session folder (deleted when you are done): ${p}`),
    waitForEnterMessage: (p) =>
      L(
        `\nTrykk Enter her i terminalen når du er ferdig - da slettes hele øktmappen\n${p}\n(Ctrl-C eller Esc sletter den også.)`,
        `\nPress Enter here in the terminal when you are done - the whole session folder will then be deleted\n${p}\n(Ctrl-C or Esc deletes it too.)`
      ),
    sessionCleaned: () => L("Øktmappen er slettet.", "The session folder has been deleted."),
    cleanupFailed: (p, code) =>
      L(
        `⚠ Klarte ikke å slette ${p} (${code}). Den kan inneholde elevdata - slett den for hånd, eller kjør canvas-clone på nytt for å prøve igjen.`,
        `⚠ Could not delete ${p} (${code}). It may contain student data - delete it by hand, or run canvas-clone again to retry.`
      ),
    leftoversRemoved: (n) =>
      L(`Ryddet ${n} rester etter tidligere kjøringer.`, `Cleaned up ${n} leftovers from earlier runs.`),
    otherSessionsInUse: (n, root) =>
      L(
        `Merk: ${n} økt(er) fra andre kjøringer av canvas-clone ser ut til å pågå fortsatt og ble ikke rørt (${root}). De slettes når de kjøringene avslutter, eller ved neste kjøring etter at de er borte.`,
        `Note: ${n} session(s) from other canvas-clone runs appear to still be running and were not touched (${root}). They are deleted when those runs finish, or on the next run after they are gone.`
      ),
    unknownEntriesInRoot: (n, root) =>
      L(
        `⚠ ${n} fil(er)/mappe(r) i ${root} er ikke øktmapper fra canvas-clone og ble ikke rørt. canvas-clone legger aldri noe annet der - se over og slett dem for hånd hvis de ikke trengs.`,
        `⚠ ${n} file(s)/folder(s) in ${root} are not canvas-clone session folders and were not touched. canvas-clone never puts anything else there - review them and delete them by hand if they are not needed.`
      ),
    rootIsSymlink: (root) =>
      L(
        `⚠ ${root} (eller mappen over) er en symlenke. Rester etter tidligere kjøringer ryddes derfor ikke automatisk - sjekk mappen og slett gamle øktmapper for hånd.`,
        `⚠ ${root} (or the folder above it) is a symbolic link. Leftovers from earlier runs are therefore not cleaned up automatically - check the folder and delete old session folders by hand.`
      ),
    oldGradingWarning: (p) =>
      L(
        `⚠ Fant en mappe ${p}\n  Eldre versjoner av canvas-clone la elevrepoer og elevnavn (uten_lenke.txt) her.\n  Den ryddes IKKE automatisk. Er det en gammel canvas-clone-mappe, slett den for hånd:\n    rm -r ./grading                 (fish/bash/zsh)\n    Remove-Item -Recurse .\\grading  (PowerShell)`,
        `⚠ Found a folder ${p}\n  Older versions of canvas-clone put student repos and student names (uten_lenke.txt) here.\n  It is NOT cleaned up automatically. If it is an old canvas-clone folder, delete it by hand:\n    rm -r ./grading                 (fish/bash/zsh)\n    Remove-Item -Recurse .\\grading  (PowerShell)`
      ),
    cloneInterrupted: () =>
      L("\nKloningen ble avbrutt - sletter øktmappen.", "\nCloning was interrupted - deleting the session folder."),
    untrustedCodeWarning: () =>
      L(
        "⚠ Elevrepoer er kode du ikke har skrevet selv. Ikke kjør skript, npm install e.l. uten å ha sett over koden, og godta ikke editorens spørsmål om å «stole på» mappen uten videre.",
        "⚠ Student repos are code you did not write yourself. Do not run scripts, npm install etc. without reviewing the code, and do not just accept the editor's prompt to \"trust\" the folder."
      ),
    openWith: (cmd) => L(`  Åpne med: ${cmd}`, `  Open with: ${cmd}`),
    openWithIntro: () =>
      L(
        "På Windows startes ingen editor automatisk - kjør kommandoene under selv:",
        "On Windows no editor is started automatically - run the commands below yourself:"
      ),
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
      L("Må være en full URL som starter med https://", "Must be a full URL starting with https://"),
    errConfigNotHttps: () =>
      L(
        "Canvas-URL-en i config bruker ikke https://. Kjør canvas-clone --setup og oppgi en https://-URL.",
        "The Canvas URL in config does not use https://. Run canvas-clone --setup and enter an https:// URL."
      ),
    errForeignPageLink: (host) =>
      L(
        `Canvas svarte med en sidelenke til en annen vert (${host}) – avbrutt av sikkerhetshensyn.`,
        `Canvas responded with a page link to a different host (${host}) – aborted for security reasons.`
      ),
    tokenExpiryTip: () =>
      L(
        "Tips: lag tokenet med en utløpsdato (f.eks. slutten av semesteret), så slutter det å virke av seg selv.",
        "Tip: create the token with an expiry date (e.g. the end of the term), so it stops working on its own."
      ),
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

    // --- VS Code-utvidelsen (vscode/src/). Språket følger VS Code (vscode.env.language),
    // ikke joeMode. Gjenbruker canvasUrlMessage/canvasUrlValidate/tokenInvalid/
    // tokenCheck*Error over. Kommandotitlene står i vscode/package.json. ---
    vscSetupTitle: () => L("Canvas Clone: oppsett", "Canvas Clone: setup"),
    vscTokenPrompt: () =>
      L(
        "Canvas API-token (Account → Settings → New Access Token). Lag tokenet med en utløpsdato, f.eks. slutten av semesteret. Dette er et eget token for VS Code, ikke det samme som CLI-et bruker.",
        "Canvas API token (Account → Settings → New Access Token). Give the token an expiry date, e.g. the end of the term. This is a separate token for VS Code, not the one the CLI uses."
      ),
    vscCheckingToken: () => L("Sjekker tokenet mot Canvas …", "Checking the token against Canvas …"),
    vscSetupDone: (name) =>
      L(
        `Canvas Clone er satt opp. Logget inn som ${name}. Tokenet ligger i VS Codes hemmelighetslager (SecretStorage).`,
        `Canvas Clone is set up. Logged in as ${name}. The token is kept in VS Code's secret storage (SecretStorage).`
      ),
    vscSetupNothingSaved: () => L("Ingenting er lagret.", "Nothing was saved."),
    vscDeleted: () =>
      L(
        "Tokenet og Canvas-URL-en er slettet fra VS Code. Slett også tokenet i Canvas (Account → Settings → Approved Integrations), så kan det ikke brukes igjen.",
        "The token and the Canvas URL have been removed from VS Code. Also delete the token in Canvas (Account → Settings → Approved Integrations) so it can never be used again."
      ),
    vscTokenLost: () =>
      L(
        "Canvas Clone: tokenet mangler i dette vinduet, selv om oppsettet er gjort før. Sannsynligvis har systemet ingen nøkkelring (keyring), så VS Code holdt tokenet bare i minnet, og det forsvant da VS Code ble lukket (eller finnes bare i vinduet der det ble lagt inn). Kjør oppsettet på nytt. Se README om nøkkelring.",
        "Canvas Clone: the token is missing in this window, although setup was done before. Most likely the system has no keyring, so VS Code kept the token in memory only, and it was lost when VS Code closed (or exists only in the window where it was entered). Run setup again. See the README about keyrings."
      ),
    vscRunSetup: () => L("Kjør oppsett", "Run setup"),

    // --- VS Code-utvidelsen, økter (D4) ---
    vscSessionWarning: () =>
      L(
        "Elevkoden åpnes nå i et eget vindu uten tillit (Restricted Mode). Slik holder du det trygt:",
        "The student code now opens in a separate window without trust (Restricted Mode). To keep it safe:"
      ),
    vscSessionWarningDetail: () =>
      L(
        "• Ikke trykk «Trust» / «Yes, I trust the authors», heller ikke når VS Code spør fra en task, debug eller terminalen.\n• Ikke installer utvidelser som elevrepoet anbefaler.\n• Ikke åpne et elevrepo som egen mappe. Bruk øktvinduet.\n• Vær forsiktig med KI-assistenter og agenter i øktvinduet: elevrepoer kan inneholde instruksjoner til dem (f.eks. AGENTS.md).\n• Gi aldri tillit til ~/canvas-clone eller en mappe over den.\nNår du er ferdig, trykk «Ferdig med økten» nederst i øktvinduet. Da slettes økten.",
        "• Do not press «Trust» / «Yes, I trust the authors», not even when VS Code asks from a task, debug or the terminal.\n• Do not install extensions the student repo recommends.\n• Do not open a student repo as a folder of its own. Use the session window.\n• Be careful with AI assistants and agents in the session window: student repos may contain instructions for them (e.g. AGENTS.md).\n• Never trust ~/canvas-clone or a folder above it.\nWhen you are done, press «Done with session» at the bottom of the session window. The session is then deleted."
      ),
    vscSessionUnderstood: () => L("Jeg forstår, åpne økten", "I understand, open the session"),
    vscTrustDisabled: () =>
      L(
        "Workspace Trust er slått av i VS Code (security.workspace.trust.enabled). Da kan elevkode kjøres i øktvinduet uten at du blir spurt. Slå det på igjen, eller åpne bare hvis du vet hva du gjør.",
        "Workspace Trust is turned off in VS Code (security.workspace.trust.enabled). Student code can then run in the session window without asking. Turn it back on, or open only if you know what you are doing."
      ),
    vscOpenAnyway: () => L("Åpne likevel", "Open anyway"),
    vscSessionTrusted: () =>
      L(
        "Dette øktvinduet er betrodd (Workspace Trust). Da kan VS Code og utvidelser kjøre elevkode. Lukk økten?",
        "This session window is trusted (Workspace Trust). VS Code and extensions can then run student code. Close the session?"
      ),
    vscSessionTrustedDetail: () =>
      L(
        "Tilliten kan komme fra «Trust»-dialogen, fra en betrodd mappe over økten (f.eks. hjemmemappen) eller fra at Workspace Trust er slått av. Fjern den under «Workspaces: Manage Workspace Trust». Bare «Fortsett likevel» lar økten fortsette; Escape og Avbryt lukker den.",
        "The trust can come from the «Trust» dialog, from a trusted folder above the session (e.g. your home folder) or from Workspace Trust being turned off. Remove it under «Workspaces: Manage Workspace Trust». Only «Continue anyway» keeps the session; Escape and Cancel close it."
      ),
    vscCloseSession: () => L("Lukk økten", "Close the session"),
    vscContinueSession: () => L("Fortsett likevel", "Continue anyway"),
    vscDoneButton: () => L("Ferdig med økten", "Done with session"),
    vscDoneTooltip: () =>
      L(
        "Canvas Clone: lukk dette vinduet og slett økten (elevrepoene) fra disken",
        "Canvas Clone: close this window and delete the session (the student repos) from disk"
      ),
    vscDoneUnsaved: (n) =>
      L(
        `${n} ${n === 1 ? "fil" : "filer"} i økten er ikke lagret. Økten slettes når du er ferdig, så endringene går tapt. Lukk editorene først (VS Code spør om hver fil).`,
        `${n} ${n === 1 ? "file" : "files"} in the session ${n === 1 ? "is" : "are"} not saved. The session is deleted when you are done, so the changes will be lost. Close the editors first (VS Code asks about each file).`
      ),
    vscCloseEditors: () => L("Lukk editorene og avslutt", "Close the editors and finish"),
    vscDoneStillUnsaved: () =>
      L(
        "Økten er ikke avsluttet: noen filer er fortsatt ikke lagret.",
        "The session was not finished: some files are still unsaved."
      ),
    vscDoneNotClosed: () =>
      L(
        "Øktvinduet ble ikke lukket, så økten fortsetter. Trykk «Ferdig med økten» igjen når du vil avslutte.",
        "The session window was not closed, so the session continues. Press «Done with session» again when you want to finish."
      ),
    vscDoneOnlyInSession: () =>
      L(
        "«Ferdig med økten» brukes i øktvinduet (vinduet med elevrepoene).",
        "«Done with session» is used in the session window (the window with the student repos)."
      ),
    vscSessionEnded: () =>
      L(
        "Canvas Clone: denne økten er avsluttet og blir slettet. Vinduet lukkes.",
        "Canvas Clone: this session has ended and will be deleted. The window will close."
      ),
    vscSessionDeleted: () =>
      L(
        "Canvas Clone: økten er slettet fra disken. Vinduet lukkes.",
        "Canvas Clone: the session has been deleted from disk. The window will close."
      ),
    vscRootSymlink: (root) =>
      L(
        `Canvas Clone: ${root} (eller ~/canvas-clone) er en symlenke. Gamle økter ryddes derfor ikke automatisk. Økter du avslutter med «Ferdig med økten», slettes fortsatt.`,
        `Canvas Clone: ${root} (or ~/canvas-clone) is a symlink. Old sessions are therefore not cleaned up automatically. Sessions you finish with «Done with session» are still deleted.`
      ),
    vscDeleteFailed: () =>
      L(
        "Canvas Clone: en avsluttet økt kunne ikke slettes. Det prøves igjen, også neste gang VS Code starter.",
        "Canvas Clone: a finished session could not be deleted. It will be retried, also the next time VS Code starts."
      ),

    // --- VS Code-utvidelsen, bla og klone (D5). Gjenbruker CLI-ets tekster for
    // kurs, fagretning, filter, omfang og uten_lenke.txt der de passer. ---
    vscOutputName: () => "Canvas Clone",
    vscOnlyInMainWindow: () =>
      L(
        "Dette gjøres fra hovedvinduet (ikke øktvinduet med elevrepoene).",
        "This is done from the main window (not the session window with the student repos)."
      ),
    vscNeedsSetup: () =>
      L(
        "Canvas Clone er ikke satt opp i dette vinduet: Canvas-URL eller token mangler.",
        "Canvas Clone is not set up in this window: the Canvas URL or token is missing."
      ),
    vscCanvasError: (detail) => L(`Feil fra Canvas: ${detail}`, `Error from Canvas: ${detail}`),
    vscCacheNote: (minutes) =>
      minutes < 1
        ? L("Kurslisten er hentet akkurat nå (cache). «Oppdater» henter ferske data.", "Course list fetched just now (cache). «Refresh» fetches fresh data.")
        : L(
            `Kurslisten er ${minutes} min gammel (cache). «Oppdater» henter ferske data.`,
            `The course list is ${minutes} min old (cache). «Refresh» fetches fresh data.`
          ),
    vscNoSubmissions: () => L("Ingen innleveringer ennå.", "No submissions yet."),
    vscGraded: () => L("vurdert", "graded"),
    vscSubmissionTooltip: (studentName, owner) => `${studentName} (GitHub: ${owner})`,
    vscSubmissionTooltipNoLink: (studentName) =>
      L(`${studentName} (ingen GitHub-lenke funnet)`, `${studentName} (no GitHub link found)`),
    vscBulkFilterTitle: (n) =>
      L(`Klon i bulk: ${n} ${n === 1 ? "oppgave" : "oppgaver"}`, `Bulk clone: ${n} ${n === 1 ? "assignment" : "assignments"}`),
    vscBulkFilterPlaceholder: () => L("Hvilke innleveringer skal klones?", "Which submissions should be cloned?"),
    vscCloneScopeTitle: (assignmentName) => L(`Klon: ${assignmentName}`, `Clone: ${assignmentName}`),
    vscCloneAllInList: (n) =>
      L(`📦 Klon alle i denne listen (${n} oppgaver)`, `📦 Clone all in this list (${n} assignments)`),
    vscNothingToClone: (filterLabel, n) =>
      L(
        `Ingen innleveringer å klone (filter: ${filterLabel}, ${n} ${n === 1 ? "oppgave" : "oppgaver"}).`,
        `No submissions to clone (filter: ${filterLabel}, ${n} ${n === 1 ? "assignment" : "assignments"}).`
      ),
    vscConfirmLargeClone: (count, filterLabel, assignments) =>
      L(
        `Klone ${count} innleveringer (filter: ${filterLabel}) fra ${assignments} ${assignments === 1 ? "oppgave" : "oppgaver"}? Alt havner i én ny økt, som slettes når du trykker «Ferdig med økten».`,
        `Clone ${count} submissions (filter: ${filterLabel}) from ${assignments} ${assignments === 1 ? "assignment" : "assignments"}? Everything goes into one new session, which is deleted when you press «Done with session».`
      ),
    vscCloneButton: (n) => L(`Klon ${n}`, `Clone ${n}`),
    vscCloningTitle: (n) => L(`Canvas Clone: kloner ${n} innleveringer`, `Canvas Clone: cloning ${n} submissions`),
    vscCloneProgress: (done, total) => L(`${done} av ${total} ferdig`, `${done} of ${total} done`),
    vscCloneBusy: () =>
      L("En kloning pågår allerede i dette vinduet.", "A clone is already running in this window."),
    vscGitMissing: () =>
      L(
        "Fant ikke git på denne maskinen. Canvas Clone trenger git for å klone repoene. Installer git og start VS Code på nytt.",
        "Could not find git on this machine. Canvas Clone needs git to clone the repos. Install git and restart VS Code."
      ),
    vscReasonCloneFailed: (repo) =>
      L(`klone-feil: ${repo} (nettverk, disk eller git)`, `clone error: ${repo} (network, disk or git)`),
    vscCloneSummary: (o) =>
      L(
        `Klonet ${o.klonet} av ${o.totalt}. Uten lenke: ${o.utenLenke}, uten tilgang: ${o.utenTilgang}, klone-feil: ${o.kloneFeil}.${o.klonet < o.totalt ? " Se uten_lenke.txt i oppgavemappene i økten." : ""}`,
        `Cloned ${o.klonet} of ${o.totalt}. No link: ${o.utenLenke}, no access: ${o.utenTilgang}, clone errors: ${o.kloneFeil}.${o.klonet < o.totalt ? " See uten_lenke.txt in the assignment folders of the session." : ""}`
      ),
    vscUnexpectedError: (detail) => L(`Uventet feil: ${detail}`, `Unexpected error: ${detail}`),
    vscSessionGone: () =>
      L(
        "Økten kunne ikke åpnes (den finnes ikke lenger eller er ødelagt). Klon på nytt.",
        "The session could not be opened (it no longer exists or is damaged). Clone again."
      ),
    vscSessionOpenFailed: () =>
      L(
        "Økten kunne ikke åpnes i et nytt vindu, og er slettet. Prøv igjen.",
        "The session could not be opened in a new window, and has been deleted. Try again."
      ),
    vscLogDeleteFailed: (oktNavn) =>
      `${L("sletting feilet", "delete failed")} ${oktNavn}: ${L("prøves igjen av ryddingen", "will be retried by the cleanup")}`,
    vscOpenSessionAnyway: () => L("Åpne økten likevel", "Open the session anyway"),
    vscCloneCancelled: () =>
      L("Kloningen ble avbrutt, og økten er slettet.", "The clone was cancelled, and the session has been deleted."),
    vscSessionDiscarded: () =>
      L("Økten ble ikke åpnet, og er slettet.", "The session was not opened, and has been deleted."),
    // Til OutputChannel: bare øktnavn og antall (T11).
    vscLogSummary: (oktNavn, o) =>
      `${L("kloning", "clone")} ${oktNavn}: ${L("klonet", "cloned")} ${o.klonet}/${o.totalt}, ${L("uten lenke", "no link")} ${o.utenLenke}, ${L("uten tilgang", "no access")} ${o.utenTilgang}, ${L("klone-feil", "clone errors")} ${o.kloneFeil}`,
    vscLogCancelled: (oktNavn, o) =>
      `${L("kloning", "clone")} ${oktNavn}: ${L("avbrutt etter", "cancelled after")} ${o.totalt - o.avbrutt}/${o.totalt}, ${L("økten er slettet", "the session has been deleted")}`,

    // --- VS Code-utvidelsen, T12 (D5): begge røttene under ~/canvas-clone ---
    vscLeftoversTitle: () =>
      L("Canvas Clone: dette ligger under ~/canvas-clone", "Canvas Clone: this is what is under ~/canvas-clone"),
    vscLeftoversPlaceholder: () =>
      L(
        "Økter som er åpne i et vindu, røres aldri. Velg «Slett alle økter nå» for å slette resten.",
        "Sessions open in a window are never touched. Choose «Delete all sessions now» to delete the rest."
      ),
    vscDeleteAllNow: () => L("Slett alle økter nå …", "Delete all sessions now …"),
    vscShowLeftovers: () => L("Vis hva som ble liggende", "Show what was left behind"),
    vscLeftoverNone: () => L("(ingen økter)", "(no sessions)"),
    vscLeftoverUnknown: (n) =>
      L(`${n} andre filer/mapper (ikke fra Canvas Clone, røres ikke)`, `${n} other files/folders (not from Canvas Clone, not touched)`),
    vscLeftoverRootSymlink: () =>
      L("Roten (eller ~/canvas-clone) er en symlenke: gamle økter slettes ikke her", "The root (or ~/canvas-clone) is a symlink: old sessions are not deleted here"),
    vscLeftoverStatus: (status) =>
      ({
        slettes: L("slettes nå", "will be deleted now"),
        apen: L("åpen i et vindu (røres ikke)", "open in a window (not touched)"),
        lukket: L("lukket nylig, slettes automatisk innen ca. 3 min", "closed recently, deleted automatically within about 3 min"),
        holdt: L("kloning pågår eller venter på å åpnes", "cloning or waiting to be opened"),
        avslutter: L("avsluttes nå («Ferdig»)", "finishing now («Done»)"),
        venter: L("vurderes om litt (VS Code startet eller våknet nettopp)", "checked shortly (VS Code just started or woke up)"),
        rest: L("rest uten markør, slettes automatisk når den er gammel nok", "leftover without marker, deleted automatically when old enough"),
        symlenke: L("ikke slettet: roten er en symlenke", "not deleted: the root is a symlink"),
        i_bruk: L("i bruk (en CLI-kjøring pågår)", "in use (a CLI run is in progress)"),
        sandkasse: L("ikke vurdert: VS Code kjører i en sandkasse", "not checked: VS Code runs in a sandbox"),
      })[status] ?? status,
    vscNothingLeft: () =>
      L("Ingenting ble liggende under ~/canvas-clone.", "Nothing was left behind under ~/canvas-clone."),
    vscNothingToDelete: (kept) =>
      kept > 0
        ? L(
            `Ingenting kan slettes nå. ${kept} ${kept === 1 ? "økt er" : "økter er"} i bruk eller slettes automatisk snart.`,
            `Nothing can be deleted now. ${kept} ${kept === 1 ? "session is" : "sessions are"} in use or will be deleted automatically soon.`
          )
        : L("Ingenting å slette.", "Nothing to delete."),
    vscDeleteAllConfirm: (nVscode, nGrading) =>
      L(
        `Slette ${nVscode + nGrading} ${nVscode + nGrading === 1 ? "økt" : "økter"} med elevrepoer (${nVscode} fra VS Code, ${nGrading} fra CLI-et)?`,
        `Delete ${nVscode + nGrading} ${nVscode + nGrading === 1 ? "session" : "sessions"} with student repos (${nVscode} from VS Code, ${nGrading} from the CLI)?`
      ),
    vscDeleteAllDetail: (kept) =>
      L(
        `Økter som er åpne i et vindu, og CLI-kjøringer som pågår, røres ikke${kept > 0 ? ` (${kept} beholdes nå)` : ""}. Lagrede endringer i elevrepoene går tapt.`,
        `Sessions open in a window, and CLI runs in progress, are not touched${kept > 0 ? ` (${kept} kept now)` : ""}. Saved changes in the student repos are lost.`
      ),
    vscDeleteButton: () => L("Slett", "Delete"),
    vscDeleteAllDone: (deleted, failed, left) =>
      L(
        `Slettet ${deleted}.${failed > 0 ? ` ${failed} kunne ikke slettes (prøves igjen).` : ""}${left > 0 ? ` ${left} ligger igjen.` : ""}`,
        `Deleted ${deleted}.${failed > 0 ? ` ${failed} could not be deleted (will be retried).` : ""}${left > 0 ? ` ${left} left.` : ""}`
      ),
    vscGradingSandboxed: () =>
      L(
        "VS Code kjører i en sandkasse (Flatpak) og kan ikke se om CLI-et kjører, så ~/canvas-clone/grading røres ikke herfra. Kjør canvas-clone i terminalen for å rydde der.",
        "VS Code runs in a sandbox (Flatpak) and cannot see whether the CLI is running, so ~/canvas-clone/grading is not touched from here. Run canvas-clone in a terminal to clean up there."
      ),
    vscLogDeleteAll: (deleted, failed, left) =>
      `${L("slett alle nå", "delete all now")}: ${L("slettet", "deleted")} ${deleted}, ${L("feilet", "failed")} ${failed}, ${L("igjen", "left")} ${left}`,

    // --- VS Code-utvidelsen, karakterpanelet (D6, ren logikk i vscode/src/panel.mjs) ---
    // Ingen av disse tar imot tekst fra webviewen eller fra innleveringen (T-A, T10).
    vscPanelTitle: () => L("Canvas Clone: karakter", "Canvas Clone: grade"),
    vscPanelCourse: () => L("Kurs", "Course"),
    vscPanelAssignment: () => L("Oppgave", "Assignment"),
    vscPanelStudent: () => L("Student", "Student"),
    vscPanelStatus: () => L("Status", "Status"),
    vscPanelGradeField: () => L("Ny karakter", "New grade"),
    vscPanelCommentField: () => L("Tilbakemelding (valgfritt)", "Feedback (optional)"),
    vscPanelSend: () => L("Send til Canvas …", "Send to Canvas …"),
    vscPanelInvalidMessage: () =>
      L("Panelet sendte en ugyldig melding. Ingenting ble sendt til Canvas.", "The panel sent an invalid message. Nothing was sent to Canvas."),
    vscPanelStale: () =>
      L(
        "Panelet viser nå en annen elev enn skjemaet ble fylt ut for. Ingenting ble sendt; fyll ut skjemaet på nytt.",
        "The panel now shows a different student than the form was filled in for. Nothing was sent; fill in the form again."
      ),
    vscPanelNoBinding: () =>
      L("Panelet er ikke koblet til noen innlevering. Velg en innlevering i trevisningen.", "The panel is not linked to a submission. Pick a submission in the tree view."),
    vscPanelNotSubmitted: () =>
      L("Denne eleven har ikke levert, så karakter kan ikke settes her.", "This student has not submitted, so a grade cannot be set here."),
    vscPanelSubmissionGone: () =>
      L(
        "Innleveringen finnes ikke lenger i Canvas (eller er trukket tilbake). Ingenting ble sendt.",
        "The submission no longer exists in Canvas (or has been withdrawn). Nothing was sent."
      ),
    vscPanelSubmissionAmbiguous: () =>
      L("Canvas ga flere innleveringer for samme elev. Ingenting ble sendt.", "Canvas returned several submissions for the same student. Nothing was sent."),
    vscPanelGradeChanged: (shown, now) =>
      L(
        `Advarsel: karakteren er endret i Canvas siden panelet ble vist (da: ${shown ?? "ingen"}, nå: ${now ?? "ingen"}). Sender du, overskrives den.`,
        `Warning: the grade has changed in Canvas since the panel was shown (then: ${shown ?? "none"}, now: ${now ?? "none"}). Sending overwrites it.`
      ),
    vscPanelRepoChanged: () =>
      L(
        "Advarsel: eleven har levert en annen GitHub-lenke siden panelet ble vist.",
        "Warning: the student has submitted a different GitHub link since the panel was shown."
      ),
    vscPanelConfirmWarning: () =>
      L("Noe er endret i Canvas. Sette denne karakteren/tilbakemeldingen likevel?", "Something has changed in Canvas. Set this grade/feedback anyway?"),
    vscPanelConfirmButton: () => L("Send", "Send"),
    vscPanelCommentTruncated: (shown, total) =>
      L(`… (viser ${shown} av ${total} tegn)`, `… (showing ${shown} of ${total} characters)`),
  };
}
