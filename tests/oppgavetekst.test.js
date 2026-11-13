// Tokenizeren for oppgavetekst (plan 0.4.0 G1a; tilsynets O1, O2, O7).
// Alle kjøringer teller sikkerhetsnettet: det skal slå til 0 ganger per vaktpost
// og for fuzz-korpuset (rettelse 3 til plan v2), så feil i URL-filteret ikke skjules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tilOppgavetekst } from "../src/oppgavetekst.js";

const KILDE = new URL("../src/oppgavetekst.js", import.meta.url);

function kjor(html, ekstra = {}) {
  let nett = 0;
  const res = tilOppgavetekst(html, { ...ekstra, vedSikkerhetsnett: () => nett++ });
  return { res, nett };
}

const biterTekst = (biter) => biter.map((b) => b.tekst).join("");
function blokkTekst(b) {
  return b.type === "liste" ? b.punkter.map(biterTekst).join("\n") : biterTekst(b.biter);
}
function alleStrenger(res) {
  if (res.status !== "ok") return [];
  const ut = [];
  for (const b of res.blokker) {
    const lister = b.type === "liste" ? b.punkter : [b.biter];
    for (const biter of lister) for (const bit of biter) ut.push(bit.tekst);
  }
  return ut;
}

// Kjører og krever ok + sikkerhetsnett 0; gir sammenslått tekst (blokker skilt med \n).
function tekst(html) {
  const { res, nett } = kjor(html);
  assert.equal(nett, 0, "sikkerhetsnettet slo til");
  assert.equal(res.status, "ok", `status ${res.status}`);
  sjekkSkjema(res);
  return res.blokker.map(blokkTekst).join("\n");
}

// --- Eksakt modellskjema ----------------------------------------------------

function sjekkNokler(o, nokler) {
  assert.deepEqual(Object.keys(o).sort(), [...nokler].sort());
}
function sjekkBiter(biter) {
  assert.ok(Array.isArray(biter) && biter.length > 0, "biter tom");
  for (const b of biter) {
    assert.equal(Object.getPrototypeOf(b), Object.prototype);
    sjekkNokler(b, ["tekst", "fet", "kursiv"]);
    assert.equal(typeof b.tekst, "string");
    assert.ok(b.tekst.length > 0, "tom bit");
    assert.equal(typeof b.fet, "boolean");
    assert.equal(typeof b.kursiv, "boolean");
  }
}
function sjekkSkjema(res) {
  if (res.status !== "ok") {
    sjekkNokler(res, ["status"]);
    assert.ok(["tom", "for_stor", "feil"].includes(res.status), res.status);
    return;
  }
  sjekkNokler(res, ["status", "blokker"]);
  assert.ok(Array.isArray(res.blokker) && res.blokker.length >= 1 && res.blokker.length <= 2000);
  for (const b of res.blokker) {
    switch (b.type) {
      case "overskrift":
        sjekkNokler(b, ["type", "niva", "biter"]);
        assert.ok(Number.isInteger(b.niva) && b.niva >= 1 && b.niva <= 6);
        sjekkBiter(b.biter);
        break;
      case "avsnitt":
      case "kode":
        sjekkNokler(b, ["type", "biter"]);
        sjekkBiter(b.biter);
        break;
      case "sitat":
        sjekkNokler(b, ["type", "dybde", "biter"]);
        assert.ok(Number.isInteger(b.dybde) && b.dybde >= 1 && b.dybde <= 10);
        sjekkBiter(b.biter);
        break;
      case "liste":
        sjekkNokler(b, ["type", "nummerert", "start", "dybde", "punkter"]);
        assert.equal(typeof b.nummerert, "boolean");
        assert.ok(Number.isInteger(b.start) && b.start >= 1);
        assert.ok(Number.isInteger(b.dybde) && b.dybde >= 1 && b.dybde <= 10);
        assert.ok(Array.isArray(b.punkter) && b.punkter.length > 0);
        for (const p of b.punkter) sjekkBiter(p);
        break;
      default:
        assert.fail(`ukjent blokktype ${b.type}`);
    }
  }
}

const FORBUDT = /:\/\/|verifier|www\.|\/files\/\d/i;
function ingenUrl(res) {
  for (const s of alleStrenger(res)) assert.doesNotMatch(s, FORBUDT);
  if (res.status === "ok") for (const b of res.blokker) assert.doesNotMatch(blokkTekst(b), FORBUDT);
}

// --- Grunnleggende ------------------------------------------------------------

test("status: tom for ikke-streng, tom streng og bare mellomrom/kommentarer", () => {
  for (const v of [null, undefined, 42, {}, [], "", "   ", "<p>&nbsp;</p>", "<!-- x -->", "<script>x</script>"]) {
    assert.deepEqual(tilOppgavetekst(v), { status: "tom" });
  }
});

test("kaster aldri, heller ikke når valg er rart eller tellefunksjonen kaster", () => {
  assert.doesNotThrow(() => tilOppgavetekst("<p>x</p>", null));
  assert.doesNotThrow(() => tilOppgavetekst("<p>x</p>", 5));
  const r = tilOppgavetekst("<p>a", { vedSikkerhetsnett: "ikke funksjon" });
  assert.equal(r.status, "ok");
  // Feil inne i funksjonen → fast status, aldri feiltekst eller input
  const f = tilOppgavetekst("<p>verifier</p>", {
    get vedSikkerhetsnett() {
      throw new Error("hemmelig verifier=abc");
    },
  });
  assert.deepEqual(f, { status: "feil" });
});

