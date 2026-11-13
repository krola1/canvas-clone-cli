// Oppgavetekst fra Canvas (lærerforfattet HTML i `description`) → en fast,
// strukturert modell uten HTML, attributter eller URL-er (tilsynets O1, O2, O7;
// plan 0.4.0 G1a). Ren funksjon: ingen avhengigheter, ingen I/O, ingen logging.
// Kaster aldri, og returnerer aldri noe av input-teksten ved feil.
//
// tilOppgavetekst(html) →
//   { status: "ok", blokker }   1–2000 blokker
//   { status: "tom" }           ikke en streng, eller ingen tekst igjen
//   { status: "for_stor" }      >2 MB rå, >200 kB ferdig tekst eller >2000 blokker
//   { status: "feil" }          intern feil (fast status, aldri feiltekst)
//
// Modell (eksakt; ingen andre felt):
//   { type: "overskrift", niva: 1–6, biter }
//   { type: "avsnitt", biter }                  (også tabellrad «celle | celle»)
//   { type: "sitat", dybde: 1–10, biter }
//   { type: "kode", biter }
//   { type: "liste", nummerert, start: ≥1, dybde: 1–10, punkter: [biter, …] }
//   bit = { tekst: ikke-tom streng, fet: boolean, kursiv: boolean }; "\n" = linjeskift
//
// Ingen attributter kopieres. Eneste unntak er `alt` på `img`, som blir tekst og
// går gjennom samme filter. O2-rørledningen (rekkefølgen er et krav):
//   1) dekode entiteter, 2) fjerne kontroll-, bidi- og usynlige tegn,
//   3–4) URL-filter på sammenslått tekst per blokk (på tvers av biter), og separat på
//   `alt`, 5) sikkerhetsnett per utgående streng.
// Filteret og nettet ser teksten etter NFKC (og med U+3002 og U+FF61 som punktum, slik
// nettlesere leser vertsnavn); treff erstatter hele ordet, ellers vises teksten uendret.
// Det andre argumentet brukes bare av testene: `vedSikkerhetsnett` teller hvor ofte
// sikkerhetsnettet slår til (skal være 0); `utenSikkerhetsnett` og `utenUrlFilter`
// slår av hvert sitt ledd, så testene kan vise at hvert ledd holder alene.

const MAKS_RA = 2 * 1024 * 1024;
const MAKS_TEKST = 200 * 1024;
const MAKS_BLOKKER = 2000;
const MAKS_DYBDE = 10;

const LENKE = "[lenke]";
const BILDE = "[bilde]";
const FORMEL = "[formel]";
const INNEBYGD = "[innebygd innhold]";

export function tilOppgavetekst(html, valg) {
  try {
    if (typeof html !== "string") return { status: "tom" };
    if (html.length > MAKS_RA) return { status: "for_stor" };
    const vedNett = typeof valg?.vedSikkerhetsnett === "function" ? valg.vedSikkerhetsnett : null;
    const b = new Bygger(vedNett, valg?.utenSikkerhetsnett === true, valg?.utenUrlFilter === true);
    tokeniser(html, b);
    return b.ferdig();
  } catch {
    return { status: "feil" };
  }
}

// ---------------------------------------------------------------------------
// Steg 1: entiteter

const NAVNGITTE = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  aelig: "æ", oslash: "ø", aring: "å", AElig: "Æ", Oslash: "Ø", Aring: "Å",
  rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201C", rdquo: "\u201D",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", laquo: "\u00AB", raquo: "\u00BB",
};
const ENTITET = /&#([0-9]+);?|&#[xX]([0-9a-fA-F]+);?|&([A-Za-z]+);/g;

function tegnFraKodepunkt(n) {
  if (!Number.isFinite(n) || n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "\uFFFD";
  return String.fromCodePoint(n);
}

function dekod(s) {
  if (!s.includes("&")) return s;
  return s.replace(ENTITET, (hel, des, heks, navn) => {
    if (des !== undefined) return tegnFraKodepunkt(Number.parseInt(des, 10));
    if (heks !== undefined) return tegnFraKodepunkt(Number.parseInt(heks, 16));
    return Object.prototype.hasOwnProperty.call(NAVNGITTE, navn) ? NAVNGITTE[navn] : hel;
  });
}

// ---------------------------------------------------------------------------
// Steg 2: NUL, C0/C1 (unntatt \n og \t), bidi, usynlige tegn. \p{Cf} tar i tillegg
// resten av Unicodes formattegn (alle tegnene i planens liste er også Cf).

const USYNLIGE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]|\p{Cf}/gu;

