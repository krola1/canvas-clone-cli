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

// Strukturert resultat i stedet for bare null/data, slik at kallstedet kan
// skille mellom nettverksfeil (fetch selv kaster - feil URL, DNS, ingen
// nettverkstilgang), ugyldig token (Canvas svarer 401/403) og annen/uventet
// feil (alt annet, f.eks. en URL som svarer men ikke er en gyldig
// Canvas-instans).
export async function whoAmI(config) {
  let res;
  try {
    res = await fetch(`${config.canvasUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${config.canvasToken}` },
    });
  } catch (err) {
    return { ok: false, reason: "network", detail: err.message };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "invalid_token", detail: `HTTP ${res.status}` };
  }
  if (!res.ok) {
    return { ok: false, reason: "other", detail: `HTTP ${res.status}` };
  }

  try {
    const user = await res.json();
    return { ok: true, user };
  } catch (err) {
    return { ok: false, reason: "other", detail: err.message };
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
