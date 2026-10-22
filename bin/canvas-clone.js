#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { select, search, checkbox } from "@inquirer/prompts";
import ora from "ora";
import { ensureConfig, loadConfig } from "../src/config.js";
import { listTeacherCoursesWithAssignments, listSubmissions } from "../src/canvas.js";
import { extractRepo, cloneRepo } from "../src/github.js";
import { openInEditor } from "../src/editor.js";
import { loadCourseCache, saveCourseCache, isFresh, ageMinutes } from "../src/cache.js";
import { buildCategoryTree } from "../src/categories.js";
import { createStrings } from "../src/strings.js";

const BACK = Symbol("back");
const BULK_ALL = Symbol("bulk_all");
const ENTER_GENERATE_MODE = Symbol("enter_generate_mode");

const { values } = parseArgs({
  options: {
    setup: { type: "boolean", default: false },
    refresh: { type: "boolean", default: false },
    course: { type: "string" },
    assignment: { type: "string" },
    category: { type: "string" },
    submodule: { type: "string" },
    all: { type: "boolean", default: false },
    generate: { type: "boolean", default: false },
    open: { type: "string" },
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

if (values.assignment && !values.course) {
  console.error(t.errAssignmentNeedsCourse());
  process.exit(1);
}
if (values.category && !values.course) {
  console.error(t.errCategoryNeedsCourse());
  process.exit(1);
}
if (values.submodule && !values.category) {
  console.error(t.errSubmoduleNeedsCategory());
  process.exit(1);
}
if (values.all && !values.course) {
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

// Kjører fn over items med maks `limit` samtidige kall - brukes for å hente
// innleveringer for mange oppgaver (bulk-kloning) uten å sende hundrevis av
// forespørsler helt parallelt.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
  if (mode !== "generate") {
    choices.push({ name: t.generateEntry(), value: ENTER_GENERATE_MODE });
  }

  return select({ message: t.pickCourseMessage(), choices }, { signal: quitController.signal });
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

// --- Steg 5: hva skal klones -----------------------------------------------------
async function pickCloneScope(config, course, assignment, submitted, needsGrading, totalCount) {
  while (true) {
    const choices = [];
    if (needsGrading.length > 0 && needsGrading.length < submitted.length) {
      choices.push({ name: t.onlyNeedsGrading(needsGrading.length), value: "needs_grading" });
    }
    choices.push({ name: t.allSubmitted(submitted.length), value: "all" });
    choices.push({ name: t.chooseYourself(), value: "choose" });

    renderHeader([course.name, assignment.name], { backable: true });
    console.log(colorize(t.submissionSummary(totalCount, submitted.length, needsGrading.length), DIM));
    const pick = await withBackKey((signal) => select({ message: t.pickCloneScopeMessage(), choices }, { signal }));
    if (pick === BACK) return BACK;
    if (pick === "needs_grading") return needsGrading;
    if (pick === "all") return submitted;

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
    const subs = await listSubmissions(config, course.id, a.id);
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
        toClone.push({ ...s, repo, owner: repo?.split("/")[0] ?? null, assignmentId: a.id, assignmentName: a.name });
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

  if (values.course) {
    const { courses } = await getCourses(config);
    course = courses.find((c) => String(c.id) === String(values.course));
    if (!course) throw new Error(t.errCourseNotFound(values.course));
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
        const submissions = await listSubmissions(config, course.id, assignment.id);
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
  let cmd = `canvas-clone --course ${course.id}`;
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
    : toClone.map((s) => ({ ...s, assignmentId: assignment.id, assignmentName: assignment.name }));

  const cloned = [];
  const skippedByAssignment = new Map();

  for (const sub of items) {
    const destRoot = join(process.cwd(), "grading", String(sub.assignmentId));
    mkdirSync(destRoot, { recursive: true });

    const name = displayName(sub, config);
    if (!sub.repo) {
      console.log(t.noGithubLink(name, sub.assignmentName));
      if (!skippedByAssignment.has(sub.assignmentId)) skippedByAssignment.set(sub.assignmentId, []);
      skippedByAssignment.get(sub.assignmentId).push({ name, reason: t.reasonNoLink() });
      continue;
    }

    const dest = join(destRoot, sub.owner);
    if (existsSync(dest)) {
      console.log(t.skippedExists(sub.owner, sub.repo));
      continue;
    }

    const cloneSpinner = ora(t.cloning(sub.repo, dest)).start();
    const result = cloneRepo(sub.repo, dest);
    if (result.ok) {
      cloneSpinner.succeed(t.cloned(sub.repo, result.via));
      cloned.push({ student: name, repo: sub.repo, dest, assignmentId: sub.assignmentId });
    } else {
      cloneSpinner.fail(t.cloneFailed(sub.repo, result.error));
      if (!skippedByAssignment.has(sub.assignmentId)) skippedByAssignment.set(sub.assignmentId, []);
      skippedByAssignment.get(sub.assignmentId).push({ name, reason: t.reasonCloneFailed(sub.repo, result.error) });
    }
  }

  let totalSkipped = 0;
  for (const [assignmentId, entries] of skippedByAssignment) {
    totalSkipped += entries.length;
    const logPath = join(process.cwd(), "grading", String(assignmentId), "uten_lenke.txt");
    writeFileSync(logPath, entries.map((s) => `${s.name}\t${s.reason}`).join("\n") + "\n");
  }
  if (totalSkipped > 0) {
    console.log(t.skippedLog(totalSkipped));
  }

  const assignmentCount = new Set(cloned.map((c) => c.assignmentId)).size;
  console.log(bulk ? t.doneBulk(cloned.length, assignmentCount) : t.doneSingle(cloned.length));
  if (cloned.length === 0) return;

  if (values.open) {
    for (const c of cloned) {
      if (!openInEditor(values.open, c.dest)) {
        console.log(t.failedToOpen(c.dest, values.open));
      }
    }
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
  if (!editorChoice) return;
  console.log(colorize(t.openTip(editorChoice), DIM));

  const toOpen = await checkbox(
    {
      message: t.pickReposToOpenMessage(editorChoice),
      choices: cloned.map((c) => ({ name: `${c.student} (${c.repo})`, value: c.dest, checked: true })),
    },
    { signal: quitController.signal }
  );

  for (const dest of toOpen) {
    if (!openInEditor(editorChoice, dest)) {
      console.log(t.failedToOpen(dest, editorChoice));
    }
  }
}

run().catch((err) => {
  if (err.name === "AbortPromptError" || err.name === "ExitPromptError") {
    console.log(t.aborted());
    process.exit(0);
  }
  console.error(t.genericError(err.message));
  process.exit(1);
});
