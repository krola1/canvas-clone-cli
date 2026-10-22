// Canvas har ingen reell fagkategori-metadata på oppgaver (assignment groups
// her heter bare "Assignments"/"Imported Assignments"), så kategorisering må
// gjettes fra selve oppgavenavnet. Dette er beste-innsats: alt som ikke
// matcher et mønster havner i "uncategorized" og er fortsatt synlig via
// "Vis alle" / en egen "(Ukategorisert)"-kategori.

const MODUL_RE = /([A-Za-zÆØÅæøå#]+(?:\s[A-Za-zÆØÅæøå#]+)?)\s+modul\s+(\d+)/gi;
const TIER_RE = /^([A-Za-zÆØÅæøå#&\s]+?)\s+(Basic|Advanced|Intermediate|Fordypning)\b/i;
const SUBJECT_RE = /^([A-Za-zÆØÅæøå0-9#&.\s]+?)\s+(?:[Oo]ppgaver?|[Aa]ssignment|[Cc]ase)\b/;

// Returnerer en liste med {fagretning, modul}. "modul" er null når oppgaven
// bare har ett kategori-nivå (f.eks. "SQL Oppgave 1" -> fagretning "SQL").
// En oppgave kan havne i flere fagretninger samtidig, f.eks.
// "Frontend modul 1 & Fullstack modul 1: ..." -> begge.
export function categorize(name) {
  const modulMatches = [...name.matchAll(MODUL_RE)];
  if (modulMatches.length > 0) {
    return modulMatches.map((m) => ({ fagretning: m[1].trim(), modul: `modul ${m[2]}` }));
  }

  const tier = name.match(TIER_RE);
  if (tier) return [{ fagretning: tier[1].trim(), modul: tier[2] }];

  const subject = name.match(SUBJECT_RE);
  if (subject) return [{ fagretning: subject[1].trim(), modul: null }];

  return [];
}

const NONE_KEY = "__none__";

// Bygger fagretning -> modul -> oppgaver[]. Oppgaver uten treff samles i
// `uncategorized`.
export function buildCategoryTree(assignments) {
  const tree = new Map();
  const uncategorized = [];

  for (const a of assignments) {
    const cats = categorize(a.name);
    if (cats.length === 0) {
      uncategorized.push(a);
      continue;
    }
    for (const { fagretning, modul } of cats) {
      if (!tree.has(fagretning)) tree.set(fagretning, new Map());
      const modulMap = tree.get(fagretning);
      const key = modul ?? NONE_KEY;
      if (!modulMap.has(key)) modulMap.set(key, []);
      modulMap.get(key).push(a);
    }
  }

  const categories = [...tree.entries()].map(([fagretning, modulMap]) => {
    const all = [...modulMap.values()].flat();
    const needsGrading = all.reduce((sum, a) => sum + a.needsGrading, 0);
    const hasSubmodules = !(modulMap.size === 1 && modulMap.has(NONE_KEY));
    return { fagretning, modulMap, all, needsGrading, hasSubmodules };
  });

  return { categories, uncategorized };
}