function rens(s) {
  return s.replace(USYNLIGE, "");
}

// ---------------------------------------------------------------------------
// Steg 3–4: URL-filter. Teksten deles på mellomrom; et ord som ser ut som (en del
// av) en URL blir i sin helhet «[lenke]».

const FILER = /\/files\/\d/;
const SKJEMA = /(?:^|[^\p{L}\p{N}])(?:mailto|data|javascript):./u;
const VERTSLOP = /[\p{L}\p{M}\p{N}.-]+/gu;
const TLD = /^\p{L}[\p{L}\p{M}\p{N}-]*$/u;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HELTALL = /^\d{8,10}$/;
const IPV6 = /\[[0-9a-f.:]*\]/g; // må inneholde «:» (sjekkes i koden, så regexen er lineær)
const ALLTID_ETTER = "/@\\";
const MED_REST_ETTER = "?#:";
// Et tegn som ikke er avsluttende tegnsetting. Brukes med `test` (lineær), ikke
// som uforankret `[…]*$` med `replace`, som er kvadratisk på lange ord.
const IKKE_AVSLUTTENDE = /[^.,;:!?)\]}»"'\u201D\u2019\u2026]/u;

// Fjerner tegn som oppfyller `er` fra slutten (og ev. starten) i lineær tid.
// Erstatter `replace(/x+$/)`, som er kvadratisk når x-ene står midt i strengen.
function trimSlutt(t, er) {
  let e = t.length;
  while (e > 0 && er(t[e - 1])) e--;
  return t.slice(0, e);
}
function trimBegge(t, er) {
  let a = 0;
  while (a < t.length && er(t[a])) a++;
  return trimSlutt(t.slice(a), er);
}
const erPunktumEllerBindestrek = (c) => c === "." || c === "-";
const erLinjeskift = (c) => c === "\n";
const erMellomromTegn = (c) => /\s/.test(c);

// Det filteret og nettet ser: NFKC, og ideografisk punktum som «.».
function somVert(s) {
  return s.normalize("NFKC").replace(/[\u3002\uFF61]/g, ".");
}

// Heltall-IP (f.eks. 2130706433 = 127.0.0.1): bare fra 2^24 og opp, og bare med
// `//` eller `:` foran (Lars a, 2026-11-13; se harVertMedUrlDel), så vanlige tall
// som «1/2» står.
function erHeltallIp(k) {
  if (!HELTALL.test(k)) return false;
  const n = Number(k);
  return n >= 0x1000000 && n <= 0xffffffff;
}

function erVertsnavn(k) {
  if (k === "localhost" || IPV4.test(k)) return true;
  const deler = k.split(".").filter((d) => d !== "");
  if (deler.length < 2) return false;
  const tld = deler[deler.length - 1];
  return tld.length >= 2 && TLD.test(tld);
}

// O2 (presisert i tilsynets tillegg 2, og Lars 1a 2026-11-13): et ord står bare når
// det i sin helhet er `vertsnavn.tld` (pluss avsluttende tegnsetting). Rett etter
// verten gir `/` eller `@` alltid «[lenke]», og `? # :` når det står minst ett tegn
// etter dem som ikke er avsluttende tegnsetting («vg.no?» står, «vg.no?x» gjør det
// ikke). Rett foran verten gir `@`, `:` eller to skråstreker «[lenke]»; bare én `/`
// er lov (`src/app.js`), og ikke etter `:` (`https:/vert.no`). `\` regnes som `/`,
// slik nettlesere gjør. `[IPv6]` regnes som vert; heltall-IP bare med URL-tegn foran.
function urlForanVert(l, start) {
  if (start > 0 && l[start - 1] === ":") return true;
  let s = start;
  while (s > 0 && (l[s - 1] === "/" || l[s - 1] === "\\")) s--;
  if (start - s >= 2) return true;
  return start - s === 1 && s > 0 && l[s - 1] === ":";
}

function vertMedUrlDel(l, start, slutt) {
  if (start > 0 && l[start - 1] === "@") return true;
  if (urlForanVert(l, start)) return true;
  if (slutt >= l.length) return false;
  const c = l[slutt];
  if (ALLTID_ETTER.includes(c)) return true;
  if (MED_REST_ETTER.includes(c)) return IKKE_AVSLUTTENDE.test(l.slice(slutt + 1));
  return false;
}

