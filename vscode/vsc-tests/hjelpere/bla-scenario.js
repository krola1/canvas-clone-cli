// Falske testdata for bla og klone (D5), i Canvas sitt format. Brukes av
// vsc-tests/tre-og-kloning.vsctest.js og prøveriggen (scripts/provekjoring.mjs,
// scenario «klone»). Bare falske data (T19). Alle navn, eiere og ID-er er
// laget slik at de kan letes etter etterpå (D0 m, T11): «VAKT», «elevvakt»
// og ID-ene under ELEVDATA skal aldri finnes i lagret tilstand eller logger.
const SENTINEL = "BODY-VAKTPOST-5d2f8c"; // innleveringens body (T-A)
const KURS_A = 7771001;
const KURS_B = 7771002;
const OPPG = { html: 7772001, css: 7772002, sql: 7772003 };

let uid = 7773000;
function sub(name, state, { url = null, body = null } = {}) {
  uid++;
  return { user_id: uid, user: { id: uid, name }, workflow_state: state, url, body, grade: null, score: null };
}
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
      sub("Elev-VAKT-Ola", "submitted", { body: `${SENTINEL} https://github.com/elevvakt-ola/oppg` }),
      sub("Elev-VAKT-Kari", "graded", { url: "https://github.com/elevvakt-kari/oppg", body: `<p>${SENTINEL}</p>` }),
      sub("Elev-VAKT-Per", "submitted", { body: SENTINEL }),
      sub("Elev-VAKT-Privat", "pending_review", { url: "https://github.com/elevvakt-privat/hemmelig" }),
      sub("Elev-VAKT-Feil", "submitted", { url: "https://github.com/elevvakt-feil/x" }),
      sub("Elev-VAKT-Ikke", "unsubmitted", { body: SENTINEL }),
    ],
    [`${KURS_A}:${OPPG.css}`]: Array.from({ length: 22 }, (_, i) =>
      sub(`Elev-VAKT-B${i + 1}`, "submitted", { url: `https://github.com/elevvakt-b${i + 1}/css` }),
    ),
    [`${KURS_A}:${OPPG.sql}`]: [],
    [`${KURS_B}:${OPPG.html}`]: [sub("Elev-VAKT-Beta", "submitted", { url: "https://github.com/elevvakt-beta/oppg" })],
  },
};

// Tekster som aldri skal finnes i globalState/workspaceState (state.vscdb) eller
// OutputChannel: elevnavn, GitHub-eiere, labels (kurs- og oppgavenavn) og ID-er fra Canvas.
const ELEVDATA = ["VAKT", "elevvakt", String(KURS_A), String(KURS_B), String(OPPG.html), String(OPPG.css), "777300"];

module.exports = { SENTINEL, KURS_A, KURS_B, OPPG, scenario, ELEVDATA };
