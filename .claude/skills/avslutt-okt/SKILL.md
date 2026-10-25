---
name: avslutt-okt
description: Avslutter en arbeidsøkt på canvas-clone-cli — oppdaterer .claude/docs/STATUS.md med nå-tilstand og nye observasjoner, og foreslår (uten å skrive dem selv) nye oppføringer til .claude/docs/DECISIONS.md for arkitekturbeslutninger tatt i økten. Bruk når brukeren ber om å avslutte/oppsummere økten, eller sier "avslutt økt".
---

# Skill: avslutt økt

Formålet er å sikre at neste økt (din egen eller en annen agent sin) har nok
kontekst uten å måtte lese hele samtalehistorikken på nytt. To separate
output, ulik grad av autonomi:

- `.claude/docs/STATUS.md` oppdateres **direkte** — lavt risiko, lett å se i git-diff
  og reversere.
- `.claude/docs/DECISIONS.md` får **kun forslag**, ikke automatiske skriv — en
  beslutning er mer permanent og skal godkjennes eksplisitt, jf.
  "Arbeidsmåte" i `CLAUDE.md`: "foreslå en oppføring i DECISIONS.md".

## Arbeidsmåte

1. Les gjeldende `.claude/docs/STATUS.md` og `.claude/docs/DECISIONS.md`.
2. Gå gjennom denne øktens endringer: `git status`, `git diff` (inkl.
   ukommitterte endringer), og relevante deler av samtalen i denne økten.
3. Oppdater `.claude/docs/STATUS.md`:
   - **Nå-tilstand**: hva er gjort/endret i denne økten.
   - **Kjente mangler** / **Teknisk gjeld**: legg til nye punkter hvis noe
     ble oppdaget men ikke fikset. Fjern punkter som faktisk ble løst i
     økten.
   - **Observasjoner**: legg til funn som dukket opp utenfor selve oppgaven
     (jf. "Arbeidsmåte" i `CLAUDE.md` — ikke fiks dem uoppfordret, bare
     noter dem).
   - Oppdater "Sist oppdatert"-datoen øverst.
4. Identifiser om noe i økten var en reell arkitektur-/designbeslutning (ikke
   en ren bugfiks) som ikke allerede står i `.claude/docs/DECISIONS.md`. For hver:
   formuler et utkast til oppføring i samme format som filen allerede bruker
   (beslutning, begrunnelse, forkastede alternativer, dato), men **spør
   brukeren om godkjenning før du skriver den inn** — ikke legg den til
   stille.
5. Oppsummer kort til brukeren: hva som ble oppdatert i STATUS.md, og hvilke
   DECISIONS.md-forslag (om noen) som venter på godkjenning.

## Hva du IKKE skal gjøre

- Ikke dikt opp begrunnelser for en beslutning du er usikker på — merk den
  "(rekonstruert – bekreft)" i stedet, som resten av `DECISIONS.md` allerede
  gjør.
- Ikke fiks teknisk gjeld eller andre funn du oppdager underveis — de hører
  hjemme i "Observasjoner", ikke i en uoppfordret fiks.
- Ikke skriv til `.claude/docs/DECISIONS.md` uten eksplisitt godkjenning.
