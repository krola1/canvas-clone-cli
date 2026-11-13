// Falske testdata for bla og klone (D5), i Canvas sitt format. Brukes av
// vsc-tests/tre-og-kloning.vsctest.js og prøveriggen (scripts/provekjoring.mjs,
// scenario «klone»). Bare falske data (T19). Alle navn, eiere og ID-er er
// laget slik at de kan letes etter etterpå (D0 m, T11): «VAKT», «elevvakt»
// og ID-ene under ELEVDATA skal aldri finnes i lagret tilstand eller logger.
const SENTINEL = "BODY-VAKTPOST-5d2f8c"; // innleveringens body (T-A)
const KURS_A = 7771001;
const KURS_B = 7771002;
const OPPG = { html: 7772001, css: 7772002, sql: 7772003 };

// Vaktposter i felt som aldri skal forlate canvas.js (tilsynets K2). Brukes både i
// GET-trådene (bla-scenario.js) og i PUT-svaret under.
const KOMMENTAR_VAKTER = Object.freeze({
  tekst: "KOMMENTAR-VAKTPOST-91c4",
  verifier: "VERIFIER-VAKT-1b7d",
  uuid: "UUID-VAKT-5e2a",
  thumbnail: "THUMB-VAKT-0c3f",
  preview: "PREVIEW-VAKT-a9d2",
  avatar: "AVATAR-VAKT-77e1",
  htmlUrl: "HTMLURL-VAKT-4b8c",
  mediaUrl: "MEDIAURL-VAKT-d210",
});
// Alt som aldri skal finnes i noe utvidelsen lagrer, logger, viser i treet, i
// QuickPick, i feilmeldinger eller sender til webviewen (unntatt teksten i `trad`).
const ALDRI = Object.freeze(Object.entries(KOMMENTAR_VAKTER).filter(([k]) => k !== "tekst").map(([, v]) => v));

// En kommentar i Canvas sitt format, med alle de hemmelige feltene fylt med vaktposter.
let kommentarId = 8800000;
function canvasKommentar({ forfatter, forfatterNavn, tekst, tid, forsok = null, vedlegg = false, media = false }) {
  kommentarId++;
  const V = KOMMENTAR_VAKTER;
  return {
    id: kommentarId,
    author_id: forfatter,
    author_name: forfatterNavn,
    author: { id: forfatter, display_name: forfatterNavn, avatar_image_url: `https://canvas.test.invalid/${V.avatar}`, html_url: `https://canvas.test.invalid/${V.htmlUrl}`, pronouns: null },
    comment: tekst,
    created_at: tid,
    edited_at: null,
    attempt: forsok,
    ...(vedlegg
      ? {
          attachments: [
            {
              id: 8899001,
              display_name: "skjermbilde.png",
              filename: "skjermbilde.png",
              "content-type": "image/png",
              url: `https://canvas.test.invalid/files/8899001/download?download_frd=1&verifier=${V.verifier}`,
              uuid: V.uuid,
              thumbnail_url: `https://canvas.test.invalid/${V.thumbnail}`,
              preview_url: `https://canvas.test.invalid/${V.preview}`,
            },
          ],
        }
      : {}),
    ...(media ? { media_comment: { "content-type": "audio/mp4", display_name: "lyd", media_id: "m-1", media_type: "audio", url: `https://canvas.test.invalid/${V.mediaUrl}` } } : {}),
  };
}

let uid = 7773000;
// 0.3.0: `trad(userId)` gir kommentarene (Canvas sitt format) som falsk Canvas bare
// sender med `include[]=submission_comments` (hjelpere/falsk-canvas.js og riggen).
// 0.4.0 (plan G3): `submitted_at` må alltid oppgis (tid eller null): «levert» er bare
// `submitted_at` (erLevert), og en fikstur uten feltet skal feile synlig, ikke stille
// bli «ikke levert». `grade` for «graded» uten innlevering.
const LEVERT = "2026-11-01T08:00:00Z";
function sub(name, state, { submitted_at, url = null, body = null, trad = null, grade = null } = {}) {
  if (submitted_at === undefined) throw new Error(`bla-scenario: ${name} mangler submitted_at`);
  uid++;
  const s = { user_id: uid, user: { id: uid, name }, workflow_state: state, submitted_at, url, body, grade, score: null };
  if (trad) s.submission_comments = trad(uid);
  return s;
}
const LAERER = 1;
const oppgave = (id, name, needs) => ({ id, name, needs_grading_count: needs, submission_types: ["online_url"], due_at: null });

