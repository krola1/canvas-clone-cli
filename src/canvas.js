import { mapWithConcurrency } from "./concurrency.js";
import { extractRepo } from "./github.js";
import { createStrings } from "./strings.js";

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

// Følger Canvas sin Link-header (rel="next") bare så lenge neste side ligger
// på SAMME origin som canvasUrl - ellers ville API-tokenet blitt sendt til en
// vilkårlig vert. Feilmeldingen viser bare vertsnavnet, aldri hele URL-en.
async function apiGetAll(config, pathAndQuery) {
  const origin = new URL(config.canvasUrl).origin;
  let url = `${config.canvasUrl}${pathAndQuery}`;
  const results = [];
  while (url) {
    let next;
    try {
      next = new URL(url, config.canvasUrl);
    } catch {
      next = null;
    }
    if (!next || next.origin !== origin) {
      throw new Error(createStrings(config.joeMode).errForeignPageLink(next?.hostname ?? "?"));
    }
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
      submissionTypes: a.submission_types,
    }));
    const needsGrading = assignments.reduce((sum, a) => sum + a.needsGrading, 0);
    return { id: c.id, name: c.name, needsGrading, assignments };
  });
}

// Innleveringens url/body brukes BARE her, til å finne repo-lenken
// (extractRepo), og forlater aldri denne funksjonen - verken lagret, logget
// eller vist (tilsynets T-A).
//
// 0.3.0 (VS Code-utvidelsen, tilsynets K2): bare med `{ kommentarer: true }`
// hentes kommentartråden (`include[]=submission_comments`), og hvert
// innleveringsobjekt får `kommentarer` fra `tilKommentarer` (hviteliste). Uten
// valget er URL-en og returen byte-like med før (CLI-et og T17).
export async function listSubmissions(config, courseId, assignmentId, { kommentarer = false } = {}) {
  const medKommentarer = kommentarer === true;
  const submissions = await apiGetAll(
    config,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user&per_page=100${
      medKommentarer ? "&include[]=submission_comments" : ""
    }`
  );
  return submissions.map((s) => {
    const repo = extractRepo(`${s.url ?? ""} ${s.body ?? ""}`);
    const sub = {
      studentName: s.user?.name ?? `bruker ${s.user_id}`,
      workflowState: s.workflow_state,
      repo,
      owner: repo ? repo.split("/")[0] : null,
      userId: s.user_id,
      currentGrade: s.grade ?? null,
      currentScore: s.score ?? null,
    };
    if (medKommentarer) sub.kommentarer = tilKommentarer(s.submission_comments, s.user_id);
    return sub;
  });
}

// Kommentartråden til én innlevering, som hviteliste (tilsynets K2):
//   { id, fraEleven, forfatternavn, tekst, tid, forsok,
//     vedlegg: [{ filnavn, type }], media: { type } | null }
// Aldri `url`, `verifier`, `uuid`, `thumbnail_url`, `preview_url`,
// `avatar_image_url`, `author.html_url` eller `media_comment.url`; ingen
// vedleggs-id. `tekst` er Canvas sin rene tekst (`comment`); HTML-varianten
// (`submission_html_comments`) hentes aldri. `fraEleven`: forfatteren er eleven
// innleveringen tilhører (`author_id === user_id`); alt annet (lærere,
// fagfellevurdering) regnes ikke som fra eleven. Sortert på tid, så id.
// Kaster aldri: alt annet enn en liste gir null («kommentarer ikke hentet»), og
// elementer som ikke er objekter hoppes over.
export function tilKommentarer(raw, elevId) {
  try {
    if (!Array.isArray(raw)) return null;
    const tekstEller = (v, reserve) => (typeof v === "string" ? v : reserve);
    const liste = [];
    for (const k of raw) {
      if (!k || typeof k !== "object" || Array.isArray(k)) continue;
      const vedlegg = Array.isArray(k.attachments)
        ? k.attachments
            .filter((a) => a && typeof a === "object")
            .map((a) => ({
              filnavn: tekstEller(a.display_name, tekstEller(a.filename, "")),
              type: tekstEller(a["content-type"], ""),
            }))
        : [];
      const m = k.media_comment;
      const media =
        m && typeof m === "object"
          ? { type: m.media_type === "audio" || m.media_type === "video" ? m.media_type : "annet" }
          : null;
      liste.push({
        id: Number.isSafeInteger(k.id) ? k.id : null,
        fraEleven: elevId != null && k.author_id != null && k.author_id === elevId,
        forfatternavn: tekstEller(k.author_name, ""),
        tekst: tekstEller(k.comment, ""),
        tid: tekstEller(k.created_at, null),
        forsok: Number.isSafeInteger(k.attempt) ? k.attempt : null,
        vedlegg,
        media,
      });
    }
    const tidsverdi = (k) => {
      const ms = k.tid === null ? NaN : Date.parse(k.tid);
      return Number.isNaN(ms) ? Infinity : ms;
    };
    return liste.sort((a, b) => tidsverdi(a) - tidsverdi(b) || (a.id ?? Infinity) - (b.id ?? Infinity));
  } catch {
    return null;
  }
}

// Setter karakter og/eller tilbakemelding på én innlevering. Canvas sitt
// submissions-API (se https://canvas.instructure.com/doc/api/submissions.html,
// PUT /courses/:course_id/assignments/:assignment_id/submissions/:user_id)
// er dokumentert med nøstede Rails-stil form-params
// (submission[posted_grade], comment[text_comment]) - ikke en flat JSON-body.
// Vi sender derfor application/x-www-form-urlencoded med de nøstede
// feltnavnene, i tråd med dokumentasjonen og hvordan Canvas-API-et historisk
// har forventet denne typen kall. Samme strukturerte {ok, reason, detail}-
// mønster som whoAmI, slik at kallstedet kan skille nettverksfeil fra at
// Canvas avviste karakteren.
export async function gradeSubmission(config, courseId, assignmentId, userId, { grade, comment }) {
  const form = new URLSearchParams();
  if (grade !== undefined && grade !== null && grade !== "") {
    form.set("submission[posted_grade]", grade);
  }
  if (comment) {
    form.set("comment[text_comment]", comment);
  }

  let res;
  try {
    res = await fetch(
      `${config.canvasUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.canvasToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      }
    );
  } catch (err) {
    return { ok: false, reason: "network", detail: err.message };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "invalid_token", detail: `HTTP ${res.status}` };
  }
  if (!res.ok) {
    return { ok: false, reason: "other", detail: `HTTP ${res.status}` };
  }

  let raw;
  try {
    raw = await res.json();
  } catch (err) {
    return { ok: false, reason: "other", detail: err.message };
  }
  // 0.3.0 (tilsynets K2): svaret fra Canvas har hele innleveringen, også `body` og
  // `submission_comments` med vedleggs-URL-er (`verifier`). Bare disse feltene
  // forlater canvas.js. Bygges i egen try, så en vellykket PUT aldri meldes som feil
  // (da kunne læreren sendt det samme på nytt). CLI-et leser ikke `submission`.
  const submission = { kommentarer: null };
  try {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      if (Object.hasOwn(raw, "grade")) submission.grade = raw.grade;
      if (typeof raw.workflow_state === "string") submission.workflow_state = raw.workflow_state;
      submission.kommentarer = tilKommentarer(raw.submission_comments, raw.user_id);
    }
  } catch {
    // Innsnevringen feilet: tråden regnes som ikke hentet, sendingen er uansett gjort.
  }
  return { ok: true, submission };
}