test("modell: overskrift, avsnitt, fet/kursiv, br, sitat, kode, lister, tabellrad", () => {
  const { res } = kjor(
    "<h2>Tittel</h2><p>Hei <b>fet</b> og <em>kursiv</em><br>ny linje</p>" +
      "<blockquote><p>sitat</p></blockquote><pre>  a\n    b</pre>" +
      "<ol><li>en</li><li>to</li></ol><table><tr><th>A</th><td>B</td></tr></table>",
  );
  sjekkSkjema(res);
  assert.deepEqual(res.blokker, [
    { type: "overskrift", niva: 2, biter: [{ tekst: "Tittel", fet: false, kursiv: false }] },
    {
      type: "avsnitt",
      biter: [
        { tekst: "Hei ", fet: false, kursiv: false },
        { tekst: "fet", fet: true, kursiv: false },
        { tekst: " og ", fet: false, kursiv: false },
        { tekst: "kursiv", fet: false, kursiv: true },
        { tekst: "\nny linje", fet: false, kursiv: false },
      ],
    },
    { type: "sitat", dybde: 1, biter: [{ tekst: "sitat", fet: false, kursiv: false }] },
    { type: "kode", biter: [{ tekst: "  a\n    b", fet: false, kursiv: false }] },
    {
      type: "liste",
      nummerert: true,
      start: 1,
      dybde: 1,
      punkter: [[{ tekst: "en", fet: false, kursiv: false }], [{ tekst: "to", fet: false, kursiv: false }]],
    },
    { type: "avsnitt", biter: [{ tekst: "A | B", fet: false, kursiv: false }] },
  ]);
});

test("div/span/section/font flates ut; div gir blokkgrense", () => {
  assert.equal(tekst('<div><span style="x">a</span><font color="red">b</font></div><section>c</section>'), "ab\nc");
});

test("nøstet liste: egen blokk med dybde, foreldrelista fortsetter med riktig start", () => {
  const { res } = kjor("<ol><li>a<ol><li>b</li></ol></li><li>c</li></ol>");
  sjekkSkjema(res);
  assert.deepEqual(
    res.blokker.map((b) => [b.type, b.dybde, b.start, blokkTekst(b)]),
    [
      ["liste", 1, 1, "a"],
      ["liste", 2, 1, "b"],
      ["liste", 1, 2, "c"],
    ],
  );
});

// --- O1 ----------------------------------------------------------------------

test("O1: <script>, onerror=, javascript:, <svg>, <iframe>, <img>, <a href>, entiteter, uavsluttede tagger", () => {
  const html =
    "<p>Før<script>alert('x')</script>etter</p>" +
    '<p><img src="x" onerror="alert(1)"></p>' +
    '<p><a href="javascript:alert(2)">klikk</a></p>' +
    '<p>a<svg onload="alert(3)"><text>svgtekst</text><svg><g/></svg></svg>b</p>' +
    '<p><iframe src="https://evil.example/"><p>inni</p></iframe></p>' +
    '<p><img src="bilde.png" alt="Et bilde"></p>' +
    '<p><a href="https://vert.no/x" title="tittel" class="k" style="color:red">lenketekst</a></p>' +
    "<p>&lt;script&gt;alert(4)&lt;/script&gt;</p>" +
    "<p><b>uavsluttet <i>tagg";
  const { res, nett } = kjor(html);
  assert.equal(nett, 0);
  sjekkSkjema(res);
  const tekster = res.blokker.map(blokkTekst);
  assert.deepEqual(tekster, [
    "Føretter",
    "[bilde]",
    "klikk",
    "ab",
    "[innebygd innhold]",
    "Et bilde",
    "lenketekst",
    "<script>alert(4)</script>",
    "uavsluttet tagg",
  ]);
  const json = JSON.stringify(res);
  for (const s of ["alert('x')", "alert(1)", "alert(2)", "alert(3)", "onerror", "onload", "href", "src", "evil", "inni",
    "svgtekst", "bilde.png", "tittel", "color", "javascript"]) {
    assert.ok(!json.includes(s), `fant ${s}`);
  }
  // uavsluttet fet/kursiv gjelder ut teksten
  const siste = res.blokker[res.blokker.length - 1].biter;
  assert.deepEqual(siste, [
    { tekst: "uavsluttet ", fet: true, kursiv: false },
    { tekst: "tagg", fet: true, kursiv: true },
  ]);
});

test("O1: video/audio/object/embed → [innebygd innhold], innholdet fjernes", () => {
  assert.equal(
    tekst('<p>1<video src="v"><track src="t">reserve</video>2<audio>x</audio>3<object data="o">y</object>4<embed src="e">5</p>'),
    "1[innebygd innhold]2[innebygd innhold]3[innebygd innhold]4[innebygd innhold]5",
  );
});

test("O1: ingen attributter kopieres (bare alt på img, som tekst)", () => {
  const json = JSON.stringify(
    tilOppgavetekst('<p id="ID1" class="KL1" style="ST1" data-x="DX1" title="TI1" lang="LA1">t<span alt="ALT1">s</span></p>'),
  );
  for (const s of ["ID1", "KL1", "ST1", "DX1", "TI1", "LA1", "ALT1"]) assert.ok(!json.includes(s), s);
});

