// Karakteriseringstester for logikk som er flyttet ut av bin/canvas-clone.js
// (D1, VS Code-utvidelsen). Forventningene er dagens oppførsel i CLI-et, ikke
// et ønsket design - endres oppførselen, er det en bevisst endring.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  isNeedsGrading,
  sortByGrading,
  isQuizAssignment,
  splitSubmissions,
  selectForBulk,
  itemsForAssignment,
  buildCrossCourseCourse,
  assignmentKey,
  destRootFor,
  formatSkippedLog,
  countAssignments,
} from "../src/workflow.js";
import { createStrings } from "../src/strings.js";

const sub = (userId, workflowState, extra = {}) => ({ userId, workflowState, ...extra });

test("isNeedsGrading: bare submitted og pending_review", () => {
  assert.equal(isNeedsGrading(sub(1, "submitted")), true);
  assert.equal(isNeedsGrading(sub(1, "pending_review")), true);
  assert.equal(isNeedsGrading(sub(1, "graded")), false);
  assert.equal(isNeedsGrading(sub(1, "unsubmitted")), false);
});

test("sortByGrading: synkende needsGrading, manglende = 0, stabil, endrer ikke input", () => {
  const list = [
    { id: "a", needsGrading: 1 },
    { id: "b" },
    { id: "c", needsGrading: 5 },
    { id: "d", needsGrading: 1 },
  ];
  const copy = structuredClone(list);
  assert.deepEqual(
    sortByGrading(list).map((x) => x.id),
    ["c", "a", "d", "b"]
  );
  assert.deepEqual(list, copy);
});

test("isQuizAssignment: online_quiz i submissionTypes, ellers false (også uten felt)", () => {
  assert.equal(isQuizAssignment({ submissionTypes: ["online_quiz"] }), true);
  assert.equal(isQuizAssignment({ submissionTypes: ["online_url", "online_quiz"] }), true);
  assert.equal(isQuizAssignment({ submissionTypes: ["online_url"] }), false);
  assert.equal(isQuizAssignment({}), false);
  assert.equal(isQuizAssignment({ submissionTypes: "online_quiz" }), false);
});

test("splitSubmissions: levert = alt unntatt unsubmitted; trenger retting = submitted/pending_review", () => {
  const subs = [sub(1, "submitted"), sub(2, "unsubmitted"), sub(3, "graded"), sub(4, "pending_review")];
  const { submitted, needsGrading } = splitSubmissions(subs);
  assert.deepEqual(
    submitted.map((s) => s.userId),
    [1, 3, 4]
  );
  assert.deepEqual(
    needsGrading.map((s) => s.userId),
    [1, 4]
  );
  // Samme objekter (CLI-et bruker identitet i et Set for forhåndskryss).
  assert.equal(needsGrading[0], subs[0]);
});

const course = { id: 557, name: "Kurs A" };
const perAssignment = [
  {
    assignment: { id: 10, name: "Oppg 10" },
    subs: [sub(1, "submitted"), sub(2, "graded"), sub(3, "unsubmitted"), sub(4, "pending_review")],
  },
  {
    assignment: { id: 11, name: "Oppg 11", courseId: 99, courseName: "Kurs B" },
    subs: [sub(5, "graded"), sub(6, "submitted")],
  },
];

test("selectForBulk: needs_grading (default) tar bare submitted/pending_review, merker oppgave og kurs", () => {
  const res = selectForBulk(perAssignment, course, "needs_grading");
  assert.deepEqual(res, [
    { userId: 1, workflowState: "submitted", assignmentId: 10, assignmentName: "Oppg 10", courseId: 557, courseName: "Kurs A" },
    { userId: 4, workflowState: "pending_review", assignmentId: 10, assignmentName: "Oppg 10", courseId: 557, courseName: "Kurs A" },
    { userId: 6, workflowState: "submitted", assignmentId: 11, assignmentName: "Oppg 11", courseId: 99, courseName: "Kurs B" },
  ]);
});

test("selectForBulk: ukjent/manglende filter oppfører seg som needs_grading", () => {
  assert.deepEqual(selectForBulk(perAssignment, course, undefined), selectForBulk(perAssignment, course, "needs_grading"));
  assert.deepEqual(selectForBulk(perAssignment, course, "tull"), selectForBulk(perAssignment, course, "needs_grading"));
});