function harVertMedUrlDel(l) {
  for (const m of l.matchAll(VERTSLOP)) {
    const lop = m[0];
    const kjerne = trimBegge(lop, erPunktumEllerBindestrek);
    if (erHeltallIp(kjerne)) {
      if (urlForanVert(l, m.index)) return true;
      continue;
    }
    if (kjerne === "" || !erVertsnavn(kjerne)) continue;
    if (vertMedUrlDel(l, m.index, m.index + lop.length)) return true;
  }
  for (const m of l.matchAll(IPV6)) {
    if (!m[0].includes(":")) continue;
    if (vertMedUrlDel(l, m.index, m.index + m[0].length)) return true;
  }
  return false;
}

function erLenke(ord) {
  const l = somVert(ord).toLowerCase();
  if (l.includes("://") || l.includes("verifier") || l.includes("www.")) return true;
  if (FILER.test(l) || SKJEMA.test(l)) return true;
  return harVertMedUrlDel(l);
}

// Filteret kjøres på den sammenslåtte teksten. Biten der et treff starter, får
// «[lenke]»; resten av treffet fjernes fra de andre bitene.
function filtrerBiter(biter, utenFilter = false) {
  if (utenFilter) return biter;
  const samlet = biter.map((b) => b.tekst).join("");
  const treff = [];
  for (const m of samlet.matchAll(/\S+/g)) {
    if (erLenke(m[0])) treff.push([m.index, m.index + m[0].length]);
  }
  if (treff.length === 0) return biter;
  const ut = [];
  let pos = 0;
  let k = 0;
  for (const b of biter) {
    const bs = pos;
    const be = pos + b.tekst.length;
    pos = be;
    while (k < treff.length && treff[k][1] <= bs) k++;
    let tekst = "";
    let p = bs;
    for (let j = k; j < treff.length && treff[j][0] < be; j++) {
      const [ts, te] = treff[j];
      if (ts > p) tekst += samlet.slice(p, ts);
      if (ts >= bs) tekst += LENKE;
      p = Math.max(p, Math.min(te, be));
    }
    if (p < be) tekst += samlet.slice(p, be);
    ut.push({ tekst, fet: b.fet, kursiv: b.kursiv });
  }
  return ut;
}

function filtrerStreng(s) {
  return filtrerBiter([{ tekst: s, fet: false, kursiv: false }])[0].tekst;
}

// Steg 5: sikkerhetsnett. Skal aldri slå til; testene teller det.
const NETT = /verifier|:\/\/|www\.|\/files\/\d/i;

// ---------------------------------------------------------------------------
// Tokenisering

const RA_TEKST = new Set(["script", "style", "textarea", "title", "noscript", "template", "xmp", "iframe"]);
const raSluttMonstre = new Map();