test("RCE-lignende HTML: tabell, YouTube-iframe, fillenke med verifier, likning/math, style/span, &nbsp;", () => {
  const html =
    "<p>Lag en nettside om <strong>HTML</strong>.</p>\n" +
    '<table style="border-collapse: collapse; width: 100%;" border="1"><tbody>\n' +
    '<tr><td style="width: 50%;">Kriterium</td><td style="width: 50%;">Poeng</td></tr>\n' +
    "<tr><td>Semantikk</td><td>5</td></tr>\n</tbody></table>\n" +
    '<p><iframe title="YouTube video player" src="https://www.youtube.com/embed/abc123" width="560" height="315" ' +
    'allowfullscreen="allowfullscreen" allow="accelerometer; autoplay"></iframe></p>\n' +
    '<p><a class="instructure_file_link instructure_scribd_file inline_disabled" title="fasit.pdf" ' +
    'href="https://skole.instructure.com/courses/1/files/123?verifier=AbCdEf123&amp;wrap=1" target="_blank" ' +
    'data-api-endpoint="https://skole.instructure.com/api/v1/courses/1/files/123" data-api-returntype="File">fasit.pdf</a></p>\n' +
    '<p><img class="equation_image" title="x^2" src="/equation_images/x%255E2?scale=1" alt="LaTeX: x^2" ' +
    'data-equation-content="x^2" /></p>\n' +
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>=</mo><mn>2</mn></math>\n' +
    '<style>p { color: red; }</style><p><span style="color: #e03e2d;">Viktig</span>&nbsp;frist</p>';
  const { res, nett } = kjor(html);
  assert.equal(nett, 0);
  sjekkSkjema(res);
  ingenUrl(res);
  assert.deepEqual(res.blokker.map(blokkTekst), [
    "Lag en nettside om HTML.",
    "Kriterium | Poeng",
    "Semantikk | 5",
    "[innebygd innhold]",
    "fasit.pdf",
    "LaTeX: x^2",
    "[formel]",
    "Viktig\u00A0frist",
  ]);
  assert.ok(!JSON.stringify(res).includes("AbCdEf123"));
});

// --- O2: vaktposter ---------------------------------------------------------

