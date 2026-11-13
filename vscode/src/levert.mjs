// 0.4.0 (plan G3, tilsynets O4 revidert, kritiker B1): én felles definisjon av
// «levert» for hele VS Code-utvidelsen. Brukes av treet (bla.mjs), kloningen
// (bla-vindu.js, forfiltrering før splitSubmissions/selectForBulk) og panelet
// (panel.mjs: bindInnlevering, vurderFersk, vurderFerskSvar, statustekst).
// Ingen import av `vscode`, så den kan testes med `node --test`.
//
// Levert = `submittedAt` er en ikke-tom streng (Canvas sin `submitted_at`). Ingen
// reserveregel via `workflowState`: en elev med karakter, men uten `submitted_at`
// («graded» uten innlevering, f.eks. on_paper), er ikke levert.
//
// `submittedAt` finnes bare når innleveringene er hentet med
// `listSubmissions(…, { levertOgFritak: true })` (null når Canvas ikke har tid).
// Mangler feltet helt (`undefined`), er det en programmeringsfeil (glemt valg eller
// en fikstur uten `submitted_at`), og funksjonen kaster i stedet for å gjette
// (plan v2, rettelse 2).
export function erLevert(sub) {
  if (!sub || typeof sub !== "object") throw new TypeError("erLevert: ingen innlevering");
  if (sub.submittedAt === undefined) {
    throw new Error("erLevert: submittedAt mangler (hentet uten { levertOgFritak: true }?)");
  }
  return typeof sub.submittedAt === "string" && sub.submittedAt !== "";
}