function erBokstav(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
function erMellomrom(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

// Leser taggnavn og attributter fra `j` til og med `>`. Attributtverdier i
// anførselstegn hoppes over i sin helhet. null = uavsluttet (resten kastes).
function lesTagg(s, j) {
  const n = s.length;
  let k = j;
  while (k < n && s[k] !== ">" && s[k] !== "/" && !erMellomrom(s[k])) k++;
  const navn = s.slice(j, k).toLowerCase();
  let alt = null;
  for (;;) {
    while (k < n && (erMellomrom(s[k]) || s[k] === "/")) k++;
    if (k >= n) return null;
    if (s[k] === ">") return { navn, alt, selvlukket: s[k - 1] === "/", etter: k + 1 };
    const ns = k;
    k++;
    while (k < n && s[k] !== ">" && s[k] !== "/" && s[k] !== "=" && !erMellomrom(s[k])) k++;
    const anavn = s.slice(ns, k).toLowerCase();
    while (k < n && erMellomrom(s[k])) k++;
    let verdi = "";
    if (k < n && s[k] === "=") {
      k++;
      while (k < n && erMellomrom(s[k])) k++;
      if (k >= n) return null;
      const q = s[k];
      if (q === '"' || q === "'") {
        const e = s.indexOf(q, k + 1);
        if (e === -1) return null;
        verdi = s.slice(k + 1, e);
        k = e + 1;
      } else {
        const vs = k;
        while (k < n && s[k] !== ">" && !erMellomrom(s[k])) k++;
        verdi = s.slice(vs, k);
      }
    }
    if (anavn === "alt" && alt === null) alt = verdi;
  }
}

// Finner slutten på et rå-tekst-element: `</navn` (uavhengig av store/små
// bokstaver) fulgt av mellomrom, `/`, `>` eller slutten, og så `>`. -1 = mangler.
function finnRaSlutt(s, fra, navn) {
  let re = raSluttMonstre.get(navn);
  if (!re) {
    re = new RegExp(`</${navn}(?=[\\t\\n\\f\\r />]|$)`, "gi");
    raSluttMonstre.set(navn, re);
  }
  re.lastIndex = fra;
  const m = re.exec(s);
  if (!m) return -1;
  const gt = s.indexOf(">", m.index + m[0].length);
  return gt === -1 ? -1 : gt + 1;
}

function tokeniser(s, b) {
  const n = s.length;
  let i = 0;
  while (i < n && !b.stopp) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      b.tekst(s.slice(i));
      return;
    }
    if (lt > i) b.tekst(s.slice(i, lt));
    i = lt;
    const c = s[i + 1];
    if (s.startsWith("<!--", i)) {
      const slutt = s.indexOf("-->", i + 4);
      if (slutt === -1) return;
      i = slutt + 3;
    } else if (c === "!" || c === "?") {
      const gt = s.indexOf(">", i + 2);
      if (gt === -1) return;
      i = gt + 1;
    } else if (c === "/") {
      if (erBokstav(s.charCodeAt(i + 2))) {
        const t = lesTagg(s, i + 2);
        if (t === null) return;
        b.slutt(t.navn);
        i = t.etter;
      } else {
        const gt = s.indexOf(">", i + 2);
        if (gt === -1) return;
        i = gt + 1;
      }
    } else if (erBokstav(s.charCodeAt(i + 1))) {
      const t = lesTagg(s, i + 1);
      if (t === null) return;
      i = t.etter;
      b.start(t.navn, t.alt, t.selvlukket);
      if (RA_TEKST.has(t.navn)) {
        const e = finnRaSlutt(s, i, t.navn);
        if (e === -1) return;
        i = e;
      }
    } else {
      b.tekst("<");
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// Bygging av modellen

const OVERSKRIFT = /^h([1-6])$/;
const FLATE_BLOKKER = new Set([
  "div", "section", "article", "header", "footer", "main", "aside", "nav", "figure", "figcaption",
  "address", "dl", "dt", "dd", "details", "summary", "center", "hgroup", "fieldset", "legend", "form", "hr",
]);
const HOPP_MED_INNHOLD = new Set(["svg", "math", "video", "audio", "object"]);

class Bygger {
  constructor(vedNett, utenNett, utenFilter) {
    this.vedNett = vedNett;
    this.utenNett = utenNett;
    this.utenFilter = utenFilter;
    this.blokker = [];
    this.buffer = [];
    this.overskrift = 0;
    this.stabel = [];
    this.antallListe = 0;
    this.antallSitat = 0;
    this.fet = 0;
    this.kursiv = 0;
    this.pre = 0;
    this.hopp = null;
    this.rad = null;
    this.stopp = false;
  }

  dybde() {
    return Math.min(this.stabel.length, MAKS_DYBDE);
  }

  innerst() {
    return this.stabel.length ? this.stabel[this.stabel.length - 1] : null;
  }

  nett(t) {
    if (!this.utenNett && NETT.test(somVert(t))) {
      if (this.vedNett) this.vedNett();
      return LENKE;
    }
    return t;
  }

  leggBit(tekst, fet = this.fet > 0, kursiv = this.kursiv > 0) {
    const sist = this.buffer[this.buffer.length - 1];
    if (sist && sist.fet === fet && sist.kursiv === kursiv) sist.tekst += tekst;
    else this.buffer.push({ tekst, fet, kursiv });
  }

  inline(t) {
    if (this.rad && /\S/.test(t)) {
      if (this.rad.ventSep) {
        this.leggBit(" | ", false, false);
        this.rad.ventSep = false;
      }
      this.rad.harInnhold = true;
    }
    this.leggBit(t);
  }

  tekst(ra) {
    if (this.hopp) return;
    let t = rens(dekod(ra));
    if (this.pre === 0) t = t.replace(/[\t\n ]+/g, " ");
    if (t) this.inline(t);
  }

  altTekst(alt) {
    if (alt === null) return BILDE;
    const t = rens(dekod(alt)).replace(/[\t\n ]+/g, " ").trim();
    if (!/\S/.test(t)) return BILDE;
    return this.nett(this.utenFilter ? t : filtrerStreng(t));
  }

  // Blokkgrense. Inne i en tabellrad blir den bare et mellomrom.
  grense() {
    if (this.rad) this.inline(" ");
    else this.avslutt();
  }

  avslutt() {
    this.rad = null;
    this.flush();
  }

  start(navn, alt, selvlukket) {
    if (this.hopp) {
      if (navn === this.hopp.navn && !selvlukket) this.hopp.dybde++;
      return;
    }
    const h = OVERSKRIFT.exec(navn);
    if (h) {
      if (this.rad) return this.inline(" ");
      this.avslutt();
      if (this.stabel.length === 0) this.overskrift = Number(h[1]);
      return;
    }
    if (HOPP_MED_INNHOLD.has(navn)) {
      if (navn === "math") this.inline(FORMEL);
      else if (navn !== "svg") this.inline(INNEBYGD);
      if (!selvlukket) this.hopp = { navn, dybde: 1 };
      return;
    }
    switch (navn) {
      case "iframe":
      case "embed":
        return this.inline(INNEBYGD);
      case "img":
        return this.inline(this.altTekst(alt));
      case "br":
        return this.inline("\n");
      case "b":
      case "strong":
        this.fet++;
        return;
      case "i":
      case "em":
        this.kursiv++;
        return;
      case "p":
        return this.grense();
      case "pre":
        this.grense();
        this.pre++;
        return;
      case "ul":
      case "ol": {
        this.avslutt();
        const inn = this.innerst();
        if (inn && inn.type === "liste") {
          inn.blokk = null;
          inn.punkt = null;
        }
        this.stabel.push({ type: "liste", nummerert: navn === "ol", blokk: null, punkt: null, nesteNr: 1 });
        this.antallListe++;
        return;
      }
      case "li": {
        this.avslutt();
        const inn = this.innerst();
        if (inn && inn.type === "liste") inn.punkt = null;
        return;
      }
      case "blockquote": {
        this.avslutt();
        const inn = this.innerst();
        if (inn && inn.type === "liste") {
          inn.blokk = null;
          inn.punkt = null;
        }
        this.stabel.push({ type: "sitat" });
        this.antallSitat++;
        return;
      }
      case "table":
      case "caption":
        return this.avslutt();
      case "tr":
        this.avslutt();
        this.rad = { harInnhold: false, ventSep: false };
        return;
      case "td":
      case "th":
        if (!this.rad) this.rad = { harInnhold: false, ventSep: false };
        else if (this.rad.harInnhold) this.rad.ventSep = true;
        return;
      default:
        if (FLATE_BLOKKER.has(navn)) this.grense();
    }
  }

  slutt(navn) {
    if (this.hopp) {
      if (navn === this.hopp.navn && --this.hopp.dybde === 0) this.hopp = null;
      return;
    }
    if (OVERSKRIFT.test(navn)) {
      if (this.rad) return this.inline(" ");
      this.avslutt();
      this.overskrift = 0;
      return;
    }
    switch (navn) {
      case "b":
      case "strong":
        this.fet = Math.max(0, this.fet - 1);
        return;
      case "i":
      case "em":
        this.kursiv = Math.max(0, this.kursiv - 1);
        return;
      case "br":
        return this.inline("\n");
      case "p":
        return this.grense();
      case "pre":
        this.grense();
        this.pre = Math.max(0, this.pre - 1);
        return;
      case "ul":
      case "ol":
        this.avslutt();
        if (this.antallListe > 0) this.popTil("liste");
        return;
      case "li": {
        this.avslutt();
        const inn = this.innerst();
        if (inn && inn.type === "liste") inn.punkt = null;
        return;
      }
      case "blockquote":
        this.avslutt();
        if (this.antallSitat > 0) this.popTil("sitat");
        return;
      case "table":
      case "tr":
      case "caption":
        return this.avslutt();
      default:
        if (FLATE_BLOKKER.has(navn)) this.grense();
    }
  }

  popTil(type) {
    for (;;) {
      const e = this.stabel.pop();
      if (e.type === "liste") this.antallListe--;
      else this.antallSitat--;
      if (e.type === type) break;
    }
    const inn = this.innerst();
    if (inn && inn.type === "liste") inn.punkt = null;
  }

  leggBlokk(blokk) {
    this.blokker.push(blokk);
    if (this.blokker.length > MAKS_BLOKKER) this.stopp = true;
  }

  flush() {
    const ra = this.buffer;
    this.buffer = [];
    if (!ra.some((b) => /\S/.test(b.tekst))) return;
    const biter = this.ferdigBiter(ra, this.pre > 0);
    if (biter.length === 0) return;
    const inn = this.innerst();
    if (inn && inn.type === "liste") {
      if (!inn.blokk) {
        inn.blokk = { type: "liste", nummerert: inn.nummerert, start: inn.nesteNr, dybde: this.dybde(), punkter: [] };
        inn.punkt = null;
        this.leggBlokk(inn.blokk);
      }
      if (!inn.punkt) {
        inn.punkt = [];
        inn.blokk.punkter.push(inn.punkt);
        inn.nesteNr++;
      } else {
        inn.punkt.push({ tekst: "\n", fet: false, kursiv: false });
      }
      for (const b of biter) inn.punkt.push(b);
    } else if (inn) {
      this.leggBlokk({ type: "sitat", dybde: this.dybde(), biter });
    } else if (this.overskrift) {
      this.leggBlokk({ type: "overskrift", niva: this.overskrift, biter });
    } else if (this.pre > 0) {
      this.leggBlokk({ type: "kode", biter });
    } else {
      this.leggBlokk({ type: "avsnitt", biter });
    }
  }

  // Mellomrom normaliseres, URL-filteret kjøres på hele blokka, like biter slås
  // sammen, og sikkerhetsnettet tar hver utgående bit.
  ferdigBiter(ra, bevar) {
    const normal = bevar ? normaliserPre(ra) : normaliser(ra);
    const filtrert = filtrerBiter(normal, this.utenFilter);
    const ut = [];
    for (const b of filtrert) {
      if (!b.tekst) continue;
      const sist = ut[ut.length - 1];
      if (sist && sist.fet === b.fet && sist.kursiv === b.kursiv) sist.tekst += b.tekst;
      else ut.push({ tekst: b.tekst, fet: b.fet, kursiv: b.kursiv });
    }
    for (const b of ut) b.tekst = this.nett(b.tekst);
    return ut;
  }

  ferdig() {
    this.avslutt();
    if (this.blokker.length > MAKS_BLOKKER) return { status: "for_stor" };
    if (this.blokker.length === 0) return { status: "tom" };
    let lengde = 0;
    for (const blokk of this.blokker) {
      const lister = blokk.type === "liste" ? blokk.punkter : [blokk.biter];
      for (const biter of lister) for (const b of biter) lengde += b.tekst.length;
    }
    if (lengde > MAKS_TEKST) return { status: "for_stor" };
    return { status: "ok", blokker: this.blokker };
  }
}

// Slår sammen mellomrom (tekst() har allerede gjort \t/\n/mellomrom til ett
// mellomrom; "\n" her kommer fra <br>), fjerner mellomrom i starten og slutten og
// rundt linjeskift.
function normaliser(biter) {
  const ut = [];
  let venter = -1; // indeks til biten mellomrommet sto i, -1 = ingen
  let harTekst = false;
  let etterLinje = false;
  for (const b of biter) {
    let t = "";
    for (const m of b.tekst.matchAll(/ +|\n|[^ \n]+/g)) {
      const d = m[0];
      if (d[0] === " ") {
        if (venter === -1) venter = ut.length;
      } else if (d === "\n") {
        venter = -1;
        if (harTekst) {
          t += "\n";
          etterLinje = true;
        }
      } else {
        // Mellomrommet blir stående i biten det kom fra (ikke «fet» foran et fett ord).
        if (venter !== -1 && harTekst && !etterLinje) {
          if (venter === ut.length) t += " ";
          else ut[venter].tekst += " ";
        }
        venter = -1;
        etterLinje = false;
        harTekst = true;
        t += d;
      }
    }
    ut.push({ tekst: t, fet: b.fet, kursiv: b.kursiv });
  }
  for (let j = ut.length - 1; j >= 0; j--) {
    ut[j].tekst = trimSlutt(ut[j].tekst, erLinjeskift);
    if (ut[j].tekst) break;
  }
  return ut;
}

// <pre>: mellomrom bevares; ett innledende linjeskift og avsluttende mellomrom fjernes.
function normaliserPre(biter) {
  const ut = biter.map((b) => ({ tekst: b.tekst, fet: b.fet, kursiv: b.kursiv }));
  if (ut.length) ut[0].tekst = ut[0].tekst.replace(/^\n/, "");
  for (let j = ut.length - 1; j >= 0; j--) {
    ut[j].tekst = trimSlutt(ut[j].tekst, erMellomromTegn);
    if (ut[j].tekst) break;
  }
  return ut;
}