const VAKTPOSTER = [
  ["URL splittet over <span>", "<p>Fasit: https:<span>//skole.no/files/9?verifier=HEMMELIG</span> slutt</p>", "Fasit: [lenke] slutt"],
  ["URL splittet i mange biter", "<p>a <span>ht</span><b>tp</b><i>://</i>vert.no/x b</p>", "a [lenke] b"],
  ["www over tagger", "<p>a www.<b>vert</b>.no b</p>", "a [lenke] b"],
  ["vert/sti over tagger", "<p>a vert.<i>no</i>/sti b</p>", "a [lenke] b"],
  ["entiteter i URL (&#58; &#x2F;)", "<p>a http&#58;&#x2F;&#x2F;vert.no/x b</p>", "a [lenke] b"],
  ["entiteter i verifier", "<p>a ver&#105;fier&#61;abc b</p>", "a [lenke] b"],
  ["entitet for www", "<p>a &#x77;ww.vert.no b</p>", "a [lenke] b"],
  ["numerisk uten semikolon", "<p>a http&#58//vert.no b</p>", "a [lenke] b"],
  ["uten skjema, med sti", "<p>a vert.no/sti/fil b</p>", "a [lenke] b"],
  ["uten skjema, www", "<p>a www.vert.no b</p>", "a [lenke] b"],
  ["verifier i alt", '<p>a <img alt="se https://skole.no/files/1?verifier=HEMMELIG her"> b</p>', "a se [lenke] her b"],
  ["bare verifier i alt", '<p><img alt="VERIFIER=HEMMELIG"></p>', "[lenke]"],
  ["vert/sti i alt", '<p><img alt="vert.no/x"></p>', "[lenke]"],
  ["alt filtreres for seg (ingen URL igjen)", '<p>a http:<img alt="//vert.no/x"> b</p>', "a http:[lenke] b"],
  ["ødelagt attributt: <a href=\"x>", '<p>før <a href="x>tekst https://vert.no/files/1?verifier=HEMMELIG</a> etter</p>', "før"],
  ["uavsluttet enkelt anførselstegn", "<p>før <a href='x>tekst verifier=HEMMELIG", "før"],
  ["uavsluttet alt", '<p>før <img alt="verifier=HEMMELIG', "før"],
  ["> inne i anførselstegn", '<p>før <a title="a>b https://vert.no/x" href=\'c>d\'>tekst</a> etter</p>', "før tekst etter"],
  ["NUL i URL", "<p>a ht\u0000tp://vert.no b</p>", "a [lenke] b"],
  ["&#0; i URL", "<p>a http&#0;://vert.no b</p>", "a [lenke] b"],
  ["bidi i URL", "<p>a https\u202E://vert.no b</p>", "a [lenke] b"],
  ["bidi-isolat i www", "<p>a w\u2066ww.vert.no b</p>", "a [lenke] b"],
  ["nullbredde i www", "<p>a www\u200B.vert.no b</p>", "a [lenke] b"],
  ["myk bindestrek i verifier", "<p>a ver\u00ADifier=x b</p>", "a [lenke] b"],
  ["BOM i /files/", "<p>a /files/\uFEFF1 b</p>", "a [lenke] b"],
  ["nullbredde som entitet", "<p>a ht&#x200B;tp://vert.no b</p>", "a [lenke] b"],
  ["C1-kontroll i URL", "<p>a http:\u0085//vert.no b</p>", "a [lenke] b"],
  ["URL i ren tekst", "Se https://skole.instructure.com/courses/1/files/9?verifier=HEMMELIG for fasit", "Se [lenke] for fasit"],
  ["verifier-parameter i ren tekst", "Bruk ?verifier=HEMMELIG her", "Bruk [lenke] her"],
  ["/files/ uten vert", "<p>a /courses/1/files/42/download b</p>", "a [lenke] b"],
  ["store bokstaver", "<p>a HTTPS://VERT.NO b WWW.VERT.NO c VeRiFiEr d</p>", "a [lenke] b [lenke] c [lenke] d"],
  ["mailto:", "<p>a mailto:ola@skole.no b</p>", "a [lenke] b"],
  ["data:", "<p>a data:text/html;base64,PHNjcmlwdD4= b</p>", "a [lenke] b"],
  ["javascript:", "<p>a (javascript:alert(1)) b</p>", "a [lenke] b"],
  ["tilsynet: vert.no?token=x", "<p>a vert.no?token=x b</p>", "a [lenke] b"],
  ["tilsynet: vert.no#x", "<p>a vert.no#x b</p>", "a [lenke] b"],
  ["tilsynet: vert.no:8080/x", "<p>a vert.no:8080/x b</p>", "a [lenke] b"],
  ["tilsynet: bruker:pw@vert.no", "<p>a bruker:pw@vert.no b</p>", "a [lenke] b"],
  ["@ foran vert", "<p>a ola@skole.no b</p>", "a [lenke] b"],
  ["IP med port", "<p>a 10.0.0.1:8080 b</p>", "a [lenke] b"],
  ["localhost med port", "<p>a localhost:3000/x b</p>", "a [lenke] b"],
  ["skråstrek bakover", "<p>a vert.no\\sti b</p>", "a [lenke] b"],
  ["avsluttende punktum i vert", "<p>a vert.no./x b</p>", "a [lenke] b"],
  ["Lars 1a: vert.no?token=x", "<p>a vert.no?token=x b</p>", "a [lenke] b"],
  ["NFD i vert (café)", "<p>a cafe\u0301.no/sti b</p>", "a [lenke] b"],
  ["aksent i TLD (NFC)", "<p>a vert.n\u00F3/sti b</p>", "a [lenke] b"],
  ["aksent i TLD (NFD)", "<p>a vert.no\u0301/sti b</p>", "a [lenke] b"],
  ["kombinerende tegn i TLD", "<p>a vert.n\u0336o/x b</p>", "a [lenke] b"],
  ["kombinerende tegn uten sammensatt form", "<p>a vertq\u0303.no/sti b</p>", "a [lenke] b"],
  ["ideografisk punktum", "<p>a vert\u3002no/sti b</p>", "a [lenke] b"],
  ["halvbredde ideografisk punktum", "<p>a vert\uFF61no/sti b</p>", "a [lenke] b"],
  ["fullbredde punktum", "<p>a vert\uFF0Eno/sti b</p>", "a [lenke] b"],
  ["fullbredde verifier", "<p>a ?\uFF56\uFF45\uFF52\uFF49\uFF46\uFF49\uFF45\uFF52=SECRET b</p>", "a [lenke] b"],
  ["fullbredde www", "<p>a \uFF57\uFF57\uFF57\u3002vert\u3002no b</p>", "a [lenke] b"],
  ["// foran vert", "<p>a //vert.no b</p>", "a [lenke] b"],
  ["\\\\ foran vert", "<p>a HTTPS:\\\\vert.no b</p>", "a [lenke] b"],
  [": foran vert", "<p>a http:vert.no b</p>", "a [lenke] b"],
  [":/ foran vert", "<p>a https:/vert.no b</p>", "a [lenke] b"],
  ["ftp: foran vert", "<p>a ftp:vert.no b</p>", "a [lenke] b"],
  ["heltall-IP med // foran (Lars a)", "<p>a //2130706433/x b</p>", "a [lenke] b"],
  ["heltall-IP med : foran (Lars a)", "<p>a http:2130706433/x b</p>", "a [lenke] b"],
  ["heltall-IP med \\\\ foran (Lars a)", "<p>a https:\\\\2130706433 b</p>", "a [lenke] b"],
  ["heltall-IP uten prefiks står (Lars a)", "<p>a 2130706433/x b</p>", "a 2130706433/x b"],
  ["IPv6 i hakeparentes", "<p>a [::1]:80/x b</p>", "a [lenke] b"],
  ["tilsynet: vg.no står", "<p>Les vg.no i dag.</p>", "Les vg.no i dag."],
  ["tilsynet: index.html står", "<p>Lag index.html først.</p>", "Lag index.html først."],
];

