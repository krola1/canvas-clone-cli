// Release-check steg 2 (vscode/scripts/audit.mjs): `npm audit --json` vurdert mot
// tillatelseslisten (Lars 2026-11-04, DECISIONS 2026-11-04). Bare falske
// rapporter i npm sitt format (auditReportVersion 2); ingen nett, ingen npm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILLATT, vurderAudit } from "../vscode/scripts/audit.mjs";

const adv = (name, ghsa, severity = "moderate") => ({
  source: 1,
  name,
  dependency: name,
  title: `falsk ${name}`,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
  range: "<99",
});
const vuln = (name, via, severity = "moderate") => ({ name, severity, isDirect: false, via, effects: [], range: "*", nodes: [`node_modules/${name}`], fixAvailable: false });
// Slik rapporten så ut 2026-11-04 (forkortet).
const kjent = () => ({
  auditReportVersion: 2,
  vulnerabilities: {
    glob: vuln("glob", [adv("glob", "GHSA-3g3m-2fjr-6pw4"), "minimatch"]),
    minimatch: vuln("minimatch", [adv("minimatch", "GHSA-g3hv-75wg-m249")]),
    mocha: vuln("mocha", ["glob", "minimatch"]),
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 3, high: 0, critical: 0, total: 3 } },
});
const lockMed = (dev = {}) => ({
  lockfileVersion: 3,
  packages: {
    "": { name: "x", devDependencies: { mocha: "*" } },
    "node_modules/glob": { dev: dev.glob ?? true },
    "node_modules/minimatch": { dev: dev.minimatch ?? true },
    "node_modules/mocha": { dev: dev.mocha ?? true },
    "node_modules/lodash": { dev: dev.lodash ?? true },
  },
});

test("tillatelseslisten er nøyaktig de to kjente advisoriene, med maksnivå moderate", () => {
  assert.deepEqual(
    TILLATT.map((t) => `${t.pakke} ${t.ghsa} ${t.maksNivaa}`),
    ["glob GHSA-3g3m-2fjr-6pw4 moderate", "minimatch GHSA-g3hv-75wg-m249 moderate"],
  );
});

test("de kjente advisoriene i devDependencies godtas og navngis", () => {
  const r = vurderAudit(kjent(), lockMed());
  assert.equal(r.ok, true, JSON.stringify(r.feil));
  assert.deepEqual(r.godtatt, ["glob GHSA-3g3m-2fjr-6pw4 (moderate)", "minimatch GHSA-g3hv-75wg-m249 (moderate)"]);
  assert.deepEqual(r.ikkeFunnet, []);
});

test("en annen advisory på moderate eller høyere gir feil; low godtas", () => {
  for (const severity of ["moderate", "high", "critical"]) {
    const rap = kjent();
    rap.vulnerabilities.lodash = vuln("lodash", [adv("lodash", "GHSA-aaaa-bbbb-cccc", severity)], severity);
    rap.metadata.vulnerabilities[severity] = (rap.metadata.vulnerabilities[severity] ?? 0) + 1;
    const r = vurderAudit(rap, lockMed());
    assert.equal(r.ok, false, severity);
    assert.match(r.feil.join("\n"), /lodash GHSA-aaaa-bbbb-cccc/);
  }
  const rap = kjent();
  rap.vulnerabilities.lodash = vuln("lodash", [adv("lodash", "GHSA-aaaa-bbbb-cccc", "low")], "low");
  assert.equal(vurderAudit(rap, lockMed()).ok, true);
});

test("ny advisory på en tillatt pakke, eller tillatt id på feil pakke, gir feil", () => {
  const rap = kjent();
  rap.vulnerabilities.glob.via.push(adv("glob", "GHSA-zzzz-yyyy-xxxx"));
  assert.equal(vurderAudit(rap, lockMed()).ok, false);
  const rap2 = kjent();
  rap2.vulnerabilities.lodash = vuln("lodash", [adv("lodash", "GHSA-3g3m-2fjr-6pw4")]);
  assert.equal(vurderAudit(rap2, lockMed()).ok, false);
  const rap3 = kjent();
  rap3.vulnerabilities.minimatch.via = [{ ...adv("minimatch", "GHSA-g3hv-75wg-m249"), url: "https://ond.example/GHSA-g3hv-75wg-m249" }];
  assert.equal(vurderAudit(rap3, lockMed()).ok, false, "id-en må komme fra github.com/advisories");
});