const scenario = {
  courses: [
    { id: KURS_A, name: "Kurs-VAKT-Alfa" },
    // Punktum først: mappen i økten skal bli «_.vscode-VAKT-Beta» (T9a).
    { id: KURS_B, name: ".vscode-VAKT-Beta" },
  ],
  assignments: {
    [KURS_A]: [
      oppgave(OPPG.html, "Frontend modul 1: OPPG-VAKT-html", 3),
      oppgave(OPPG.css, "Frontend modul 2: OPPG-VAKT-css", 22),
      oppgave(OPPG.sql, "SQL Oppgave 1 OPPG-VAKT", 0),
    ],
    // Samme assignment_id som i kurs A (ID-er er bare unike innenfor et kurs).
    [KURS_B]: [oppgave(OPPG.html, "Frontend modul 1: OPPG-VAKT-beta", 1)],
  },
  submissions: {
    [`${KURS_A}:${OPPG.html}`]: [
      sub("Elev-VAKT-Ola", "submitted", { submitted_at: LEVERT, body: `${SENTINEL} https://github.com/elevvakt-ola/oppg` }),
      // 0.3.0: Kari har en besvart tråd (siste fra lærer), Per en med nytt fra eleven
      // (med vedlegg og lydkommentar), og Ikke (ikke levert) en tråd: `ikkeLevert` i treet.
      sub("Elev-VAKT-Kari", "graded", {
        submitted_at: LEVERT,
        url: "https://github.com/elevvakt-kari/oppg",
        body: `<p>${SENTINEL}</p>`,
        trad: (id) => [
          canvasKommentar({ forfatter: id, forfatterNavn: "Elev-VAKT-Kari", tekst: `${KOMMENTAR_VAKTER.tekst} kari 1`, tid: "2026-11-01T10:00:00Z", forsok: 1 }),
          canvasKommentar({ forfatter: LAERER, forfatterNavn: "Test Lærer", tekst: `${KOMMENTAR_VAKTER.tekst} lærer`, tid: "2026-11-02T10:00:00Z", forsok: 1 }),
        ],
      }),
      sub("Elev-VAKT-Per", "submitted", {
        submitted_at: LEVERT,
        body: SENTINEL,
        trad: (id) => [
          canvasKommentar({ forfatter: LAERER, forfatterNavn: "Test Lærer", tekst: `${KOMMENTAR_VAKTER.tekst} lenke mangler`, tid: "2026-11-01T09:00:00Z" }),
          canvasKommentar({ forfatter: id, forfatterNavn: "Elev-VAKT-Per", tekst: `${KOMMENTAR_VAKTER.tekst} per svar`, tid: "2026-11-03T09:00:00Z", forsok: 2, vedlegg: true, media: true }),
        ],
      }),
      sub("Elev-VAKT-Privat", "pending_review", { submitted_at: LEVERT, url: "https://github.com/elevvakt-privat/hemmelig" }),
      sub("Elev-VAKT-Feil", "submitted", { submitted_at: LEVERT, url: "https://github.com/elevvakt-feil/x" }),
      sub("Elev-VAKT-Ikke", "unsubmitted", {
        submitted_at: null,
        body: SENTINEL,
        trad: (id) => [
          canvasKommentar({ forfatter: id, forfatterNavn: "Elev-VAKT-Ikke", tekst: `${KOMMENTAR_VAKTER.tekst} syk i dag`, tid: "2026-11-04T08:00:00Z" }),
        ],
      }),
      // Ikke levert og ingen tråd: 0.3.0 viste den ikke; 0.4.0 (G3) i «Ikke levert (N)».
      sub("Elev-VAKT-Stille", "unsubmitted", { submitted_at: null }),
      // 0.4.0 (G3): karakter, men ingen innlevering («graded» uten submitted_at, f.eks.
      // on_paper). Ikke levert: i «Ikke levert (N)» med karakteren, aldri klonet.
      sub("Elev-VAKT-Papir", "graded", { submitted_at: null, grade: "B" }),
    ],
    [`${KURS_A}:${OPPG.css}`]: Array.from({ length: 22 }, (_, i) =>
      sub(`Elev-VAKT-B${i + 1}`, "submitted", { submitted_at: LEVERT, url: `https://github.com/elevvakt-b${i + 1}/css` }),
    ),
    [`${KURS_A}:${OPPG.sql}`]: [],
    [`${KURS_B}:${OPPG.html}`]: [sub("Elev-VAKT-Beta", "submitted", { submitted_at: LEVERT, url: "https://github.com/elevvakt-beta/oppg" })],
  },
};

// Tekster som aldri skal finnes i globalState/workspaceState (state.vscdb) eller
// OutputChannel: elevnavn, GitHub-eiere, labels (kurs- og oppgavenavn) og ID-er fra Canvas.
const ELEVDATA = ["VAKT", "elevvakt", String(KURS_A), String(KURS_B), String(OPPG.html), String(OPPG.css), "777300"];

module.exports = { SENTINEL, KURS_A, KURS_B, OPPG, scenario, ELEVDATA, KOMMENTAR_VAKTER, ALDRI, canvasKommentar };