for (const [navn, html, forventet] of VAKTPOSTER) {
  test(`O2-vaktpost: ${navn}`, () => {
    const { res, nett } = kjor(html);
    assert.equal(nett, 0, "sikkerhetsnettet slo til");
    sjekkSkjema(res);
    ingenUrl(res);
    assert.equal(res.blokker.map(blokkTekst).join("\n"), forventet);
    const json = JSON.stringify(res);
    for (const s of ["HEMMELIG", "SECRET", "vert.no/", "token", "8080", "pw@", "skole.no/", "PHNj", "alert"]) {
      assert.ok(!json.includes(s), `fant ${s}`);
    }
  });
}

// Positiv kontroll (rettingsrunde 1): URL-filteret holder alene. Med sikkerhetsnettet
// slått av (testkrok) skal hver vaktpost gi nøyaktig samme resultat.
test("O2-vaktposter med sikkerhetsnettet av: samme resultat, ingen URL", () => {
  for (const [navn, html, forventet] of VAKTPOSTER) {
    const pa = tilOppgavetekst(html);
    const av = tilOppgavetekst(html, { utenSikkerhetsnett: true });
    assert.deepEqual(av, pa, navn);
    ingenUrl(av);
    assert.equal(av.blokker.map(blokkTekst).join("\n"), forventet, navn);
  }
});

// Positiv kontroll for telleren: med URL-filteret slått av (testkrok) må
// sikkerhetsnettet slå til og telles, ellers er «nett 0» i de andre testene blind.
test("sikkerhetsnettet slår til og telles når URL-filteret er av", () => {
  const prover = [
    "<p>a https://vert.no b</p>",
    "<p>a ?verifier=HEMMELIG b</p>",
    "<p>a www.vert.no b</p>",
    "<p>a /files/1 b</p>",
    "<p>a ?\uFF56\uFF45\uFF52\uFF49\uFF46\uFF49\uFF45\uFF52=SECRET b</p>",
    '<p><img alt="https://vert.no/x"></p>',
  ];
  for (const html of prover) {
    const { res, nett } = kjor(html, { utenUrlFilter: true });
    assert.ok(nett > 0, `nettet slo ikke til: ${html}`);
    ingenUrl(res);
    assert.ok(!JSON.stringify(res).includes("HEMMELIG") && !JSON.stringify(res).includes("SECRET"), html);
  }
});

test("O2: lenke i lenketekst og i overskrift/liste/sitat/kode/tabell", () => {
  const { res, nett } = kjor(
    '<h1>https://a.no</h1><ul><li>www.b.no</li></ul><blockquote>c.no/x</blockquote><pre>  d.no?q=1\n</pre>' +
      '<table><tr><td>e.no/x</td><td>f</td></tr></table><p><a href="y">https://g.no/files/1?verifier=Z</a></p>',
  );
  assert.equal(nett, 0);
  sjekkSkjema(res);
  ingenUrl(res);
  assert.deepEqual(res.blokker.map(blokkTekst), ["[lenke]", "[lenke]", "[lenke]", "  [lenke]", "[lenke] | f", "[lenke]"]);
});

// Rettelse 4: fast tabell for ikke-treff, med og uten entiteter og nullbredde-tegn.
const IKKE_TREFF = ["index.html", "style.css", "Node.js", "src/app.js", "css/style.css", "f.eks.", "kl. 10.30", "1.5/2", "v1.2/docs",
  "Regn ut 100000000/3", "20000000/4", "2130706433/x"];

function medEntiteter(s) {
  return [...s].map((ch) => (ch === "." ? "&#46;" : ch === "/" ? "&#x2F;" : ch === " " ? "&#32;" : ch)).join("");
}
function medNullbredde(s) {
  const tegn = ["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF", "\u00AD", "\u200E", "\u202A"];
  return [...s].map((ch, i) => ch + tegn[i % tegn.length]).join("");
}
function medNullbreddeEntiteter(s) {
  return [...s].map((ch) => ch + "&#x200B;").join("");
}

for (const ord of IKKE_TREFF) {
  test(`O2 ikke-treff: «${ord}» står urørt (rå, entiteter, nullbredde)`, () => {
    for (const variant of [ord, medEntiteter(ord), medNullbredde(ord), medNullbreddeEntiteter(ord)]) {
      assert.equal(tekst(`<p>Bruk ${variant} her</p>`), `Bruk ${ord} her`, JSON.stringify(variant));
      assert.equal(tekst(variant), ord, JSON.stringify(variant));
    }
  });
}

test("O2 ikke-treff: avsluttende tegnsetting og vanlig tekst", () => {
  assert.equal(tekst("<p>vg.no, nrk.no. (index.html) «Node.js»</p>"), "vg.no, nrk.no. (index.html) «Node.js»");
  assert.equal(tekst("<p>Lever data: navn og JavaScript: grunnkurs. Metadata:x</p>"), "Lever data: navn og JavaScript: grunnkurs. Metadata:x");
  assert.equal(tekst("<p>a@b og 2 &lt; 3 og 1:2</p>"), "a@b og 2 < 3 og 1:2");
});

test("O2-treffsiden (tilsynets presisering + Lars 1a): / @ alltid, ? # : med tegn etter", () => {
  for (const ord of ["vg.no/", "vg.no@x", "vg.no@", "vg.no\\", "vg.no?x", "vg.no#x", "vg.no:x", "vg.no?.x",
    "vert.no?token=x", "vert.no#x", "vert.no:8080/x", "Node.js?a=1", "index.html:80", "vg.no?)x"]) {
    assert.equal(tekst(`<p>a ${ord} b</p>`), "a [lenke] b", ord);
  }
});

