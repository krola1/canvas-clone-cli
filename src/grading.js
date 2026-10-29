// Rene hjelpefunksjoner for karaktersetting og navnevisning (tilsynets T1/T1a):
// karakter skal aldri havne på feil elev fordi to innleveringer peker på
// samme GitHub-bruker, og to elever med samme visningsnavn skal kunne skilles.

// Navnet vi faktisk viser for en innlevering. Default er GitHub-brukernavnet
// (utledet av extractRepo); Canvas-navnet brukes som fallback når det ikke er
// funnet noen repo-lenke, eller hvis displayName er satt til "canvas".
export function displayName(sub, config) {
  if (config?.displayName === "canvas") return sub.studentName;
  return sub.owner ?? sub.studentName;
}

// ALLE innleveringer med repo-eier lik github (case-insensitivt) - ikke bare
// første treff.
export function findByGithub(submissions, github) {
  const needle = String(github ?? "").toLowerCase();
  if (!needle) return [];
  return submissions.filter((s) => s.owner && s.owner.toLowerCase() === needle);
}

// Avgjør hva --github-flyten skal gjøre gitt antall treff:
//   none               - ingen treff
//   single             - nøyaktig ett treff (target)
//   abort-ambiguous    - flere treff uten TTY: kan ikke velge trygt, uansett --confirm
//   preview-ambiguous  - flere treff med TTY, uten --confirm: vis kandidatene, send ingenting
//   choose             - flere treff med TTY og --confirm: la læreren velge eksplisitt
export function resolveGradeTarget({ matches, isTTY, confirm }) {
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "single", target: matches[0] };
  if (!isTTY) return { kind: "abort-ambiguous" };
  if (!confirm) return { kind: "preview-ambiguous" };
  return { kind: "choose" };
}

// Visningsnavn for hver innlevering i lista, med et skillende navn i parentes
// BARE når to eller flere har samme visningsnavn: Canvas-navnet, eller
// GitHub-navnet hvis visningsnavnet allerede er Canvas-navnet.
export function labelWithDuplicates(list, config) {
  const bases = list.map((s) => displayName(s, config));
  const counts = new Map();
  for (const b of bases) counts.set(b, (counts.get(b) ?? 0) + 1);
  return list.map((s, i) => {
    const base = bases[i];
    if (counts.get(base) < 2) return base;
    const extra = base === s.studentName ? s.owner : s.studentName;
    return extra ? `${base} (${extra})` : base;
  });
}
