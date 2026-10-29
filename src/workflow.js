import { join } from "node:path";
import { sanitizeFolderName } from "./storage.js";

// Ren logikk for "hva skal klones, og hvor", delt mellom CLI-et
// (bin/canvas-clone.js) og VS Code-utvidelsen. Ingen I/O, ingen prompts,
// ingen konsoll - bare data inn og data ut. Flyttet ordrett ut av bin/
// (karakterisert i tests/workflow.test.js før flyttingen).

// "Trenger retting" = levert, men ikke vurdert ennå.
export function isNeedsGrading(s) {
  return s.workflowState === "submitted" || s.workflowState === "pending_review";
}

export function sortByGrading(list) {
  return [...list].sort((a, b) => (b.needsGrading ?? 0) - (a.needsGrading ?? 0));
}

export function isQuizAssignment(assignment) {
  return Array.isArray(assignment.submissionTypes) && assignment.submissionTypes.includes("online_quiz");
}

// Deler innleveringene for én oppgave i levert / trenger retting.
export function splitSubmissions(submissions) {
  const submitted = submissions.filter((s) => s.workflowState !== "unsubmitted");
  const needsGrading = submitted.filter(isNeedsGrading);
  return { submitted, needsGrading };
}

// Bulk-filteret (config.bulkCloneFilter): "all" tar med alt som er levert,
// alt annet betyr "trenger retting". perAssignment er [{ assignment, subs }].
// Hver innlevering merkes med oppgave og ekte kurs (courseId/courseName finnes
// på oppgaven bare når den kommer fra et cross-course pseudo-kurs).
export function selectForBulk(perAssignment, course, bulkCloneFilter) {
  const includeAll = bulkCloneFilter === "all";
  const toClone = [];
  for (const { assignment: a, subs } of perAssignment) {
    for (const s of subs) {
      const matches = includeAll ? s.workflowState !== "unsubmitted" : isNeedsGrading(s);
      if (matches) {
        toClone.push({
          ...s,
          assignmentId: a.id,
          assignmentName: a.name,
          courseId: a.courseId ?? course.id,
          courseName: a.courseName ?? course.name,
        });
      }
    }
  }
  return toClone;
}

// Samme merking som selectForBulk, for innleveringer valgt fra én oppgave.
export function itemsForAssignment(toClone, course, assignment) {
  return toClone.map((s) => ({
    ...s,
    assignmentId: assignment.id,
    assignmentName: assignment.name,
    courseId: assignment.courseId ?? course.id,
    courseName: assignment.courseName ?? course.name,
  }));
}

// Slår sammen oppgaver fra flere kurs til ett "pseudo-kurs" (fagretning/modul
// beholdes). Hver oppgave merkes med sitt ekte kurs, slik at
// innleveringshenting og mappestruktur vet hvor den hører hjemme.
export function buildCrossCourseCourse(courses, t) {
  const assignments = courses.flatMap((c) =>
    c.assignments.map((a) => ({ ...a, courseId: c.id, courseName: c.name }))
  );
  return { id: null, name: t.allCoursesLabel(courses.length), assignments, crossCourse: true };
}

// Nøkkelen må inkludere kurset i cross-course-modus, siden assignment_id
// ikke er unik på tvers av kurs (DECISIONS.md) - ellers kunne to oppgaver
// med samme id fra ulike kurs blitt slått sammen i samme uten_lenke.txt.
export function assignmentKey(sub, crossCourse) {
  return crossCourse ? `${sub.courseName}::${sub.assignmentId}` : String(sub.assignmentId);
}

// Oppgavemappen i økta: <økt>/<assignment_id>/, eller
// <økt>/<kurs>/<assignment_id>/ ved cross-course.
export function destRootFor(sessionPath, sub, crossCourse) {
  return crossCourse
    ? join(sessionPath, sanitizeFolderName(sub.courseName), String(sub.assignmentId))
    : join(sessionPath, String(sub.assignmentId));
}

// Innholdet i uten_lenke.txt: én linje "<navn>\t<grunn>" per innlevering.
export function formatSkippedLog(entries) {
  return entries.map((s) => `${s.name}\t${s.reason}`).join("\n") + "\n";
}

// Antall ulike oppgaver blant de klonede (kurset med i nøkkelen, se assignmentKey).
export function countAssignments(cloned) {
  return new Set(cloned.map((c) => `${c.courseName ?? ""}::${c.assignmentId}`)).size;
}