test("O2-ikke-treff (Lars 1a): ? # : rett etter verten står når bare tegnsetting følger", () => {
  for (const ord of ["vg.no?", "vg.no#", "vg.no:", "vg.no?.", "vg.no?)", "vg.no:»", "Node.js?", "index.html:", "vg.no?!"]) {
    assert.equal(tekst(`<p>a ${ord} b</p>`), `a ${ord} b`, ord);
  }
  assert.equal(tekst("<p>Har du installert Node.js?</p>"), "Har du installert Node.js?");
  assert.equal(tekst("<p>Se index.html:</p>"), "Se index.html:");
  assert.equal(tekst("<p>Les vg.no?</p>"), "Les vg.no?");
});

test("O2 foran verten: bare én / er lov; vanlige tall er ikke heltall-IP", () => {
  for (const ord of ["src/app.js", "/vert.no", "mappe/index.html", "1/2", "2024/2025", "12345/6", "[x]:1/2"]) {
    assert.equal(tekst(`<p>a ${ord} b</p>`), `a ${ord} b`, ord);
  }
});

// --- Rå-tekst, kommentarer, entiteter --------------------------------------

test("rå-tekst: script style textarea title noscript template xmp hoppes over, uavhengig av store/små bokstaver", () => {
  for (const navn of ["script", "style", "textarea", "title", "noscript", "template", "xmp", "SCRIPT", "ScRiPt"]) {
    assert.equal(tekst(`<p>a<${navn} x="1"><b>skjult</b> </p> <p></${navn.toUpperCase()} >b</p>`), "ab", navn);
  }
});

test("rå-tekst: </script uten skilletegn avslutter ikke; mangler avslutning → resten kastes", () => {
  assert.equal(tekst("<p>a<script>x</scriptx>skjult</script>b</p>"), "ab");
  assert.equal(tekst("<p>a</p><script>alert(1)</p><p>skjult"), "a");
  assert.equal(tekst("<p>a</p><script>x</script"), "a");
  assert.equal(tekst("<p>a</p><style>x</style  "), "a");
  assert.equal(tekst("<p>a</p><title>skjult"), "a");
  assert.equal(tekst("<p>a</p><iframe>skjult</ifram"), "a\n[innebygd innhold]");
});

test("kommentarer slutter bare på -->; uavsluttet kaster resten; <!…> og <?…> hoppes over", () => {
  assert.equal(tekst("<p>a<!-- x --> b</p>"), "a b");
  assert.equal(tekst("<p>a<!-- <p>skjult</p> -- > fortsatt --> b</p>"), "a b");
  assert.equal(tekst("<p>a<!-->skjult-->b</p>"), "ab");
  assert.equal(tekst("<p>a</p><!-- skjult"), "a");
  assert.equal(tekst("<!DOCTYPE html><?xml version='1.0'?><p>a</p><![CDATA[x]]>b"), "a\nb");
  assert.equal(tekst("<p>a</p><!x skjult"), "a");
  assert.equal(tekst("<p>a</p><?x skjult"), "a");
});

test("uavsluttet tagg ved slutten → resten kastes; løse < står som tekst", () => {
  assert.equal(tekst("<p>a</p><p class='x"), "a");
  assert.equal(tekst("<p>a</p><img src=x"), "a");
  assert.equal(tekst("<p>a</p></p"), "a");
  assert.equal(tekst("<p>2 < 3 og <3 og < b</p>"), "2 < 3 og <3 og < b");
});

test("entiteter: navngitte i lista, numeriske, ukjente står, ingen dobbel dekoding", () => {
  assert.equal(
    tekst("&amp; &lt; &gt; &quot; &apos; &aelig;&oslash;&aring; &AElig;&Oslash;&Aring;"),
    "& < > \" ' æøå ÆØÅ",
  );
  assert.equal(
    tekst("&rsquo;&lsquo;&ldquo;&rdquo;&mdash;&ndash;&hellip;&laquo;&raquo;"),
    "\u2019\u2018\u201C\u201D\u2014\u2013\u2026\u00AB\u00BB",
  );
  assert.equal(tekst("a&nbsp;b"), "a\u00A0b");
  assert.equal(tekst("&#229;&#xE6;&#XF8;&#65"), "åæøA");
  assert.equal(tekst("&foo; &AMP; &amp &copy;"), "&foo; &AMP; &amp &copy;");
  assert.equal(tekst("&amp;lt;script&amp;gt;"), "&lt;script&gt;");
  assert.equal(tekst("&#x26;lt;"), "&lt;");
  assert.equal(tekst('<img alt="&aring;&#8211;x">'), "å\u2013x");
});

test("fromCodePoint-grenser: 0, surrogater, >0x10FFFF og enorme tall → U+FFFD", () => {
  assert.equal(tekst("a&#0;b"), "a\uFFFDb");
  assert.equal(tekst("a&#xD800;b&#xDFFF;c&#55296;d"), "a\uFFFDb\uFFFDc\uFFFDd");
  assert.equal(tekst("a&#x110000;b&#1114112;c"), "a\uFFFDb\uFFFDc");
  assert.equal(tekst("a&#99999999999999999999999;b&#xFFFFFFFFFFFFFFFFFFFF;c"), "a\uFFFDb\uFFFDc");
  assert.equal(tekst("&#x10FFFF;&#128512;&#xD7FF;&#xE000;"), "\u{10FFFF}\u{1F600}\uD7FF\uE000");
});

