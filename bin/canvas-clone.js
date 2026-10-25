#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { select, search, checkbox, input, confirm } from "@inquirer/prompts";
import ora from "ora";
import { ensureConfig, loadConfig } from "../src/config.js";
import { listTeacherCoursesWithAssignments, listSubmissions, gradeSubmission } from "../src/canvas.js";
import { extractRepo, cloneRepo } from "../src/github.js";
import { openInEditor } from "../src/editor.js";
import { loadCourseCache, saveCourseCache, isFresh, ageMinutes } from "../src/cache.js";
import { buildCategoryTree } from "../src/categories.js";
import { createStrings } from "../src/strings.js";
import { mapWithConcurrency } from "../src/concurrency.js";

const BACK = Symbol("back");
const BULK_ALL = Symbol("bulk_all");
const ENTER_GENERATE_MODE = Symbol("enter_generate_mode");
const ENTER_CROSS_COURSE_MODE = Symbol("enter_cross_course_mode");

const { values } = parseArgs({
  options: {
    setup: { type: "boolean", default: false },
    refresh: { type: "boolean", default: false },
    course: { type: "string" },
    "all-courses": { type: "boolean", default: false },
    assignment: { type: "string" },
    category: { type: "string" },
    submodule: { type: "string" },
    all: { type: "boolean", default: false },
    generate: { type: "boolean", default: false },
    open: { type: "string" },
    temp: { type: "boolean", default: false },
    "joe-mode": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

const joeMode = values["joe-mode"] || (loadConfig()?.joeMode ?? false);
const t = createStrings(joeMode);

if (values.help) {
  console.log(t.help());
  process.exit(0);
}

if (values.course && values["all-courses"]) {
  console.error(t.errCourseAndAllCoursesExclusive());
  process.exit(1);
}
if (values.assignment && !values.course) {
  console.error(t.errAssignmentNeedsCourse());
  process.exit(1);
}
if (values.category && !values.course && !values["all-courses"]) {
  console.error(t.errCategoryNeedsCourse());
  process.exit(1);
}
if (values.submodule && !values.category) {
  console.error(t.errSubmoduleNeedsCategory());
  process.exit(1);
}
if (values.all && !values.course && !values["all-courses"]) {
  console.error(t.errAllNeedsCourse());
  process.exit(1);
}
if ([values.assignment, values.category, values.all].filter(Boolean).length > 1) {
  console.error(t.errMutuallyExclusive());
  process.exit(1);
}

// --- Esc avbryter hele programmet. ← går ett steg tilbake, men bare i
// vanlige list-menyer (select/checkbox) - i oppgavesøket må venstre-pil
// fortsatt kunne flytte tekstmarkøren, så der brukes et eksplisitt
// "← Tilbake"-valg i stedet. ---------------------------------------------
const quitController = new AbortController();
let activeBackController = null;

process.stdin.on("keypress", (_str, key) => {
  if (key?.name === "escape") {
    quitController.abort();
  } else if (key?.name === "left" && activeBackController && !activeBackController.signal.aborted) {
    activeBackController.abort();
  }
});

function anySignal(signals) {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

// Kjører en select/checkbox-prompt der ← avbryter til BACK i stedet for å
// flytte markør (de promptene har ingen tekstfelt, så venstre-pil er ledig).
async function withBackKey(runPrompt) {
  const backController = new AbortController();
  activeBackController = backController;
  const combined = anySignal([quitController.signal, backController.signal]);
  try {
    return await runPrompt(combined);
  } catch (err) {
    if (err.name === "AbortPromptError" && backController.signal.aborted) return BACK;
    throw err;
  } finally {
    if (activeBackController === backController) activeBackController = null;
  }
}

// --- Småhjelpere -------------------------------------------------------------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const colorize = (text, code) => (useColor ? `${code}${text}\x1b[0m` : text);
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";

function sortByGrading(list) {
  return [...list].sort((a, b) => (b.needsGrading ?? 0) - (a.needsGrading ?? 0));
}

function formatAssignmentLine(a) {
  const name = a.name.length > 58 ? a.name.slice(0, 55) + "…" : a.name;
  const namePart = name.padEnd(59);
  const dueText = a.dueAt ? new Date(a.dueAt).toLocaleDateString(joeMode ? "en-US" : "nb-NO") : t.noDueDate();
  const duePart = `${t.dueLabel()} ${dueText}`.padEnd(22);
  return `${namePart} ${duePart} ${t.gradingLabel(a.needsGrading)}`;
}

// Viser hvor i hierarkiet vi er, pluss en kort tastehjelp for steget. Tømmer
// skjermen for tidligere steg først, slik at terminalen ikke fylles opp med
// menyer vi har forlatt - bare det aktive steget er synlig om gangen.
function renderHeader(parts, { backable }) {
  if (process.stdout.isTTY) console.clear();
  const path = parts.filter(Boolean).join(" › ");
  console.log(colorize(`${path}   (${backable ? t.backHint() : t.quitHint()})`, DIM));
}

// Navnet vi faktisk viser for en innlevering. Default er GitHub-brukernavnet
// (utledet av extractRepo), siden det er det man trenger for å identifisere
// mappen man skal inn i - Canvas-navnet brukes bare som fallback når det ikke
// er funnet noen repo-lenke ennå, eller hvis displayName er satt til "canvas".
function displayName(sub, config) {
  if (config.displayName === "canvas") return sub.studentName;
  return sub.owner ?? sub.studentName;
}

// Gjør et kursnavn trygt å bruke som mappenavn (cross-course-struktur:
// grading/<kurs>/<assignment_id>/<bruker>/).
function sanitizeFolderName(name) {
  return name.replace(/[/\\:*?"<>|]+/g, "_").trim();
}

// --temp: venter på Enter i terminalen (IKKE `code --wait`/en Zed-ekvivalent,
// se DECISIONS.md) før repoene som faktisk ble klonet i DENNE kjøringen
// ryddes opp. Rører aldri repo som lå der fra før.
function waitForEnter() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

async function cleanupTemp(cloned) {
  if (cloned.length === 0) return;
  console.log(colorize(t.tempWaitingMessage(cloned.length), DIM));
  await waitForEnter();
  for (const c of cloned) {
    rmSync(c.dest, { recursive: true, force: true });
  }
  console.log(t.tempCleaned(cloned.length));
}

// --- Steg 1: kurs -------------------------------------------------------------
async function getCourses(config) {
  const cached = values.refresh ? null : loadCourseCache(config);
  const usedCache = isFresh(cached, config.cacheTtlMinutes);
  let courses;

  if (usedCache) {
    courses = cached.courses;
  } else {
    const spinner = ora(t.fetchingCourses()).start();
    courses = await listTeacherCoursesWithAssignments(config, (done, total) => {
      spinner.text = t.fetchingCoursesProgress(done, total);
    });
    spinner.stop();
    saveCourseCache(config, courses);
  }

  if (courses.length === 0) throw new Error(t.noCoursesFound());
  return { courses, usedCache, cached };
}

async function pickCourse(config, mode) {
  const { courses, usedCache, cached } = await getCourses(config);

  renderHeader(["Canvas"], { backable: false });
  if (usedCache) {
    console.log(colorize(t.cacheNote(ageMinutes(cached)), DIM));
  }

  const choices = sortByGrading(courses).map((c) => ({
    name: `${c.name} — ${t.gradingLabel(c.needsGrading)}`,
    value: c,
  }));
  choices.push({ name: t.crossCourseEntry(), value: ENTER_CROSS_COURSE_MODE });
  if (mode !== "generate") {
    choices.push({ name: t.generateEntry(), value: ENTER_GENERATE_MODE });
  }

  return select({ message: t.pickCourseMessage(), choices }, { signal: quitController.signal });
}

// Lar brukeren velge flere kurs å bulk-klone på tvers av (steg 4). Returnerer
// BACK hvis avbrutt eller ingenting ble valgt.
async function pickCoursesForCrossCourse(config) {
  const { courses } = await getCourses(config);

  const choices = sortByGrading(courses).map((c) => ({
    name: `${c.name} — ${t.gradingLabel(c.needsGrading)}`,
    value: c,
  }));

  renderHeader([t.crossCourseHeader()], { backable: true });
  const chosen = await withBackKey((signal) =>
    checkbox({ message: t.pickCoursesForCrossCourseMessage(), choices }, { signal })
  );
  if (chosen === BACK || chosen.length === 0) return BACK;
  return chosen;
}

// Bygger en "pseudo-kurs" som slår sammen oppgaver fra flere kurs til ett
// kategori-tre (fagretning/modul beholdes, bare med data fra flere kurs).
// Hver oppgave merkes med hvilket ekte kurs den kommer fra (courseId/
// courseName), slik at innleveringshenting og mappestruktur
// (grading/<kurs>/<assignment_id>/...) fortsatt vet hvor den hører hjemme.
function buildCrossCourseCourse(courses, t) {
  const assignments = courses.flatMap((c) =>
    c.assignments.map((a) => ({ ...a, courseId: c.id, courseName: c.name }))
  );
  return { id: null, name: t.allCoursesLabel(courses.length), assignments, crossCourse: true };
}

// --- Steg 2: fagretning --------------------------------------------------------
async function pickCategory(course) {
  const { categories, uncategorized } = buildCategoryTree(course.assignments);

  const choices = [
    { name: t.allAssignments(), value: { type: "all" } },
    ...sortByGrading(categories).map((c) => ({
      name: `${c.fagretning} — ${t.gradingLabel(c.needsGrading)} (${c.all.length})`,
      value: { type: "category", ...c },
    })),
  ];

  if (uncategorized.length > 0) {
    const needsGrading = uncategorized.reduce((sum, a) => sum + a.needsGrading, 0);
    choices.push({
      name: `${t.uncategorized()} — ${t.gradingLabel(needsGrading)} (${uncategorized.length})`,
      value: {
        type: "category",
        fagretning: t.uncategorized(),
        all: uncategorized,
        needsGrading,
        hasSubmodules: false,
      },
    });
  }

  renderHeader([course.name], { backable: true });
  return withBackKey((signal) => select({ message: t.pickCategoryMessage(), choices }, { signal }));
}

// --- Steg 3: modul/nivå --------------------------------------------------------
async function pickSubmodule(course, category) {
  const entries = [...category.modulMap.entries()].map(([modul, list]) => ({
    modul,
    list,
    needsGrading: list.reduce((sum, a) => sum + a.needsGrading, 0),
  }));

  const choices = sortByGrading(entries).map((e) => ({
    name: `${e.modul} — ${t.gradingLabel(e.needsGrading)} (${e.list.length})`,
    value: e,
  }));

  renderHeader([course.name, category.fagretning], { backable: true });
  return withBackKey((signal) => select({ message: t.pickSubmoduleMessage(), choices }, { signal }));
}

// --- Steg 4: oppgave ------------------------------------------------------------
async function pickAssignment(config, course, category, modul, pool, notice, mode) {
  const sorted = sortByGrading(pool);
  const filterLabel = config.bulkCloneFilter === "all" ? t.filterAll() : t.filterNeedsGrading();

  renderHeader([course.name, category?.fagretning ?? t.allAssignments(), modul], { backable: false });
  if (notice) console.log(colorize(notice, DIM));
  console.log(colorize(t.searchHint(), DIM));

  const bulkLabel = mode === "generate" ? t.bulkGenerateLabel(pool.length) : t.bulkCloneLabel(pool.length, filterLabel);
  const staticChoices = [
    { name: t.back(), value: BACK },
    { name: bulkLabel, value: BULK_ALL },
  ];

  return search(
    {
      message: t.searchAssignmentMessage(),
      source: async (term) => {
        const filtered = term
          ? sorted.filter((a) => a.name.toLowerCase().includes(term.toLowerCase()))
          : sorted;
        return [...staticChoices, ...filtered.map((a) => ({ name: formatAssignmentLine(a), value: a }))];
      },
    },
    { signal: quitController.signal }
  );
}

// Liten sub-flyt: velg én student fra innleveringslista, sett ny
// karakter/tilbakemelding, bekreft eksplisitt, og kall gradeSubmission.
// Verktøyets første irreversible, skrivende handling mot en ekte
// elevkarakter - derfor eksplisitt confirm() før selve kallet.
async function gradeSubmissionFlow(config, course, assignment, submitted) {
  renderHeader([course.name, assignment.name, t.gradeMenuEntry()], { backable: true });
  const studentChoices = [
    { name: t.back(), value: BACK },
    ...submitted.map((s) => ({
      name:
        s.currentGrade != null
          ? `${displayName(s, config)} (${t.currentGradeLabel(s.currentGrade)})`
          : displayName(s, config),
      value: s,
    })),
  ];
  const student = await withBackKey((signal) =>
    select({ message: t.pickStudentForGradeMessage(), choices: studentChoices }, { signal })
  );
  if (student === BACK) return;

  renderHeader([course.name, assignment.name, displayName(student, config)], { backable: false });
  console.log(colorize(t.currentGradeDisplay(student.currentGrade), DIM));
  const grade = await input({ message: t.newGradeMessage() }, { signal: quitController.signal });
  const comment = await input({ message: t.feedbackCommentMessage() }, { signal: quitController.signal });

  if (!grade.trim() && !comment.trim()) {
    console.log(t.gradeNothingToSend());
    return;
  }

  renderHeader([course.name, assignment.name, displayName(student, config)], { backable: false });
  console.log(t.gradeConfirmSummaryHeader());
  console.log(t.gradeConfirmSummary(displayName(student, config), assignment.name, course.name, grade, comment));
  const confirmed = await confirm({ message: t.confirmGradeMessage(), default: false }, { signal: quitController.signal });
  if (!confirmed) {
    console.log(t.gradeCancelled());
    return;
  }

  const spinner = ora(t.gradingInProgress()).start();
  const result = await gradeSubmission(
    config,
    assignment.courseId ?? course.id,
    assignment.id,
    student.userId,
    { grade, comment }
  );
  if (result.ok) {
    spinner.succeed(t.gradeSuccess(displayName(student, config)));
    student.currentGrade = grade;
  } else {
    spinner.fail(t.gradeFailed(result.reason, result.detail));
  }
}

// --- Steg 5: hva skal klones -----------------------------------------------------
async function pickCloneScope(config, course, assignment, submitted, needsGrading, totalCount) {
  const isQuiz = Array.isArray(assignment.submissionTypes) && assignment.submissionTypes.includes("online_quiz");
  while (true) {
    const choices = [];
    if (needsGrading.length > 0 && needsGrading.length < submitted.length) {
      choices.push({ name: t.onlyNeedsGrading(needsGrading.length), value: "needs_grading" });
    }
    choices.push({ name: t.allSubmitted(submitted.length), value: "all" });
    choices.push({ name: t.chooseYourself(), value: "choose" });
    if (!isQuiz && submitted.length > 0) {
      choices.push({ name: t.gradeMenuEntry(), value: "grade" });
    }

    renderHeader([course.name, assignment.name], { backable: true });
    console.log(colorize(t.submissionSummary(totalCount, submitted.length, needsGrading.length), DIM));
    if (isQuiz) console.log(colorize(t.quizGradingNotSupported(), DIM));
    const pick = await withBackKey((signal) => select({ message: t.pickCloneScopeMessage(), choices }, { signal }));
    if (pick === BACK) return BACK;
    if (pick === "needs_grading") return needsGrading;
    if (pick === "all") return submitted;
    if (pick === "grade") {
      await gradeSubmissionFlow(config, course, assignment, submitted);
      continue;
    }

    const needsGradingSet = new Set(needsGrading);
    renderHeader([course.name, assignment.name, t.chooseYourself()], { backable: true });
    const chosen = await withBackKey((signal) =>
      checkbox(
        {
          message: t.pickSpecificMessage(),
          choices: submitted.map((s) => ({
            name: `${displayName(s, config)} (${s.workflowState})`,
            value: s,
            checked: needsGradingSet.has(s),
          })),
        },
        { signal }
      )
    );
    if (chosen === BACK) continue;
    return chosen;
  }
}

// Henter innleveringer for HELE poolen (en fagretning/modul/hele kurset) og
// filtrerer etter config.bulkCloneFilter - ingen interaktivt klone-valg her,
// siden det ville vært upraktisk for en liste på flere titalls oppgaver.
async function bulkFetch(config, course, pool) {
  let done = 0;
  const spinner = ora(t.fetchingBulkSubmissions(0, pool.length)).start();
  const perAssignment = await mapWithConcurrency(pool, 6, async (a) => {
    // a.courseId finnes bare på oppgaver fra en cross-course pseudo-kurs
    // (steg 4) - ellers bruker vi det ene valgte kurset som før.
    const subs = await listSubmissions(config, a.courseId ?? course.id, a.id);
    done++;
    spinner.text = t.fetchingBulkSubmissions(done, pool.length);
    return { assignment: a, subs };
  });
  spinner.stop();

  const includeAll = config.bulkCloneFilter === "all";
  const toClone = [];
  for (const { assignment: a, subs } of perAssignment) {
    for (const s of subs) {
      const matches = includeAll
        ? s.workflowState !== "unsubmitted"
        : s.workflowState === "submitted" || s.workflowState === "pending_review";
      if (matches) {
        const repo = extractRepo(s.text);
        toClone.push({
          ...s,
          repo,
          owner: repo?.split("/")[0] ?? null,
          assignmentId: a.id,
          assignmentName: a.name,
          courseId: a.courseId ?? course.id,
          courseName: a.courseName ?? course.name,
        });
      }
    }
  }

  console.log(t.bulkFetchResult(toClone.length, includeAll ? t.filterAll() : t.filterNeedsGrading(), pool.length));
  return toClone;
}

// --- Orkestrerer steg 0-5 med fram/tilbake-navigasjon ----------------------------
async function selectSubmissionsToClone(config) {
  let phase = "course";
  let mode = values.generate ? "generate" : "clone";
  let course, category, modul, pool, assignment, submitted, needsGrading, totalCount, notice;

  if (values.course || values["all-courses"]) {
    const { courses } = await getCourses(config);
    if (values["all-courses"]) {
      course = buildCrossCourseCourse(courses, t);
    } else {
      course = courses.find((c) => String(c.id) === String(values.course));
      if (!course) throw new Error(t.errCourseNotFound(values.course));
    }
    phase = "category";

    if (values.assignment) {
      assignment = course.assignments.find((a) => String(a.id) === String(values.assignment));
      if (!assignment) throw new Error(t.errAssignmentNotFound(values.assignment, course.name));
      if (mode === "generate") return { course, assignment, generateOnly: true };
      // Hvis denne oppgaven viser seg å ikke ha innleveringer, faller vi
      // tilbake til "assignment"-steget - da trengs en gyldig pool å søke i.
      category = null;
      modul = null;
      pool = course.assignments;
      phase = "fetch_submissions";
    } else if (values.all) {
      category = null;
      modul = null;
      pool = course.assignments;
      phase = mode === "generate" ? "generate_done" : "bulk_fetch";
    } else if (values.category) {
      const { categories, uncategorized } = buildCategoryTree(course.assignments);
      const needle = values.category.toLowerCase();
      let match =
        needle === t.uncategorized().toLowerCase()
          ? { fagretning: t.uncategorized(), all: uncategorized, modulMap: new Map(), hasSubmodules: false }
          : categories.find((c) => c.fagretning.toLowerCase() === needle);
      if (!match) throw new Error(t.errCategoryNotFound(values.category, course.name));
      category = match;

      if (values.submodule) {
        const entry = [...match.modulMap.entries()].find(
          ([k]) => k.toLowerCase() === values.submodule.toLowerCase()
        );
        if (!entry) throw new Error(t.errSubmoduleNotFound(values.submodule, values.category));
        modul = entry[0];
        pool = entry[1];
      } else {
        modul = null;
        pool = match.all;
      }
      phase = mode === "generate" ? "generate_done" : "bulk_fetch";
    }

    if (phase === "generate_done") return { course, category, modul, generateOnly: true, bulk: true };
  }

  while (true) {
    switch (phase) {
      case "course": {
        const result = await pickCourse(config, mode);
        if (result === ENTER_GENERATE_MODE) {
          mode = "generate";
          break;
        }
        if (result === ENTER_CROSS_COURSE_MODE) {
          const chosen = await pickCoursesForCrossCourse(config);
          if (chosen === BACK) break;
          course = buildCrossCourseCourse(chosen, t);
          phase = "category";
          break;
        }
        course = result;
        phase = "category";
        break;
      }
      case "category": {
        const result = await pickCategory(course);
        if (result === BACK) {
          phase = "course";
          break;
        }
        if (result.type === "all") {
          category = null;
          modul = null;
          pool = course.assignments;
          phase = "assignment";
        } else {
          category = result;
          if (category.hasSubmodules) {
            phase = "submodule";
          } else {
            modul = null;
            pool = category.all;
            phase = "assignment";
          }
        }
        break;
      }
      case "submodule": {
        const result = await pickSubmodule(course, category);
        if (result === BACK) {
          phase = "category";
          break;
        }
        modul = result.modul;
        pool = result.list;
        phase = "assignment";
        break;
      }
      case "assignment": {
        const result = await pickAssignment(config, course, category, modul, pool, notice, mode);
        notice = null;
        if (result === BACK) {
          phase = category ? (category.hasSubmodules ? "submodule" : "category") : "category";
          break;
        }
        if (result === BULK_ALL) {
          if (mode === "generate") return { course, category, modul, generateOnly: true, bulk: true };
          phase = "bulk_fetch";
          break;
        }
        assignment = result;
        phase = mode === "generate" ? "generate_done" : "fetch_submissions";
        break;
      }
      case "bulk_fetch": {
        const toClone = await bulkFetch(config, course, pool);
        return { course, assignment: null, toClone, bulk: true, category, modul };
      }
      case "generate_done": {
        return { course, assignment, toClone: null, generateOnly: true };
      }
      case "fetch_submissions": {
        const spinner = ora(t.fetchingSubmissionsFor(assignment.name)).start();
        const submissions = await listSubmissions(config, assignment.courseId ?? course.id, assignment.id);
        spinner.stop();

        totalCount = submissions.length;
        submitted = submissions
          .filter((s) => s.workflowState !== "unsubmitted")
          .map((s) => {
            const repo = extractRepo(s.text);
            return { ...s, repo, owner: repo?.split("/")[0] ?? null };
          });
        needsGrading = submitted.filter(
          (s) => s.workflowState === "submitted" || s.workflowState === "pending_review"
        );

        if (submitted.length === 0) {
          notice = t.noSubmissionsYet(assignment.name);
          phase = "assignment";
          break;
        }
        phase = "clone_scope";
        break;
      }
      case "clone_scope": {
        const toClone = await pickCloneScope(config, course, assignment, submitted, needsGrading, totalCount);
        if (toClone === BACK) {
          phase = "assignment";
          break;
        }
        return { course, assignment, toClone };
      }
    }
  }
}

function buildFlagString({ course, assignment, category, modul }) {
  // En enkelt oppgave hører uansett bare til ett ekte kurs - selv om den ble
  // funnet via cross-course-navigasjon, er den mest presise (og eneste
  // gyldige, siden --assignment krever --course, ikke --all-courses)
  // snarveien å adressere den direkte via sitt ekte kurs.
  if (assignment && course.crossCourse) {
    return `canvas-clone --course ${assignment.courseId} --assignment ${assignment.id}`;
  }

  let cmd = course.crossCourse ? "canvas-clone --all-courses" : `canvas-clone --course ${course.id}`;
  if (assignment) {
    cmd += ` --assignment ${assignment.id}`;
  } else if (category) {
    cmd += ` --category "${category.fagretning}"`;
    if (modul) cmd += ` --submodule "${modul}"`;
  } else {
    cmd += " --all";
  }
  return cmd;
}

async function run() {
  const config = await ensureConfig({ forceSetup: values.setup, signal: quitController.signal, t });
  if (values.setup) {
    console.log(t.setupUpdated());
    return;
  }

  const { course, assignment, toClone, bulk, category, modul, generateOnly } = await selectSubmissionsToClone(
    config
  );

  if (generateOnly) {
    console.log(`\n${buildFlagString({ course, assignment, category, modul })}`);
    return;
  }

  console.log(colorize(t.shortcutTip(buildFlagString({ course, assignment, category, modul })), DIM));

  if (toClone.length === 0) {
    console.log(t.nothingSelected());
    return;
  }

  const items = bulk
    ? toClone
    : toClone.map((s) => ({
        ...s,
        assignmentId: assignment.id,
        assignmentName: assignment.name,
        courseId: assignment.courseId ?? course.id,
        courseName: assignment.courseName ?? course.name,
      }));

  // `cloned` = faktisk klonet i DENNE kjøringen (brukes til suksess-telling og
  // til --temp-opprydding). `openable` = alt som er tilgjengelig for
  // "åpne i editor" etterpå - det vil si fersk kloning OG tilfeller der
  // destinasjonen fantes fra før (samme student/repo/dest) og vi derfor bare
  // hoppet over selve kloningen. Uten denne distinksjonen forsvant allerede
  // klonede repo helt fra editor-lista.
  const cloned = [];
  const openable = [];
  // Nøkkelen må inkludere kurset i cross-course-modus, siden assignment_id
  // ikke er unik på tvers av kurs (DECISIONS.md) - ellers kunne to oppgaver
  // med samme id fra ulike kurs blitt slått sammen i samme uten_lenke.txt,
  // skrevet til feil (kursløs) mappe.
  const skippedByAssignment = new Map();
  const crossCourse = !!course?.crossCourse;
  const assignmentKey = (sub) => (crossCourse ? `${sub.courseName}::${sub.assignmentId}` : String(sub.assignmentId));

  for (const sub of items) {
    const name = displayName(sub, config);
    try {
      const destRoot = crossCourse
        ? join(process.cwd(), "grading", sanitizeFolderName(sub.courseName), String(sub.assignmentId))
        : join(process.cwd(), "grading", String(sub.assignmentId));
      mkdirSync(destRoot, { recursive: true });

      if (!sub.repo) {
        console.log(t.noGithubLink(name, sub.assignmentName));
        const key = assignmentKey(sub);
        if (!skippedByAssignment.has(key)) skippedByAssignment.set(key, { destRoot, entries: [] });
        skippedByAssignment.get(key).entries.push({ name, reason: t.reasonNoLink() });
        continue;
      }

      const dest = join(destRoot, sub.owner);
      if (existsSync(dest)) {
        console.log(t.skippedExists(sub.owner, sub.repo));
        openable.push({ student: name, repo: sub.repo, dest, assignmentId: sub.assignmentId, courseName: sub.courseName });
        continue;
      }

      const cloneSpinner = ora(t.cloning(sub.repo, dest)).start();
      const result = cloneRepo(sub.repo, dest);
      if (result.ok) {
        cloneSpinner.succeed(t.cloned(sub.repo, result.via));
        const entry = { student: name, repo: sub.repo, dest, assignmentId: sub.assignmentId, courseName: sub.courseName };
        cloned.push(entry);
        openable.push(entry);
      } else {
        cloneSpinner.fail(t.cloneFailed(sub.repo, result.error));
        const key = assignmentKey(sub);
        if (!skippedByAssignment.has(key)) skippedByAssignment.set(key, { destRoot, entries: [] });
        skippedByAssignment.get(key).entries.push({ name, reason: t.reasonCloneFailed(sub.repo, result.error) });
      }
    } catch (err) {
      console.log(t.unexpectedItemError(name, err.message));
      const destRoot = crossCourse
        ? join(process.cwd(), "grading", sanitizeFolderName(sub.courseName), String(sub.assignmentId))
        : join(process.cwd(), "grading", String(sub.assignmentId));
      const key = assignmentKey(sub);
      if (!skippedByAssignment.has(key)) skippedByAssignment.set(key, { destRoot, entries: [] });
      skippedByAssignment.get(key).entries.push({ name, reason: t.reasonUnexpectedError(err.message) });
    }
  }

  let totalSkipped = 0;
  for (const { destRoot, entries } of skippedByAssignment.values()) {
    totalSkipped += entries.length;
    const logPath = join(destRoot, "uten_lenke.txt");
    writeFileSync(logPath, entries.map((s) => `${s.name}\t${s.reason}`).join("\n") + "\n");
  }
  if (totalSkipped > 0) {
    console.log(t.skippedLog(totalSkipped));
  }

  const assignmentCount = new Set(cloned.map((c) => `${c.courseName ?? ""}::${c.assignmentId}`)).size;
  console.log(bulk ? t.doneBulk(cloned.length, assignmentCount) : t.doneSingle(cloned.length));
  if (openable.length === 0) return;

  if (values.open) {
    for (const c of openable) {
      if (!openInEditor(values.open, c.dest)) {
        console.log(t.failedToOpen(c.dest, values.open));
      }
    }
    if (values.temp) await cleanupTemp(cloned);
    return;
  }

  const editorChoice =
    config.editor ??
    (await select(
      {
        message: t.openInEditorMessage(),
        choices: [
          { name: t.editorVsCode(), value: "code" },
          { name: t.editorZed(), value: "zed" },
          { name: t.editorNo(), value: null },
        ],
      },
      { signal: quitController.signal }
    ));
  if (!editorChoice) {
    if (values.temp) await cleanupTemp(cloned);
    return;
  }
  console.log(colorize(t.openTip(editorChoice), DIM));

  const toOpen = await checkbox(
    {
      message: t.pickReposToOpenMessage(editorChoice),
      choices: openable.map((c) => ({ name: `${c.student} (${c.repo})`, value: c.dest, checked: true })),
    },
    { signal: quitController.signal }
  );

  for (const dest of toOpen) {
    if (!openInEditor(editorChoice, dest)) {
      console.log(t.failedToOpen(dest, editorChoice));
    }
  }

  if (values.temp) await cleanupTemp(cloned);
}

run().catch((err) => {
  if (err.name === "AbortPromptError" || err.name === "ExitPromptError") {
    console.log(t.aborted());
    process.exit(0);
  }
  console.error(t.genericError(err.message));
  process.exit(1);
});
