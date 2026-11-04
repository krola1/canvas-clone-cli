// Vurdering av `npm audit --json` for release-check (steg 2), med en eksplisitt
// tillatelsesliste over kjente advisories (Lars 2026-11-04, «3 godtar»; se
// .claude/docs/DECISIONS.md 2026-11-04). Ren logikk uten nett og uten filer, så
// den kan testes med `node --test` (tests/vscode-audit.test.js). Kjøres av
// sjekk-audit.mjs.
//
// Regler (stopper release-check hvis én brytes):
//   - Alle advisories på moderate eller høyere må stå i TILLATT (pakkenavn og GHSA-id).
//   - Hver oppføring i TILLATT har et maksnivå (`moderate`, Lars 2026-11-04, «1a»):
//     blir en tillatt advisory oppgradert til high, critical eller et ukjent nivå,
//     er det en feil.
//   - Hver sårbar pakke på moderate eller høyere må bare finnes som devDependency
//     (`dev: true` i package-lock.json for alle `nodes`); en tillatt advisory i en
//     ikke-dev-avhengighet er en feil.
//   - Formatet må være det vi kjenner (Lars 2026-11-04, «2a»), ellers feil i stedet
//     for å slippe gjennom: `auditReportVersion` 2; hver oppføring på moderate eller
//     høyere har `via` som en ikke-tom liste; hver tekstreferanse i `via` peker på en
//     oppføring i `vulnerabilities`; `metadata.vulnerabilities` finnes, og antallet
//     moderate/high/critical der stemmer med oppføringene i `vulnerabilities`.
//   - En rapport som ikke kan leses (feil fra npm, mangler `vulnerabilities`) er en feil.
// Unntaket vurderes på nytt ved hver release (Lars 2026-11-04, «4 a»), og fjernes
// når oppstrøms fiks finnes.

export const TILLATT = Object.freeze([
  Object.freeze({ pakke: "glob", ghsa: "GHSA-3g3m-2fjr-6pw4", maksNivaa: "moderate" }),
  Object.freeze({ pakke: "minimatch", ghsa: "GHSA-g3hv-75wg-m249", maksNivaa: "moderate" }),
]);

const NIVAA = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
// Ukjent nivå regnes som critical, så det aldri slipper gjennom.
const nivaa = (sev) => (Object.hasOwn(NIVAA, String(sev)) ? NIVAA[sev] : NIVAA.critical);
const minstModerate = (sev) => nivaa(sev) >= NIVAA.moderate;
const TELLES = ["moderate", "high", "critical"];

const ghsaFra = (via) => {
  // Bare adressen npm oppgir (https://github.com/advisories/GHSA-xxxx-xxxx-xxxx).
  const m = String(via?.url ?? "").match(/^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/);
  return m ? m[1] : null;
};

// { ok, godtatt: ["glob GHSA-... (moderate)", ...], feil: [tekst, ...], ikkeFunnet: [...] }
export function vurderAudit(rapport, lock, tillatt = TILLATT) {
  const feil = [];
  const godtatt = new Set();
  if (!rapport || typeof rapport !== "object" || rapport.error || typeof rapport.vulnerabilities !== "object" || rapport.vulnerabilities === null) {
    return { ok: false, godtatt: [], feil: ["npm audit ga ingen lesbar rapport"], ikkeFunnet: [] };
  }
  const pakker = lock?.packages;
  if (!pakker || typeof pakker !== "object") {
    return { ok: false, godtatt: [], feil: ["package-lock.json mangler `packages` (lockfileVersion 2/3 kreves)"], ikkeFunnet: [] };
  }
  if (rapport.auditReportVersion !== 2) {
    return { ok: false, godtatt: [], feil: [`ukjent rapportformat fra npm audit: auditReportVersion ${JSON.stringify(rapport.auditReportVersion)} (bare 2 støttes)`], ikkeFunnet: [] };
  }
  const meta = rapport.metadata?.vulnerabilities;
  if (!meta || typeof meta !== "object") {
    return { ok: false, godtatt: [], feil: ["npm audit-rapporten mangler `metadata.vulnerabilities`"], ikkeFunnet: [] };
  }
  const sett = new Set();
  const telt = { moderate: 0, high: 0, critical: 0 };
  let vurdert = 0;
  for (const [navn, v] of Object.entries(rapport.vulnerabilities)) {
    if (Object.hasOwn(telt, v?.severity)) telt[v.severity] += 1;
    if (!minstModerate(v?.severity)) continue;
    vurdert += 1;
    if (!Array.isArray(v.via) || v.via.length === 0) {
      feil.push(`${navn} (${v?.severity}): \`via\` er ikke en ikke-tom liste, kan ikke se hvilken advisory det gjelder`);
    }
    for (const via of Array.isArray(v.via) ? v.via : []) {
      if (typeof via === "string") {
        // Følgefeil av en annen oppføring, sjekkes der, men den må finnes.
        if (!Object.hasOwn(rapport.vulnerabilities, via)) feil.push(`${navn}: \`via\` peker på «${via}», som ikke finnes i rapporten`);
        continue;
      }
      if (!minstModerate(via?.severity)) continue;
      const ghsa = ghsaFra(via);
      const t = ghsa ? tillatt.find((t) => t.pakke === via.name && t.ghsa === ghsa && via.name === navn) : undefined;
      if (!t) {
        feil.push(`advisory utenfor tillatelseslisten: ${via?.name ?? navn} ${ghsa ?? via?.url ?? "(ukjent id)"} (${via?.severity}) ${via?.title ?? ""}`.trim());
        continue;
      }
      const maks = t.maksNivaa ?? "moderate";
      if (nivaa(via.severity) > nivaa(maks)) {
        feil.push(`tillatt advisory har fått høyere alvorlighet enn unntaket dekker: ${via.name} ${ghsa} er nå ${JSON.stringify(via.severity)}, unntaket gjelder bare til og med ${maks}; vurder unntaket på nytt`);
        continue;
      }
      sett.add(`${via.name}/${ghsa}`);
      godtatt.add(`${via.name} ${ghsa} (${via.severity})`);
    }
    const noder = Array.isArray(v.nodes) ? v.nodes : [];
    if (noder.length === 0) feil.push(`${navn}: npm audit oppgir ingen plassering, kan ikke se om den bare er devDependency`);
    for (const node of noder) {
      if (pakker[node]?.dev !== true) feil.push(`${navn} (${v.severity}) finnes i en ikke-dev-avhengighet: ${node}`);
    }
  }
  const metaSum = TELLES.reduce((sum, sev) => sum + (Number(meta[sev]) || 0), 0);
  if (metaSum > 0 && vurdert === 0) {
    feil.push(`metadata oppgir ${metaSum} sårbarheter på moderate eller høyere, men ingen oppføringer på moderate eller høyere ble funnet i rapporten`);
  }
  for (const sev of TELLES) {
    if (meta[sev] !== telt[sev]) feil.push(`metadata oppgir ${JSON.stringify(meta[sev])} ${sev}, men rapporten har ${telt[sev]} slike oppføringer`);
  }
  const ikkeFunnet = tillatt.filter((t) => !sett.has(`${t.pakke}/${t.ghsa}`)).map((t) => `${t.pakke} ${t.ghsa}`);
  return { ok: feil.length === 0, godtatt: [...godtatt].sort(), feil, ikkeFunnet };
}