test("rens: NUL, C0/C1, bidi og usynlige tegn fjernes; \\n og \\t blir mellomrom utenfor <pre>", () => {
  assert.equal(tekst("a\u0000\u0001\u001F\u007F\u0080\u009Fb"), "ab");
  assert.equal(tekst("a\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u200E\u200Fb"), "ab");
  assert.equal(tekst("a\u200B\u200C\u200D\u2060\uFEFF\u00ADb"), "ab");
  assert.equal(tekst("a\tb\nc"), "a b c");
  assert.equal(tekst("<pre>a\tb\r\nc</pre>"), "a\tb\nc");
});

test("math → [formel], innholdet fjernes, også nøstet og uavsluttet", () => {
  assert.equal(tekst("<p>Løs <math><mi>x</mi><math>y</math><mn>2</mn></math> nå</p>"), "Løs [formel] nå");
  assert.equal(tekst("<p>a<math/>b</p>"), "a[formel]b");
  assert.equal(tekst("<p>a</p><p>b<math>skjult"), "a\nb[formel]");
});

test("svg fjernes med innhold, også nøstet og med tekst", () => {
  assert.equal(tekst("<p>a<svg><svg><text>x</text></svg><text>y</text></svg>b</p>"), "ab");
  assert.equal(tekst("<p>a<svg/>b</p>"), "ab");
});

// --- O7 ----------------------------------------------------------------------

const MB2 = 2 * 1024 * 1024;

test("O7: 2 MB rå er grensen (lik → tokeniseres, én over → for_stor)", () => {
  const start = "<p>x</p><!--";
  const slutt = "-->";
  const fyll = "a".repeat(MB2 - start.length - slutt.length);
  const lik = start + fyll + slutt;
  assert.equal(lik.length, MB2);
  assert.deepEqual(tekst(lik), "x");
  let nett = 0;
  assert.deepEqual(tilOppgavetekst(lik + " ", { vedSikkerhetsnett: () => nett++ }), { status: "for_stor" });
});

test("O7: 1 MB data:-URI i img og i tekst går fint", () => {
  const uri = "data:image/png;base64," + "A".repeat(1024 * 1024);
  assert.equal(tekst(`<p>a<img src="${uri}">b</p>`), "a[bilde]b");
  const { res, nett } = kjor(`<p>a ${uri} b</p>`);
  assert.equal(nett, 0);
  assert.equal(res.blokker.map(blokkTekst).join(""), "a [lenke] b");
});

test("O7: 200 kB ferdig tekst er grensen", () => {
  assert.equal(tilOppgavetekst("a".repeat(200 * 1024)).status, "ok");
  assert.deepEqual(tilOppgavetekst("a".repeat(200 * 1024 + 1)), { status: "for_stor" });
});

test("O7: dyp div er ok", () => {
  assert.equal(tekst("<div>".repeat(100000) + "x" + "</div>".repeat(100000)), "x");
});

test("O7: dyp liste og dypt sitat flates ut til nivå 10 (avvises ikke)", () => {
  const n = 50;
  const { res } = kjor("<ul><li>".repeat(n) + "x" + "</li></ul>".repeat(n));
  sjekkSkjema(res);
  assert.equal(res.status, "ok");
  assert.deepEqual(res.blokker.map((b) => b.dybde), [10]);
  const s = tilOppgavetekst("<blockquote>".repeat(n) + "y" + "</blockquote>".repeat(n));
  sjekkSkjema(s);
  assert.deepEqual(s.blokker.map((b) => b.dybde), [10]);
  const blandet = tilOppgavetekst("<ul><li>a" + "<blockquote>b<ul><li>c".repeat(20));
  sjekkSkjema(blandet);
  assert.ok(blandet.blokker.every((b) => b.dybde <= 10));
});

test("O7: 2000 blokker ok, 2001 → for_stor", () => {
  assert.equal(tilOppgavetekst("<p>x</p>".repeat(2000)).blokker.length, 2000);
  assert.deepEqual(tilOppgavetekst("<p>x</p>".repeat(2001)), { status: "for_stor" });
  assert.deepEqual(tilOppgavetekst("<ul><li>x</li></ul>".repeat(2001)), { status: "for_stor" });
});

test("O7: lange ord med mange punktum gir ingen eksplosiv kjøretid", () => {
  const t0 = Date.now();
  tilOppgavetekst("ab.".repeat(300000) + "/");
  tilOppgavetekst("<p>" + "a@".repeat(300000) + "</p>");
  tilOppgavetekst("<a " + "x=".repeat(300000) + ">");
  // Rettingsrunde 2: uforankrede `…*$`/`…+$` var kvadratiske.
  const lenge = tilOppgavetekst("<p>a vert.no?" + ")".repeat(500000) + "x b</p>");
  assert.equal(lenge.blokker.map(blokkTekst).join(""), "a [lenke] b");
  tilOppgavetekst("<pre>" + " ".repeat(500000) + "x</pre>");
  tilOppgavetekst("<p>x" + "<br>".repeat(300000) + "y</p>");
  tilOppgavetekst("<p>a" + "-".repeat(500000) + "a.no</p>");
  tilOppgavetekst("<p>" + "[" + ":".repeat(500000) + "</p>");
  assert.ok(Date.now() - t0 < 5000, `brukte ${Date.now() - t0} ms`);
});

