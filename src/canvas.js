import { mapWithConcurrency } from "./concurrency.js";

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function apiGetAll(config, pathAndQuery) {
  let url = `${config.canvasUrl}${pathAndQuery}`;
  const results = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.canvasToken}` },
    });
    if (!res.ok) {
      throw new Error(
        config.joeMode ? `Canvas API error (${res.status}) at ${url}` : `Canvas API-feil (${res.status}) på ${url}`
      );
    }
    const page = await res.json();
    results.push(...page);
    url = parseNextLink(res.headers.get("link"));
  }
  return results;
}

export async function whoAmI(config) {
  try {
    const res = await fetch(`${config.canvasUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${config.canvasToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Henter kurs + alle oppgaver (med needs_grading_count fra Canvas) i ett steg,
// slik at kursvelgeren kan vise "N klare til retting" per kurs uten et eget
// kall senere når brukeren velger oppgave.
export async function listTeacherCoursesWithAssignments(config, onProgress) {
  const courses = await apiGetAll(
    config,
    "/api/v1/courses?per_page=100&enrollment_type=teacher&state[]=available&state[]=unpublished"
  );

  let done = 0;
  return mapWithConcurrency(courses, 6, async (c) => {
    const rawAssignments = await apiGetAll(config, `/api/v1/courses/${c.id}/assignments?per_page=100`);
    done++;
    onProgress?.(done, courses.length);
    const assignments = rawAssignments.map((a) => ({
      id: a.id,
      name: a.name,
      dueAt: a.due_at,
      needsGrading: a.needs_grading_count ?? 0,
    }));
    const needsGrading = assignments.reduce((sum, a) => sum + a.needsGrading, 0);
    return { id: c.id, name: c.name, needsGrading, assignments };
  });
}

export async function listSubmissions(config, courseId, assignmentId) {
  const submissions = await apiGetAll(
    config,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user&per_page=100`
  );
  return submissions.map((s) => ({
    studentName: s.user?.name ?? `bruker ${s.user_id}`,
    workflowState: s.workflow_state,
    text: `${s.url ?? ""} ${s.body ?? ""}`,
  }));
}