test("en tillatt advisory i en ikke-dev-avhengighet gir feil, også via en følgefeil", () => {
  for (const pakke of ["glob", "minimatch", "mocha"]) {
    const r = vurderAudit(kjent(), lockMed({ [pakke]: false }));
    assert.equal(r.ok, false, pakke);
    assert.match(r.feil.join("\n"), new RegExp(`${pakke} .*ikke-dev`));
  }
  const rap = kjent();
  rap.vulnerabilities.glob.nodes = ["node_modules/glob", "node_modules/noe/node_modules/glob"];
  assert.equal(vurderAudit(rap, lockMed()).ok, false, "ukjent plassering regnes ikke som dev");
  const rap2 = kjent();
  rap2.vulnerabilities.glob.nodes = [];
  assert.equal(vurderAudit(rap2, lockMed()).ok, false, "ingen plassering");
});

test("uleselig rapport eller lockfil gir feil; borte advisory meldes som «kan fjernes»", () => {
  assert.equal(vurderAudit(null, lockMed()).ok, false);
  assert.equal(vurderAudit({ error: { code: "ENOTFOUND" } }, lockMed()).ok, false);
  assert.equal(vurderAudit({ auditReportVersion: 2 }, lockMed()).ok, false);
  assert.equal(vurderAudit(kjent(), { lockfileVersion: 1, dependencies: {} }).ok, false);
  const r = vurderAudit({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { moderate: 0, high: 0, critical: 0, total: 0 } } }, lockMed());
  assert.equal(r.ok, true);
  assert.deepEqual(r.ikkeFunnet, ["glob GHSA-3g3m-2fjr-6pw4", "minimatch GHSA-g3hv-75wg-m249"]);
});

// Rettingsrunde 2 (Lars 2026-11-04, «1a»): maksnivå per tillatt advisory.
test("tillatt advisory oppgradert over moderate (high, critical, ukjent) gir feil", () => {
  for (const severity of ["high", "critical", "ukjent-nivaa"]) {
    const rap = kjent();
    rap.vulnerabilities.minimatch.via = [adv("minimatch", "GHSA-g3hv-75wg-m249", severity)];
    const r = vurderAudit(rap, lockMed());
    assert.equal(r.ok, false, severity);
    assert.match(r.feil.join("\n"), /minimatch GHSA-g3hv-75wg-m249 er nå .*unntaket gjelder bare til og med moderate/, severity);
    assert.ok(!r.godtatt.some((g) => g.startsWith("minimatch")), severity);
  }
});

// Rettingsrunde 2 (Lars 2026-11-04, «2a»): ukjent format feiler i stedet for å slippe gjennom.
test("auditReportVersion som ikke er 2 gir feil", () => {
  for (const versjon of [1, 3, "2", undefined]) {
    const rap = kjent();
    rap.auditReportVersion = versjon;
    const r = vurderAudit(rap, lockMed());
    assert.equal(r.ok, false, String(versjon));
    assert.match(r.feil.join("\n"), /auditReportVersion/);
  }
});

test("oppføring på moderate eller høyere uten ikke-tom `via`-liste gir feil", () => {
  for (const via of [[], undefined, "glob", {}]) {
    const rap = kjent();
    rap.vulnerabilities.mocha.via = via;
    const r = vurderAudit(rap, lockMed());
    assert.equal(r.ok, false, JSON.stringify(via));
    assert.match(r.feil.join("\n"), /mocha .*`via` er ikke en ikke-tom liste/);
  }
});

test("tekstreferanse i `via` til en oppføring som ikke finnes gir feil", () => {
  const rap = kjent();
  rap.vulnerabilities.mocha.via = ["glob", "finnes-ikke"];
  const r = vurderAudit(rap, lockMed());
  assert.equal(r.ok, false);
  assert.match(r.feil.join("\n"), /mocha: `via` peker på «finnes-ikke»/);
});

test("metadata med moderate eller høyere, men ingen slike oppføringer, gir feil", () => {
  const rap = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { moderate: 0, high: 2, critical: 0, total: 2 } } };
  const r = vurderAudit(rap, lockMed());
  assert.equal(r.ok, false);
  assert.match(r.feil.join("\n"), /metadata oppgir 2 .*ingen oppføringer/);
});

test("metadata som ikke stemmer med oppføringene, eller mangler, gir feil", () => {
  const rap = kjent();
  rap.metadata.vulnerabilities.moderate = 4;
  const r = vurderAudit(rap, lockMed());
  assert.equal(r.ok, false);
  assert.match(r.feil.join("\n"), /metadata oppgir 4 moderate, men rapporten har 3/);
  const rap2 = kjent();
  delete rap2.metadata;
  const r2 = vurderAudit(rap2, lockMed());
  assert.equal(r2.ok, false);
  assert.match(r2.feil.join("\n"), /mangler `metadata.vulnerabilities`/);
});