// --- Fuzz/skjematest -----------------------------------------------------------

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BITER = [
  "<p>", "</p>", "<b>", "</b>", "<i>", "<em>", "</strong>", "<br>", "<br/>", "</br>", "<ul>", "<ol>", "<li>", "</li>",
  "</ul>", "</ol>", "<blockquote>", "</blockquote>", "<pre>", "</pre>", "<h1>", "</h3>", "<h6>", "<table>", "<tr>",
  "<td>", "</td>", "<th>", "</tr>", "</table>", "<div>", "</div>", "<span>", "</span>", "<font color=red>",
  "<svg>", "</svg>", "<math>", "</math>", "<iframe>", "</iframe>", "<video>", "</video>", "<embed>", "<object>",
  "<script>", "</script>", "<style>", "</style", "<textarea>", "<title>", "</title>", "<noscript>", "<template>",
  "<xmp>", "<!--", "-->", "<!", "<?", ">", "<", "</", "/>", '"', "'", "=", " ", "\n", "\t", "\r",
  '<img alt="', '<img alt=\'', "<img alt=", '<img src="x" alt="', "<a href=\"", "<a href='", "</a>", '">', "'>",
  "&amp;", "&lt;", "&gt;", "&nbsp;", "&#58;", "&#x2F;", "&#47;", "&#x3A;", "&#0;", "&#xD800;", "&#x110000;",
  "&#119;", "&#x77;", "&#46;", "&#x2E;", "&#105;", "&#64;", "&#x40;", "&#x200B;", "&#x202E;", "&#99999999999;",
  "&foo;", "&", "#", ";",
  "http", "https", ":", "//", "/", "://", "www", "www.", ".", "no", "vert", "vert.no", "skole.instructure.com",
  "verifier", "VERIFIER", "veri", "fier", "=", "?", "token", "files", "/files/", "1", "42", "@", "bruker", "pw",
  "8080", "mailto:", "data:", "javascript:", "localhost", "10.0.0.1", "index.html", "Node.js", "f.eks.", "kl. 10.30",
  "\u0000", "\u200B", "\u200D", "\u202E", "\u2066", "\uFEFF", "\u00AD", "\u0085", "\u00A0", "\u2028", "\\",
  "æøå", "Ü", "İ", "ı", "\u{1F600}", "\uD800", "a", "tekst", "Oppgave",
];

test("fuzz/skjematest: 5000 seedede strenger — kaster aldri, eksakt skjema, ingen URL, sikkerhetsnett 0", () => {
  const rnd = mulberry32(0x0404);
  let nett = 0;
  const statuser = {};
  for (let n = 0; n < 5000; n++) {
    const lengde = 1 + Math.floor(rnd() * 60);
    let s = "";
    for (let j = 0; j < lengde; j++) {
      if (rnd() < 0.05) s += String.fromCharCode(Math.floor(rnd() * 0x3000));
      else s += BITER[Math.floor(rnd() * BITER.length)];
    }
    let res;
    try {
      res = tilOppgavetekst(s, { vedSikkerhetsnett: () => nett++ });
    } catch (e) {
      assert.fail(`kastet på fuzz-streng nr. ${n}`);
    }
    assert.notEqual(res.status, "feil", `feil på nr. ${n}: ${JSON.stringify(s)}`);
    sjekkSkjema(res);
    ingenUrl(res);
    statuser[res.status] = (statuser[res.status] ?? 0) + 1;
  }
  assert.equal(nett, 0, "sikkerhetsnettet slo til i fuzz-korpuset");
  assert.ok(statuser.ok > 2500, JSON.stringify(statuser));
});

test("fuzz med sikkerhetsnettet av (testkrok): samme 5000 strenger gir samme resultat, ingen URL", () => {
  const rnd = mulberry32(0x0404);
  for (let n = 0; n < 5000; n++) {
    const lengde = 1 + Math.floor(rnd() * 60);
    let s = "";
    for (let j = 0; j < lengde; j++) {
      if (rnd() < 0.05) s += String.fromCharCode(Math.floor(rnd() * 0x3000));
      else s += BITER[Math.floor(rnd() * BITER.length)];
    }
    const av = tilOppgavetekst(s, { utenSikkerhetsnett: true });
    assert.deepEqual(av, tilOppgavetekst(s), `nr. ${n}`);
    ingenUrl(av);
  }
});

// --- Statisk ------------------------------------------------------------------

test("statisk: src/oppgavetekst.js har ingen import, I/O eller logging", () => {
  const kilde = readFileSync(KILDE, "utf8");
  assert.doesNotMatch(kilde, /^\s*import\s/m);
  assert.doesNotMatch(kilde, /\brequire\(|\bconsole\.|\bprocess\.|\bfetch\(/);
  // Usynlige/bidi-tegn skal stå som \u-escapes, ikke bokstavelig i kildekoden.
  assert.doesNotMatch(kilde, /[\u0000-\u0009\u000B-\u001F\u007F-\u00A0\u00AD]|\p{Cf}/u);
});