test("selectForBulk: all tar alt unntatt unsubmitted, i rekkefølge", () => {
  const res = selectForBulk(perAssignment, course, "all");
  assert.deepEqual(
    res.map((s) => s.userId),
    [1, 2, 4, 5, 6]
  );
});

test("itemsForAssignment: merker med oppgave, og faller tilbake til kurset når oppgaven ikke har eget", () => {
  const picked = [sub(1, "submitted", { repo: "ola/x" })];
  assert.deepEqual(itemsForAssignment(picked, course, { id: 10, name: "Oppg 10" }), [
    { userId: 1, workflowState: "submitted", repo: "ola/x", assignmentId: 10, assignmentName: "Oppg 10", courseId: 557, courseName: "Kurs A" },
  ]);
  assert.deepEqual(
    itemsForAssignment(picked, { id: null, name: "2 valgte kurs", crossCourse: true }, { id: 10, name: "O", courseId: 99, courseName: "Kurs B" })[0],
    { userId: 1, workflowState: "submitted", repo: "ola/x", assignmentId: 10, assignmentName: "O", courseId: 99, courseName: "Kurs B" }
  );
});

test("buildCrossCourseCourse: slår sammen oppgaver, merker med ekte kurs, navn fra strings", () => {
  const courses = [
    { id: 1, name: "A", assignments: [{ id: 10, name: "x" }] },
    { id: 2, name: "B", assignments: [{ id: 10, name: "y" }, { id: 12, name: "z" }] },
  ];
  assert.deepEqual(buildCrossCourseCourse(courses, createStrings(false)), {
    id: null,
    name: "2 valgte kurs",
    crossCourse: true,
    assignments: [
      { id: 10, name: "x", courseId: 1, courseName: "A" },
      { id: 10, name: "y", courseId: 2, courseName: "B" },
      { id: 12, name: "z", courseId: 2, courseName: "B" },
    ],
  });
  assert.equal(buildCrossCourseCourse(courses, createStrings(true)).name, "2 selected courses");
});

test("assignmentKey: bare id i ett kurs, kurs::id ved cross-course", () => {
  const s = { courseName: "Kurs A", assignmentId: 10 };
  assert.equal(assignmentKey(s, false), "10");
  assert.equal(assignmentKey(s, true), "Kurs A::10");
  assert.notEqual(assignmentKey({ courseName: "B", assignmentId: 10 }, true), assignmentKey(s, true));
});

test("destRootFor: <økt>/<id> i ett kurs, <økt>/<sanert kurs>/<id> ved cross-course", () => {
  const sp = path.join("/x", "økt");
  assert.equal(destRootFor(sp, { courseName: "Kurs A", assignmentId: 10 }, false), path.join(sp, "10"));
  assert.equal(destRootFor(sp, { courseName: "Kurs A", assignmentId: 10 }, true), path.join(sp, "Kurs A", "10"));
  assert.equal(destRootFor(sp, { courseName: "../$(rm)/K:1", assignmentId: 7 }, true), path.join(sp, "..rmK1", "7"));
  assert.equal(destRootFor(sp, { courseName: "..", assignmentId: 7 }, true), path.join(sp, "_", "7"));
});

test("formatSkippedLog: navn<TAB>grunn per linje, avsluttende linjeskift", () => {
  assert.equal(
    formatSkippedLog([
      { name: "Ola", reason: "ingen lenke funnet" },
      { name: "Kari", reason: "klone-feil: a/b (x)" },
    ]),
    "Ola\tingen lenke funnet\nKari\tklone-feil: a/b (x)\n"
  );
  assert.equal(formatSkippedLog([]), "\n");
});

test("countAssignments: kurs + id, så samme id i to kurs telles to ganger", () => {
  assert.equal(
    countAssignments([
      { courseName: "A", assignmentId: 10 },
      { courseName: "A", assignmentId: 10 },
      { courseName: "B", assignmentId: 10 },
      { assignmentId: 11 },
    ]),
    3
  );
});
