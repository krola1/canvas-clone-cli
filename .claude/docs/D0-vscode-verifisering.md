# D0 — verifisering av VS Code-atferd før bygging av utvidelsen

**Dato:** 2026-10-29 · **Jobb:** canvas-clone-cli som VS Code-utvidelse (verkstedet, steg D0)
**Grunnlag:** `verkstedet/org/jobblogg.md` (2026-10-29) og `tilsynet/org/risikovurderinger.md`
(2026-10-29, T8–T19).

## Kilder og hvordan de er lest

- **Kildekode for VS Code:** `microsoft/vscode`, `main` på commit
  `0f33e8274d74eb642577d8cae03beee61fed4a35` (2026-10-29, `package.json` versjon 1.145.0-dev).
  I notatet forkortes det til **VS@0f33e82**, og bare stien og linjen er oppgitt. Full URL:
  `https://github.com/microsoft/vscode/blob/0f33e8274d74eb642577d8cae03beee61fed4a35/<sti>#L<linje>`.
- **Kildekode og dokumentasjon for Git:** `git/git` på commit `8d1b215c` (2026-10-28), forkortet
  til **git@8d1b215**.
- **Offisiell dokumentasjon:** Sidene på code.visualstudio.com er oppgitt med URL der de er brukt.
- **Sikkerhetsgrader:** Hvert punkt har en av disse:
  - **dokumentert**: står på code.visualstudio.com, git-scm eller i Git-dokumentasjonen.
  - **lest i kildekode**: jeg har lest koden selv.
  - **kun issue/forum**
  - **ukjent**
- **Kildekoden er nyere enn stabil versjon.** Kildekoden er `main` og ikke en stabil
  utgivelse. Lars har VS Code 1.131 installert. Mekanismene nedenfor er gamle (Workspace Trust
  kom i 1.57), men detaljer kan avvike i eldre stabile versjoner. Det gjelder for eksempel
  standardverdien for `startupPrompt`.

---

## a) Hva blokkerer Restricted Mode faktisk?

**Svar: delvis.** Restricted Mode blokkerer de fleste av disse tingene, men på ulike måter.
Viktigst er at tasks og debug ikke blir *blokkert*. De *ber om tillit* i en dialog. Trykker
læreren «Trust» der, blir hele vinduet betrodd.

| Funksjon | Atferd i Restricted Mode | Kilde | Grad |
|---|---|---|---|
| Automatiske tasks (`runOn: folderOpen`) | Kjører ikke. `_tryRunTasks` returnerer tidlig når vinduet ikke er betrodd, men prøver igjen ved `onDidChangeTrust`. | VS@0f33e82 `src/vs/workbench/contrib/tasks/browser/runAutomaticTasks.ts` L43–49 | lest i kildekode |
| Liste opp og kjøre tasks | Viser en dialog som ber om tillit: «Listing and running tasks requires…». Tasks kjører bare hvis læreren trykker «Trust». | VS@0f33e82 `…/tasks/browser/abstractTaskService.ts` L3102–3112. https://code.visualstudio.com/docs/editing/workspaces/workspace-trust | dokumentert og lest i kildekode |
| Debug/`launch.json` | `startDebugging` kaller `requestWorkspaceTrust` og avbryter hvis svaret er nei. | VS@0f33e82 `…/debug/browser/debugService.ts` L354–359 | dokumentert og lest i kildekode |
| Terminal | Lokal terminal er blokkert, med en dialog som ber om tillit. Unntaket er når brukeren har satt `terminal.integrated.allowInUntrustedWorkspace`. Den innstillingen er `restricted: true`, så workspace kan ikke sette den. | VS@0f33e82 `…/terminal/browser/terminalInstance.ts` L1998–2017 og `…/terminal/common/terminalConfiguration.ts` L697–701 | dokumentert og lest i kildekode |
| Workspace-innstillinger | **Bare** innstillinger merket `restricted: true` (kjernen) eller oppført i en utvidelses `restrictedConfigurations` blir ignorert fra workspace og mappe. **Alle andre workspace-innstillinger gjelder også i Restricted Mode.** | VS@0f33e82 `src/vs/platform/configuration/common/configurationModels.ts` L510 (`skipRestricted && propertySchema.restricted`) og `…/services/configuration/browser/configuration.ts` L1040. https://code.visualstudio.com/api/extension-guides/workspace-trust | dokumentert og lest i kildekode |
| Eksempler på innstillinger med `restricted` | `http.proxy*`, `http.systemCertificates`, `http.fetchAdditionalSupport`, `workbench.externalBrowser`, `terminal.integrated.allowInUntrustedWorkspace` og `chat.useNestedAgentsMdFiles` | VS@0f33e82 `src/vs/platform/request/common/request.ts` og `src/vs/workbench/browser/workbench.contribution.ts` | lest i kildekode |
| Utvidelser | Utvidelser som ikke har sagt at de støtter Restricted Mode, er av. Det gjelder `supported: false` og utvidelser uten deklarasjon som har `main`. `limited` og `true` kjører. | VS@0f33e82 `src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts` L601–611. Docs: workspace-trust | dokumentert og lest i kildekode |
| Innebygde utvidelser som er av i Restricted Mode | `vscode.git` og `typescript-language-features` (`supported: false` i `extensions/*/package.json`). På Lars' maskin gjelder det også Claude Code, Python, ESLint og rust-analyzer. | `extensions/git/package.json` `capabilities` og lokal `~/.vscode/extensions/*/package.json` | lest i kildekode og manifest |
| Anbefalte utvidelser (`.vscode/extensions.json`) | Jeg fant **ingen sjekk av tillit** i koden for anbefalinger. Filen leses bare fra **roten av workspace-mappen**: `workspaceFolder.toResource('.vscode/extensions.json')`. | VS@0f33e82 `src/vs/workbench/services/extensionRecommendations/common/workspaceExtensionsConfig.ts` L23, L289. Søk etter «Trust» i `…/extensions/browser/*Recommend*` ga ingen treff. | lest i kildekode. Dokumentasjonen nevner det ikke. |
| MCP (`.vscode/mcp.json`) | Ny vektor siden planen ble laget. MCP-servere som er definert i workspace, ber om tillit før de starter. Filen er en del av `WORKSPACE_STANDALONE_CONFIGURATIONS`, altså bare rot-`.vscode/`. | VS@0f33e82 `…/mcp/common/mcpRegistry.ts` L232–237 og `…/services/configuration/common/configuration.ts` L41–43 | lest i kildekode |
| KI-agenter | «Opening a workspace in restricted mode disables agents in that workspace.» | https://code.visualstudio.com/docs/editing/workspaces/workspace-trust | dokumentert |
| Devcontainer | Funksjonen ligger i en utvidelse (Dev Containers), ikke i kjernen. Jeg har ikke verifisert hvordan den oppfører seg. | – | ukjent |

**Konsekvens for planen:**
- **T9c holder.** Den modale advarselen må si eksplisitt: «Trykk ikke Trust i dialogen som
  dukker opp når du prøver å kjøre en task, starte debug eller åpne en terminal.» Det er den
  vanligste veien til tillit, ikke bare banneret.
- **R-V2 er ikke uendret.** Alle workspace-innstillinger uten `restricted` gjelder. Det er
  likevel uproblematisk så lenge rot-`.vscode/` i øktmappen bare skrives av oss.
- **Ny følge av T9a:** Øktmappen får aldri `.vscode/extensions.json`, `tasks.json`,
  `launch.json` eller `mcp.json`. Den får bare vår egen `settings.json` (se e).

## b) Arver en undermappe tillit fra en betrodd forelder? Finnes det et API for listen?

**Svar: ja, arv. Nei, ikke noe stabilt API for listen.**

- **Tillit arves fra forelder.**
  - Dokumentasjonen: «You can also trust a parent folder, which applies trust to the parent
    folder and all its subfolders.» (https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
  - Koden: `getUriTrustInfo` velger den lengste stien i listen som er lik eller forelder
    (`isEqualOrParent`). VS@0f33e82 `src/vs/workbench/services/workspaces/common/workspaceTrust.ts`
    L477–493.
  - Grad: **dokumentert og lest i kildekode.**
- **En betrodd forelder kan ikke overstyres for en undermappe.** Å fjerne tillit fjerner bare
  oppføringen. Det finnes ingen negative oppføringer (`doSetUrisTrust`, samme fil L496–520).
  Er `~` eller `~/canvas-clone` betrodd, er alle økter betrodd. Grad: **lest i kildekode.**
- **Listen ligger i applikasjonslagringen.** Nøkkelen er `content.trust.model.key` i
  `StorageScope.APPLICATION_SHARED` (samme fil L42, L329, L355). Den deles på tvers av
  profiler og er ikke tilgjengelig for utvidelser. Grad: **lest i kildekode.**
- **Stabilt API:**
  - Det finnes bare `workspace.isTrusted` og `onDidGrantWorkspaceTrust` (VS@0f33e82
    `src/vscode-dts/vscode.d.ts` L14530–14537).
  - `isResourceTrusted(uri)`, `requestResourceTrust` og `onDidChangeWorkspaceTrustedFolders`
    finnes bare som *proposed API* (`src/vscode-dts/vscode.proposed.workspaceTrust.d.ts`).
  - Proposed API er «only available in Insiders» og krever `--enable-proposed-api`
    (https://code.visualstudio.com/api/advanced-topics/using-proposed-api). Det kan ikke
    brukes i en `.vsix` for stabil VS Code.
  - Grad: **dokumentert og lest i kildekode.**
- **Trust-setting av gir `isTrusted === true`.**
  - Er `security.workspace.trust.enabled` av, eller er VS Code startet med
    `--disable-workspace-trust`, rapporteres alt som betrodd (`isWorkspaceTrustEnabled`,
    workspaceTrust.ts L87–93; `isWorkspaceTrusted`, L373–374).
  - Grad: **lest i kildekode.**

**Konsekvens for planen:**
- **Arv før åpning kan ikke oppdages.** Hovedvinduet kan ikke sjekke om øktmappen vil bli
  betrodd på grunn av en forelder. Det eneste pålitelige signalet er `workspace.isTrusted` *inne i
  øktvinduet*.
- **T9d er derfor hovedkontrollen.** Hvis `isTrusted` er `true` i øktvinduet, vises en modal
  som tilbyr å lukke. Det dekker både arvet tillit, trust slått av og `--disable-workspace-trust`.
- **T9b endres** til å bruke `isTrusted` i øktvinduet i stedet for, eller i tillegg til, å lese
  innstillingen. Innstillingen alene fanger ikke CLI-flagget.
- **Øktmappens navn må aldri gjenbrukes.** Tillit som er gitt én gang, blir liggende på stien
  (`YYYYMMDD-HHMMSS-<pid>` er unik nok).
- **README (T9e):** Etter sletting står stien til en betrodd økt fortsatt i lista over betrodde
  mapper. Den kan fjernes under «Manage Workspace Trust».

## c) SecretStorage uten keyring på Linux, og backend på Windows og macOS

**Svar: Uten keyring faller VS Code tilbake til lagring i minnet, med feilmelding. Tokenet
overlever da ikke en omstart.**

- **Hvis kryptering ikke er tilgjengelig** (`safeStorage.isEncryptionAvailable()` er `false`):
  - `BaseSecretStorageService.initialize` bytter til `InMemoryStorageService` og setter
    `type = 'in-memory'` (VS@0f33e82 `src/vs/platform/secrets/common/secrets.ts` L225–239).
  - Grad: **lest i kildekode.**
- **Varsel ved første `set`** (VS@0f33e82
  `src/vs/workbench/services/secrets/electron-browser/secretStorageService.ts` L41–100):
  - **Windows og macOS:** feilvarsel med lenke til feilsøkingsguiden.
  - **Linux med backend `basic_text`:** modal feildialog med knappen «Use weaker encryption».
    Knappen skriver `password-store: basic` til `argv.json` og initialiserer på nytt.
  - **GNOME og KDE uten fungerende keyring:** egne feilmeldinger.
  - Grad: **lest i kildekode.**
- **Hva «basic» betyr:** «provides obfuscation rather than secure encryption», med nøkkel
  «hardcoded in Chromium» (https://code.visualstudio.com/docs/configure/settings-sync,
  avsnittet om feilsøking av keychain). Grad: **dokumentert.**
- **Backend per plattform** (`getKeyStorageProvider`, VS@0f33e82
  `src/vs/platform/encryption/electron-main/encryptionMainService.ts` L72–89):
  - Windows: `dplib` (DPAPI).
  - macOS: `keychainAccess`.
  - Linux: det Chromium velger (`gnome_libsecret`, `kwallet*`, `basic_text`).
  - De krypterte verdiene lagres i applikasjonslagringen.
  - Grad: **lest i kildekode.** Dokumentasjonen sier bare: «Windows and macOS usually do not
    require additional keychain configuration».
- **Lagring i minnet gjelder per vindu.** Tjenesten er instansiert per renderer, så tokenet
  finnes da bare i vinduet der det ble lagt inn. Grad: **lest i kildekode** (avledet, ikke
  testet).
- **API-kontrakten:** `SecretStorage` «will be stored encrypted. The implementation … will be
  different on each platform» (vscode.d.ts L8634–8639). Det finnes **ikke** noe API for å spørre
  om lagringen er i minnet. Grad: **lest i kildekode.**

**Konsekvens for planen:**
- **R-V7 bør justeres.** Uten keyring er standarden *ikke* klartekst på disk. Tokenet lagres i
  minnet og er borte etter omstart. Klartekst-lignende lagring skjer bare hvis læreren selv
  trykker «Use weaker encryption».
- **UX:** Oppsettet bør oppdage at tokenet «forsvant» etter omstart og forklare hvorfor. Det
  ser ut som en feil, men er en keyring-mangel.
- **README:** Råd om å ikke velge «weaker encryption» på delte maskiner.

## d) Kan workspace overstyre innstillinger med scope `application` eller `machine`?

**Svar: nei.**

- **Scopes som leses fra workspace og mappe:**
  - `WORKSPACE_SCOPES = [WINDOW, RESOURCE, LANGUAGE_OVERRIDABLE, MACHINE_OVERRIDABLE]`.
  - `FOLDER_SCOPES = [RESOURCE, LANGUAGE_OVERRIDABLE, MACHINE_OVERRIDABLE]`.
  - `APPLICATION` og `MACHINE` er ikke med (VS@0f33e82
    `src/vs/workbench/services/configuration/common/configuration.ts` L28–34).
  - `FolderConfiguration` bruker disse (`…/browser/configuration.ts` L1038).
  - Grad: **lest i kildekode.**
- **Alle `security.workspace.trust.*` har scope `APPLICATION`** (VS@0f33e82
  `src/vs/workbench/contrib/workspace/browser/workspace.contribution.ts` L797–851).
  `startupPrompt` har standard `never` i både kode og dokumentasjon. Grad: **dokumentert og
  lest i kildekode.**
- **`workbench.localHistory.enabled` har scope `RESOURCE`** og *kan* altså settes per mappe (se
  e).
- **`files.hotExit` har scope `APPLICATION`** og kan ikke slås av per workspace
  (`…/files/browser/files.contribution.ts` L123–128). Grad: **lest i kildekode.**
- **`git.path` har scope `machine`** (`extensions/git/package.json` L3296–3304).

**Konsekvens for planen:**
- Et elevrepo kan ikke slå av trust. Det kan heller ikke øktmappen (T9b-forutsetningen holder).
- Hot exit-backup av ulagrede elevfiler kan ikke slås av fra øktmappen (se e).

## e) Local History, «Åpne nylig» og `workspaceStorage`: hva lagres hvor? Virker
`localHistory.enabled` per mappe i Restricted Mode?

**Svar: ja. `workbench.localHistory.enabled: false` i `<økt>/.vscode/settings.json` virker,
også i Restricted Mode.**

**`workbench.localHistory.enabled`:**
- Scope `RESOURCE` og **ikke** `restricted` (VS@0f33e82
  `src/vs/workbench/browser/workbench.contribution.ts` L480–485).
- Trackeren leser den per fil: `getValue(ENABLED, { resource })` (VS@0f33e82
  `src/vs/workbench/services/workingCopy/common/workingCopyHistoryTracker.ts` L207). Filer i
  `<økt>/<eier>_<repo>/…` løses mot workspace-mappen `<økt>`.
- Grad: **lest i kildekode.** Dokumentasjonen sier ikke noe om scope.

**Lagringssteder.** `appSettingsHome` er `<userData>/User` (`environmentService.ts` L56). På Linux
er det `~/.config/Code/User`.

| Spor | Sted | Innhold | Kilde | Grad |
|---|---|---|---|---|
| Local History | `<userData>/User/History/` | Kopier av lagrede filer pluss `entries.json` med ressurs-URI | `src/vs/platform/environment/common/environmentService.ts` L89 | lest i kildekode |
| «Åpne nylig» | Nøkkelen `history.recentlyOpenedPathsList` i den globale `state.vscdb` (`User/globalStorage/`) | Mappestien til økten | `src/vs/platform/workspaces/electron-main/workspacesHistoryMainService.ts` L52 | lest i kildekode |
| Windows Jump List og macOS Dock | Avledet fra «Åpne nylig» | Det samme | samme fil L345–420 | lest i kildekode |
| `workspaceStorage` | `<userData>/User/workspaceStorage/<id>/state.vscdb` og `workspace.json` | Mappe-URI, editor-/view-tilstand, utvidelsenes `workspaceState` | `environmentService.ts` L86; `src/vs/platform/storage/common/storageService.ts` L151 | lest i kildekode |
| Hot exit-backup | `<userData>/Backups/<workspace-id>/` | Ulagret innhold | `src/vs/platform/environment/electron-main/environmentMainService.ts` L49 | lest i kildekode |
| Vindustilstand for gjenoppretting | `User/globalStorage/storage.json` (`windowsState`) | Stien til mappen i åpne vinduer | `src/vs/platform/windows/electron-main/windowsStateHandler.ts` L55 | lest i kildekode |

**Funn som påvirker planen:**
1. **`vscode.openFolder` har `noRecentEntry: true`.** Da legges økten ikke i «Åpne nylig»,
   Jump List eller Dock (`!openConfig.noRecentEntry`, VS@0f33e82
   `src/vs/platform/windows/electron-main/windowsMainService.ts` L477; opsjonen er dokumentert i
   kommando-metadata i `src/vs/workbench/browser/actions/workspaceCommands.ts` L155–224).
   Kommandoen `vscode.removeFromRecentlyOpened` finnes også (samme fil L270–288). Grad:
   **lest i kildekode.** Kommandoene er listet på https://code.visualstudio.com/api/references/commands,
   men jeg har ikke åpnet den siden.
2. **`workspaceStorage/<id>/` for mappe-workspaces ryddes aldri automatisk.** Rydderen hopper
   over alle id-er med lengden til en ikke-tom workspace (VS@0f33e82
   `src/vs/code/electron-utility/sharedProcess/contrib/storageDataCleaner.ts` L51–53). Hver økt
   etterlater altså en mappe med `workspace.json`, som inneholder øktstien. Den inneholder også
   editortilstand, som kan inkludere stier som `<eier>_<repo>/fil`.
   - Utvidelsen kjenner sin egen `context.storageUri` i øktvinduet. Forelderen er
     `workspaceStorage/<id>/`.
   - Mulig tiltak (ikke verifisert): skriv denne stien i ferdig-markøren, og la hovedvinduet slette
     den etter at øktvinduet er lukket.
   - Grad: **lest i kildekode** for at den blir liggende. Tiltaket er **ukjent** og må prøves.
3. **Hot exit (`files.hotExit`, `APPLICATION`)** kan legge ulagret elevkode i `Backups/` hvis
   VS Code avsluttes med skitne editorer. Det kan ikke slås av fra øktmappen. Bør nevnes i
   README eller under R-V5.

## f) KRITISK (T9a): leses `.vscode/*` fra UNDERMAPPER av workspace-mappen?

**Svar for kjerne-VS Code: nei. T9a holder.** For tredjepartsutvidelser: **delvis eller
ukjent**. Det er utenfor vår kontroll, men dempes av Restricted Mode.

**Kjerne-VS Code:**
- **`settings.json`, `tasks.json`, `launch.json` og `mcp.json`:**
  - `FolderConfiguration` lages med `configurationFolder = joinPath(workspaceFolder.uri, '.vscode')`.
    Det skjer én gang per *workspace-mappe* (VS@0f33e82
    `src/vs/workbench/services/configuration/browser/configurationService.ts` L967–977 og
    `…/browser/configuration.ts` L1039).
  - Filene er definert som `.vscode/<navn>.json` relativt til mappen (`…/common/configuration.ts`
    L14–16, L40–43).
  - Det finnes ingen rekursjon. Ressurs-scopede oppslag for filer i undermapper løses mot den
    workspace-mappen som inneholder dem.
  - Grad: **lest i kildekode.** Dokumentasjonen sier bare «stored in the `.vscode` folder at the
    root of your workspace».
- **`extensions.json`:** Bare `workspaceFolder.toResource('.vscode/extensions.json')`
  (`workspaceExtensionsConfig.ts` L289). Grad: **lest i kildekode.**
- **Unntak i kjernen som leser nestede filer:**
  - `chat.useNestedAgentsMdFiles` leser nestede `AGENTS.md`. Den er `default: false` og
    `restricted: true` (VS@0f33e82 `src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts`
    ca. L2168–2172).
  - Agenter er uansett av i Restricted Mode.
  - Grad: **lest i kildekode.** Det er en ny vektor for R-V9 hvis læreren gir tillit. Elevrepoer
    kan inneholde `AGENTS.md` eller `.github/copilot-instructions.md` (prompt injection).
- **Mappenavn kan ikke krasje med `.vscode`.** Ingen direkte undermappe av `<økt>` kan hete
  `.vscode`. Mappene heter `<eier>_<repo>`, og GitHub-eiere kan ikke begynne med `.`. Det
  forutsetter at kurs-/oppgavemapper ved bulk på tvers av kurs er numeriske id-er. Sjekkes i
  D1/D4.

**Git-utvidelsen (innebygd):**
- **I Restricted Mode er den helt av** (`"untrustedWorkspaces": {"supported": false}` i
  `extensions/git/package.json`). Den skanner ingen nestede repoer. Grad: **lest i manifest og
  kildekode.**
- **I et betrodd øktvindu** skanner den undermapper (`git.repositoryScanMaxDepth`, scope
  `resource`, standard `1`) og åpner `<økt>/<eier>_<repo>` som repoer. Git-innstillingene leses
  med repo-roten som ressurs, og løses da mot `<økt>/.vscode/settings.json`, ikke mot
  elevrepoets `.vscode/` (mekanismen over). Den kjører `git status` og lignende i repoet.
  - `.git/config` lages av `git clone` og kommer ikke fra eleven, så `core.fsmonitor`, hooks
    og filtre følger ikke med kloningen.
  - Grad: **lest i kildekode og dokumentasjon** (Git-dokumentasjonen for hooks er ikke sitert
    her).

**Andre utvidelser:**
- **Fritt fram for egne skanninger.** Utvidelser kan lese og kjøre hva de vil fra undermapper,
  for eksempel nestede `eslint.config.js`, `pyproject.toml`, `.venv` og `jest.config`. VS Code
  hindrer det ikke. Workspace Trust er den eneste mekanismen.
- **På Lars' maskin** er ESLint, Python, Python Envs, rust-analyzer, Claude Code og
  TypeScript Native Preview `supported: false`. Pylance, Prettier og markdownlint er `limited`
  og sier selv at de ikke kjører workspace-kode. Utvidelser uten deklarasjon er av.
- Grad: **lest i manifest.** Hva hver utvidelse faktisk gjør i en betrodd økt, er **ukjent**.

**Konsekvens:**
- T9a står. R-V2 kan bli på Middels slik tilsynet forutsatte.
- Restrisikoen er knyttet til *tillit*, ikke til nestede `.vscode`. Gir læreren tillit
  (direkte eller arvet), kjører utvidelsene sine egne skanninger av elevkode. Derfor er T9d
  (modal ved `isTrusted`) den viktigste kontrollen.

## g) Utvidelsesvert per vindu, livssyklus og aktivering i Restricted Mode

**Én utvidelsesvert per vindu:**
- **Svar: ja.** Hvert vindu (renderer) starter sin egen `LocalProcessExtensionHost`. Miljøet
  bygges fra vinduets `process.shellEnv()` (VS@0f33e82
  `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts` L220–238).
- Grad: **lest i kildekode.** Dokumentasjonen (https://code.visualstudio.com/api/advanced-topics/extension-host)
  sier ikke noe om vinduer.

**Reload Window og `openFolder` i samme vindu:**
- **Svar: utvidelsesverten stoppes og startes på nytt.**
- Metadata for `vscode.openFolder`: «opening in the same window will shutdown the current
  extension host process and start a new one» (`workspaceCommands.ts` L206).
- `workbench.action.closeFolder` er `openWindow({ forceReuseWindow: true })`, altså det samme
  (`src/vs/workbench/browser/actions/workspaceActions.ts` L164–185).
- Grad: **lest i kildekode og kommando-metadata.**

**Når tillit gis:**
- **Fra ikke betrodd til betrodd: ingen omstart.** `updateExtensionsEnablementsWhenWorkspaceTrustChanges`
  slår bare på utvidelser som nå blir tillatt.
- **Fra betrodd til ikke betrodd: utvidelsesvertene stoppes og startes på nytt** (VS@0f33e82
  `src/vs/workbench/contrib/extensions/browser/extensionEnablementWorkspaceTrustTransitionParticipant.ts`
  L33–47).
- Dokumentasjonen: «When trust is granted, a configuration change event will fire in addition
  to the Workspace Trust event.»
- Grad: **dokumentert og lest i kildekode.**

**Aktivering for en `limited`-utvidelse i Restricted Mode:**
- **Svar: ja, som normalt.** `_isDisabledByWorkspaceTrust` returnerer `false` når typen ikke er
  `false`.
- `workspaceContains` har ingen sjekk av tillit. For et enkelt filnavn uten glob sjekkes
  `exists(joinPath(folder, fileName))` direkte, med 7 sekunders timeout for glob-søk (VS@0f33e82
  `src/vs/workbench/services/extensions/common/workspaceContains.ts` L18, L74).
- `onStartupFinished` er «emitted … some time after VS Code starts up»
  (https://code.visualstudio.com/api/references/activation-events).
- **Unntak:** Brukerinnstillingen `extensions.supportUntrustedWorkspaces` kan overstyre
  manifestet (`extensionManifestPropertiesService.ts` ca. L350–371).
- Grad: **lest i kildekode.** At `limited` faktisk aktiveres i Restricted Mode, er ikke sagt
  eksplisitt i dokumentasjonen.

**Konsekvens for planen (B1/B2):**
- **Aktivering:** Bruk `workspaceContains:<eksakt markørfilnavn>` sammen med
  `onStartupFinished`. Det er den sikreste aktiveringen i øktvinduet.
- **«Ferdig» i øktvinduet:** Skriv markøren *før* `closeFolder`/`closeWindow`. Utvidelsesverten
  dør med en gang.
- **Hjerteslaget stopper ikke ved tillit.** Fra ikke betrodd til betrodd er det ingen omstart.
  Fra betrodd til ikke betrodd er det en omstart, og hjerteslaget må da tåle aktivering på nytt.

## h) ESM eller CJS? Minimum for `engines.vscode`?

- **ESM støttes fra 1.100.** «The NodeJS extension host now supports extensions that use
  JavaScript-modules (ESM). All it needs is the `"type": "module"` entry…», med `import('vscode')`.
  Det gjelder ikke webworker-verten (https://code.visualstudio.com/updates/v1_100). Grad:
  **dokumentert.**
- **Regelen i koden:** `isESM = modulePath.endsWith('.mjs') || (type === 'module' &&
  !modulePath.endsWith('.cjs'))` (VS@0f33e82 `src/vs/workbench/api/common/extHostExtensionService.ts`
  L1092–1094). Lasting av ESM skjer via `import()`, med `module.registerHooks` for `vscode`
  (`src/vs/workbench/api/node/extHostExtensionService.ts` L131, L189–210). Grad: **lest i
  kildekode.**
- **Fallgruve:** Hvis `vscode/package.json` får `"type": "module"`, må en CJS-bundle hete
  `.cjs`. Ellers lastes den som ESM. Grad: **lest i kildekode.**
- **Node-versjon:**
  - 1.100.0 har Electron 34.5.1 (`.npmrc`), og `remote/.npmrc` har Node 20.19.0.
  - 1.105.0 har Electron 37.6.0 og Node 22.19.0.
  - `main` har Electron 43.8.3 og Node 24.22.1.
  - Grad: **lest i kildekode** (rå `.npmrc` per tag). Den eksakte Node-versjonen i Electron 34 er
    ikke slått opp.
- **Testkjøreren:** Dokumentasjonen om testing sier ikke noe om ESM (se i).

**Anbefaling:**
- **Bundle til CJS** med esbuild (`format: 'cjs'`, `platform: 'node'`, `external: ['vscode']`).
  Kjernen i `src/` er ESM, men bruker ikke `import.meta` (sjekket med grep). Det er derfor trygt å
  bundle den til CJS.
- **`engines.vscode: "^1.100.0"`** gir Node 20 og global `fetch`. Det gir også muligheten til å
  gå over til ESM senere uten å heve minimumet.
- Dette er en vurdering, ikke en verifikasjon.

## i) `@vscode/test-electron`, mocha og CI

- **Mocha er standard.** Test-CLI-et (`@vscode/test-cli` og `@vscode/test-electron`): «The CLI
  exclusively uses Mocha under the hood». Den avanserte oppsettet med `runTests` fra
  `@vscode/test-electron` kan bruke hvilket rammeverk som helst. `.vscode-test.{js,mjs,cjs}` med
  `files`, `version`, `workspaceFolder` og `mocha`
  (https://code.visualstudio.com/api/working-with-extensions/testing-extension). Grad:
  **dokumentert.**
- **Testing av Restricted Mode er dokumentert.**
  - «You can't programmatically grant or revoke Workspace Trust from an extension test».
  - Bruk to konfigurasjoner med label: én med `--disable-workspace-trust` og én med egen
    `--user-data-dir` for kjøringen uten tillit.
  - Grad: **dokumentert.**
- **GitHub Actions:**
  - Matrisen `[macos-latest, ubuntu-latest, windows-latest]`.
  - «In headless Linux CI machines `xvfb` is required»: `xvfb-run -a npm test` på Linux,
    `npm test` ellers
    (https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
  - Eksempelet bruker `actions/checkout@v4` og `setup-node@v4` med tag. **T19 krever pinning
    til commit-SHA**, så eksempelet kan ikke kopieres rett.
  - Grad: **dokumentert.**
- **`--disable-extensions`** anbefales slik at andre installerte utvidelser ikke lastes. Grad:
  **dokumentert.**

**Konsekvens:**
- Med `@vscode/test-cli` blir mocha valgt for oss. Det er i tråd med de godkjente
  devDependencies, men `@vscode/test-cli` er **ikke** på listen over godkjente devDependencies.
  Velg enten `runTests` direkte (som godkjent) eller be Lars om å legge til `@vscode/test-cli`.
- Testglob og egne kjøringer for betrodd og ikke betrodd planlegges i D2.

## j) PATH for `git` når VS Code startes fra GUI

- **macOS og Linux:**
  - Når VS Code *ikke* er startet fra CLI, kjører hovedprosessen brukerens login-skall for å
    hente miljøet (`resolveShellEnv`). Det har en timeout
    (`application.shellEnvironmentResolutionTimeout`).
  - Hoppes over på Windows, og når `VSCODE_CLI` er satt (VS@0f33e82
    `src/vs/platform/shell/node/shellEnv.ts` L32–75).
  - Utvidelsesverten arver `process.env`, deretter shell-env, deretter `userEnv`
    (`src/vs/base/parts/sandbox/electron-browser/preload.ts` L81–88).
  - `spawn('git')` finner altså git hvis login-skallet har den i PATH.
  - Grad: **lest i kildekode.**
- **macOS-fallgruve:**
  - `/usr/bin/git` finnes alltid, men er en shim. Uten Command Line Tools åpner den en
    installasjonsdialog.
  - VS Codes git-utvidelse sjekker derfor `which git` og deretter `xcode-select -p` (exit-kode 2
    betyr ikke installert) før den bruker `/usr/bin/git` (VS@0f33e82 `extensions/git/src/git.ts`
    L102–145).
  - Grad: **lest i kildekode.**
- **Windows:**
  - Ingen oppslag av skall-miljø. PATH er det GUI-prosessen arver.
  - Git-utvidelsen prøver `%ProgramW6432%`, `%ProgramFiles(x86)%`, `%ProgramFiles%` og
    `%LocalAppData%\Programs` (+ `\Git\cmd\git.exe`) og til slutt `which('git.exe')` (samme
    fil L148–165).
  - Hint fra `git.path` (scope `machine`) prøves først (L167–175).
  - Grad: **lest i kildekode.**
- **API:** `vscode.git`-utvidelsen eksporterer `getAPI(1).git.path` (VS@0f33e82
  `extensions/git/src/api/git.d.ts` L9–11). Utvidelsen er av i Restricted Mode og når
  `git.enabled` er `false`, så den kan ikke være eneste kilde.
- **Hvordan Node og libuv slår opp `git` vs `git.exe` på Windows uten skall:** ikke verifisert
  (**ukjent**).

**Konsekvens:**
- Lag en `findGit()` i utvidelsen som speiler git-utvidelsen:
  1. `vscode.git` sin `git.path` hvis tilgjengelig.
  2. Ellers per plattform, med `xcode-select`-sjekken på macOS og stiene under Program Files på
     Windows.
  3. Til slutt `git` fra PATH.
- Kloningen skjer i hovedvinduet. Det kan være betrodd eller ikke, så API-et er ikke alltid
  der.

## k) `git clone` uten lærerens påloggingsdata (T18)

**Svar: delvis. `GIT_TERMINAL_PROMPT=0` sammen med `-c credential.helper=` er *ikke* nok
alene.**

- **`-c credential.helper=` tømmer lista, også URL-spesifikke hjelpere fra system- og global
  config.**
  - Dokumentert: «If `credential.helper` is configured to the empty string, this resets the
    helper list to empty» (git@8d1b215 `Documentation/gitcredentials.adoc` L199–202).
  - Kildekoden: Tom verdi gir `string_list_clear(&c->helpers)` (git@8d1b215 `credential.c`
    L119–123).
  - Credential-config bruker `select_fn = select_all`. Alle treff, både
    `credential.helper` og `credential.<url>.helper`, behandles i lesrekkefølge uten
    spesifisitetsfilter (L150–153, L175–197). `-c` leses sist.
  - Det dekker GCM (`credential.helper=manager` i Git for Windows sin system-gitconfig),
    `osxkeychain` (Xcode/Homebrew sin system-config) og `gh auth setup-git`
    (`credential.https://github.com.helper`).
  - Grad: **dokumentert og lest i kildekode.** At GCM og osxkeychain konkret ligger i
    system-config, er ikke verifisert, men spiller ingen rolle fordi lista tømmes uansett.
- **`GIT_TERMINAL_PROMPT=0` stopper ikke askpass.**
  - Rekkefølgen er `GIT_ASKPASS`, så `core.askPass`, så `SSH_ASKPASS`, og først deretter
    terminal. `GIT_TERMINAL_PROMPT` gjelder bare det siste steget (git@8d1b215 `prompt.c` L50–75;
    `Documentation/gitcredentials.adoc` L28–42).
  - `GIT_ASKPASS=""` (satt, men tom) stopper hele kjeden. `getenv` gir da ikke-NULL, så
    `core.askPass` og `SSH_ASKPASS` prøves ikke, og `*askpass` er falsk.
  - Grad: **lest i kildekode.**
- **Setter VS Code `GIT_ASKPASS`/`VSCODE_GIT_*` i miljøet til utvidelsesverten?**
  - **Normalt nei.** Git-utvidelsen setter disse bare for sine egne `spawn`-kall og for
    terminaler via `environmentVariableCollection` (VS@0f33e82 `extensions/git/src/askpass.ts`
    L37–48; `terminal.ts` L28–39). Den endrer ikke `process.env`.
  - Søk i `src/vs` (sparse-utsjekk) fant ingen kode i kjernen som setter dem.
  - **Men:** Utvidelsesvertens miljø inkluderer `userEnv` fra CLI-kallet som åpnet vinduet
    (`preload.ts` L53, L81–88). Startes VS Code med `code …` fra en VS Code-terminal, kan
    `GIT_ASKPASS` og `VSCODE_GIT_ASKPASS_*`/`VSCODE_GIT_IPC_HANDLE` fra terminalen lekke inn.
  - `removeDangerousEnvVariables` fjerner bare `DEBUG`, `NODE_OPTIONS`, `LD_PRELOAD` og
    lignende (`src/vs/base/common/processes.ts` L134–150).
  - Grad: **lest i kildekode.** At det faktisk skjer i praksis, er **ikke testet**.
- **`url.<base>.insteadOf` i lærerens globale config** kan skrive `https://github.com/` om til
  SSH og bruke lærerens nøkler.
  - Dokumentert: «protocol restrictions will be applied to the rewritten URL»
    (git `Documentation/config/url.adoc`), og `protocol.allow` / `protocol.<name>.allow`
    (`Documentation/config/protocol.adoc`).
  - Grad: **dokumentert.**

**Konsekvens (endring av T18):** `git clone` kjøres med et *sanert* miljø.

Fjern fra miljøet:
- `GIT_ASKPASS`, `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`
- `VSCODE_GIT_*`
- `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`
- `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*`

Sett i miljøet:
- `GIT_TERMINAL_PROMPT=0`
- `GIT_ASKPASS=` (tom)

Argumenter:

```
git -c credential.helper= -c core.askPass= -c protocol.allow=never -c protocol.https.allow=always clone --quiet -- <url> <dest>
```

Eventuelt kan også `GIT_CONFIG_GLOBAL` og `GIT_CONFIG_NOSYSTEM=1` brukes for å ignorere all
config hos læreren. Det er sterkere, men mister skolens proxy- og CA-oppsett (`http.proxy`,
`http.sslCAInfo`, `schannel` på Windows). Dette er en avveiing for Lars og tilsynet.

## l) Følger global `fetch` i utvidelsesverten proxy-innstillingene til VS Code?

**Svar: ja i nyere versjoner. Proxy-oppløseren til utvidelsesverten patcher `globalThis.fetch`.**

- Patchen styres av `http.fetchAdditionalSupport` (standard `true`, `restricted`). Den legger til
  proxy (`http.proxySupport`) og systemsertifikater (VS@0f33e82
  `src/vs/workbench/api/node/proxyResolver.ts` L76, L167–225; `src/vs/platform/request/common/request.ts`
  L408–412).
- `http.electronFetch` (standard `false`) bytter til Electrons `net.fetch`.
- Grad: **lest i kildekode.**
- Dokumentasjonen (https://code.visualstudio.com/docs/setup/network) er utdatert eller vag:
  «Extensions don't benefit yet from the same proxy support». Dokumentasjon og kode sier
  altså ulike ting. Grad for dokumentasjonen: **dokumentert, men motstridende.**
- Når patchen kom inn: ikke slått opp (**ukjent** for 1.100).

**Konsekvens:**
- Liten. Bruk global `fetch` som i CLI-et.
- Proxy-innstillingene er `restricted`, så et elevrepo eller en økt kan ikke styre dem.
- Bak skoleproxy: test i D8 hvis det er relevant.

## m) TreeView: lagres utvidingstilstanden nøklet på `TreeItem.id` i `state.vscdb`?

**Svar: nei, ikke av kjernen.**

- `vscode.d.ts`: «The id is used to preserve the selection and expansion state of the tree
  item» (VS@0f33e82 `src/vscode-dts/vscode.d.ts` L12307–12309).
- `src/vs/workbench/browser/parts/views/treeView.ts` og `viewPane.ts` bruker ikke
  `IStorageService` (0 treff på «storage»). Tilstanden holdes i minnet så lenge vinduet lever.
- Det som lagres per workspace, er synlighet og layout for view-er (for eksempel
  `viewPaneContainer.ts` L753). Det er ikke tre-elementer.
- Grad: **lest i kildekode.** Det er ikke dokumentert om tilstanden ikke persisteres.

**Konsekvens:**
- Delrisikoen «trevisningens tilstand» under R-V5 er lavere enn antatt.
- Ugjennomsiktige id-er (T11) beholdes likevel. Id-er og labels går over IPC, og fremtidige
  versjoner kan endre dette.
- Verifiser i D5 med `sqlite3` mot `state.vscdb` (globalt og workspace) etter bruk.

## n) Kan hovedvinduet lukke mappen i øktvinduet, eller vite om den er åpen?

**Svar: nei og nei. Det finnes ikke noe API for andre vinduer.**

- `vscode.window` eksponerer bare `state: WindowState` (`focused`, `active`) og
  `onDidChangeWindowState` for *eget* vindu (VS@0f33e82 `src/vscode-dts/vscode.d.ts`
  L11040–11050, L11217–11223). Det finnes ingen opplisting av vinduer.
- `workbench.action.closeFolder` og `closeWindow` gjelder vinduet der kommandoen kjøres
  (`workspaceActions.ts` L164–185). `vscode.openFolder` åpner bare i eget eller nytt vindu.
- Grad: **lest i kildekode.** Fraværet av API er ikke dokumentert eksplisitt.
- **Sletting fra hovedvinduet mens øktvinduet er åpent:**
  - På Linux og macOS går det, men vinduet ser da en tom eller forsvunnet mappe.
  - På Windows kan filovervåkeren eller andre håndtak gi `EBUSY`/`EPERM` på mappen. Funnet
    bare i forum og issues for andre verktøy (Cursor, rushstack). Ingen issue i microsoft/vscode
    er bekreftet. Grad: **kun issue/forum, ukjent for VS Code.**

**Konsekvens (berører Lars' beslutning 2026-10-29: «Ferdig» sletter fra hovedvinduet):**
- Hovedvinduet kan ikke lukke øktvinduet.
- Det som virker:
  1. «Ferdig» kjøres **i øktvinduet**. Den skriver ferdig-markøren, eventuelt med
     `storageUri`-forelder for opprydding i `workspaceStorage`, og kjører deretter
     `workbench.action.closeWindow` eller `closeFolder`.
  2. Hovedvinduet overvåker markøren (`FileSystemWatcher` eller polling) og sletter så snart
     markøren finnes og hjerteslaget har stoppet. Det skjer «med en gang» i praksis, men
     startes fra øktvinduet.
- Alternativet er en «Ferdig» i hovedvinduet som sletter mens øktvinduet er åpent. Det gir
  dårlig UX og en ukjent risiko på Windows.
- **Dette må Lars bekrefte** (se åpne spørsmål).

---

## Endringer i planen som følger av funnene

1. **T9b/T9d:** Signalet er `workspace.isTrusted` i øktvinduet. Det fanger arvet tillit, trust
   slått av og `--disable-workspace-trust`. Å lese innstillingen i hovedvinduet før åpning er
   bare en tidlig advarsel.
2. **T9c:** Advarselen nevner trust-dialogen fra tasks, debug og terminal, ikke bare banneret.
   Den nevner også KI-agenter og `AGENTS.md` i elevrepoer.
3. **Åpning av økten:**
   `vscode.openFolder(uri, { forceNewWindow: true, noRecentEntry: true })`. Ved opprydding
   kalles `vscode.removeFromRecentlyOpened(uri)` i tillegg, som sikkerhetsnett.
4. **Øktmappens `.vscode/`:** Bare `settings.json` med `"workbench.localHistory.enabled": false`.
   Aldri `extensions.json`, `tasks.json`, `launch.json` eller `mcp.json`. T11-tiltaket om
   Local History kan beholdes, fordi mekanismen er verifisert.
5. **`workspaceStorage/<id>/`:** Den ryddes ikke av VS Code. Enten lagres stien i
   ferdig-markøren og slettes av hovedvinduet (må testes), eller så dokumenteres den i README og
   under R-V5.
6. **Hot exit og `Backups/`:** Dokumenteres i README og under R-V5. Kan ikke slås av fra
   øktmappen.
7. **R-V7:** Endres fra «klartekst» til «tokenet bare i minnet, eller svak obfuskering hvis
   læreren velger det». Oppsettet forklarer et token som har forsvunnet.
8. **T18:** Sanert miljø og utvidede `-c`-flagg (se k). `GIT_TERMINAL_PROMPT=0` og
   `credential.helper=` er ikke nok alene.
9. **`findGit()`:** Speiler git-utvidelsen, med `xcode-select`-sjekk på macOS og stier under
   Program Files på Windows.
10. **Bygg:** esbuild med CJS-bundle og `engines.vscode: ^1.100.0`. Ikke `"type": "module"` i
    `vscode/package.json`, eller bruk `.cjs` som utdata.
11. **Aktivering:** `workspaceContains:<markørfil>` sammen med `onStartupFinished`. Markøren
    skrives før `closeFolder`/`closeWindow`.
12. **«Ferdig»:** Kjøres i øktvinduet. Hovedvinduet sletter når markøren finnes (avventer Lars).
13. **Tester:** To testkjøringer, med `--disable-workspace-trust` og med egen `--user-data-dir`
    uten tillit, pluss `--disable-extensions`. Actions pinnes til SHA (T19).

## Forslag til oppføringer i DECISIONS.md

- **«2026-10-29 — Øktvindu: `openFolder` med `noRecentEntry`, `isTrusted` som tillitssignal»**
  - Beslutning: plan-punkt 1, 3 og 11.
  - Begrunnelse: b, e og g.
  - Forkastet:
    - Proposed API `isResourceTrusted` (bare Insiders).
    - `forceTempProfile`: midlertidig profil uten våre utvidelser, så hjerteslaget stopper. Ikke
      testet.
- **«2026-10-29 — `.vscode/settings.json` i øktmappen slår av Local History»**
  - Beslutning: plan-punkt 4.
  - Begrunnelse: e og f. Scope `RESOURCE`, ikke `restricted`, og bare rot-`.vscode/` leses.
- **«2026-10-29 — Git i utvidelsen: sanert miljø, ingen credential-hjelpere, bare https»**
  - Beslutning: plan-punkt 8 og 9.
  - Begrunnelse: j og k.
  - Kobling: Hvis Lars vil, kan CLI-et få samme behandling i D1 (delt `cloneRepoAsync`).
- **«2026-10-29 — Build-steg for `vscode/`: esbuild til CJS, `engines.vscode ^1.100.0`»**
  - Avvik fra «ingen build-steg», som allerede er godkjent.
  - Begrunnelse: h.
- **«2026-10-29 — «Ferdig» i øktvinduet, sletting i hovedvinduet»**
  - Beslutning: plan-punkt 12.
  - Begrunnelse: n.
  - Føres inn bare etter at Lars har bekreftet.

## Må prøves i praksis (D2–D4, noe i D5 og D8)

**D2 (skjelett og testoppsett):**
- `limited`-utvidelsen aktiveres med `workspaceContains:` i en ny `--user-data-dir` uten
  tillit, på Linux og i Actions på alle tre OS.
- Reload Window og overgang fra betrodd til ikke betrodd gir ny aktivering. Overgang fra ikke
  betrodd til betrodd gir ingen omstart.
- En CJS-bundle lastes i den laveste valgte `engines`-versjonen (`version: '1.100.0'` i
  `.vscode-test`).

**D3 (oppsett og token):**
- SecretStorage på Linux uten keyring (for eksempel `--password-store=gnome-libsecret` uten
  daemon): Lagring i minnet, dialogen og hva som skjer etter omstart.
- Tokenet er utilgjengelig i øktvinduet når lagringen er i minnet (er det et problem?).
- **Gjort i D3, se «D3-funn» nederst.**

**D4 (økter og sletting):**
- Negativ T8/T9a-test: Et elevrepo med `.vscode/settings.json`, `tasks.json`
  (`runOn: folderOpen`), `launch.json`, `extensions.json` og `mcp.json` i `<økt>/<eier>_<repo>/`
  har ingen effekt, verken uten tillit eller med tillit.
- `localHistory`: Lagre en fil i et elevrepo. Ingen ny oppføring under `User/History/`.
- `noRecentEntry`: Økten står ikke i «Åpne nylig». `removeFromRecentlyOpened` virker.
- `workspaceStorage/<id>`: Kan stien hentes fra `storageUri` og slettes av hovedvinduet etter
  at vinduet er lukket? Er `state.vscdb` låst før det?
- «Ferdig»: markøren, deretter `closeWindow`. Hovedvinduet ser markøren og sletter. Kappløp
  ved hvilemodus (B2).
- Arvet tillit: Gi tillit til `~/canvas-clone`, åpne en økt og sjekk at T9d-modalen vises.
- Git-miljøet: `code` startet fra en VS Code-terminal. Sjekk om `GIT_ASKPASS` finnes i
  `process.env` til utvidelsesverten. Klon et privat repo og et repo med en `insteadOf`-regel
  til SSH. Begge skal ende under «uten tilgang» uten dialog.

**D5:** Sjekk med `sqlite3` at verken global eller workspace `state.vscdb` inneholder
elevnavn, id-er eller `TreeItem`-labels etter bruk.

**D8 (Windows og macOS):**
- `findGit` uten git i PATH og med Program Files-stier.
- macOS uten Command Line Tools: ingen installasjonsdialog.
- Sletting av en økt som er åpen i et annet vindu på Windows (`EBUSY`).
- GCM og osxkeychain blir ikke kalt.

## D3-funn (2026-10-29): SecretStorage i praksis, VS Code 1.100.0 på Linux

Forsøk med en egen prøveutvidelse (bare i scratch, ikke i repoet) under `xvfb-run`, med
`DBUS_SESSION_BUS_ADDRESS` pekt mot en sokkel som ikke finnes (ingen nøkkelring tilgjengelig),
`--log=trace`, egen `--user-data-dir` og egen `HOME`. Utfallet er lest i VS Codes trace-logg
(`[SecretStorageService]`, `[EncryptionMainService]`) og i hva prøveutvidelsen leste tilbake.

| Oppstart | Lagring | Varsel fra VS Code | `secrets.store()` | Etter omstart |
|---|---|---|---|---|
| `--password-store=basic` | `persisted` (obfuskering) | ingen | løses med en gang | tokenet finnes |
| `--password-store=gnome-libsecret`, ingen D-Bus | `in-memory` | ikke-modalt varsel ved første `set` | løses med en gang | tokenet er borte, `globalState` er der |
| ingen flagg, ingen skrivebordsmiljø (Chromium velger `basic_text`) | `in-memory` | **modal dialog** «An OS keyring couldn't be identified …» med «Use weaker encryption» | **venter til dialogen er besvart** | (ikke målt, dialogen ble ikke besvart) |
| `--use-inmemory-secretstorage` | `in-memory` | ingen | løses med en gang | – |

Grad: **testet** (de to første radene også over en ekte omstart, uten testkjøreren).

Andre funn:
- **Testkjøringer lagrer aldri noe på disk.** Når `--extensionTestsPath` er satt, bruker VS Code
  lagring i minnet for all tilstand (`useInMemoryStorage: !!extensionTestsLocationURI` i
  `main.js`). Omstart kan derfor ikke testes med `@vscode/test-cli`; forsøket over brukte en
  vanlig oppstart med `--extensionDevelopmentPath` og `workbench.action.quit`.
- **`~/.vscode/argv.json` leses også av test-VS Code**, uansett `--user-data-dir`. Står
  `"password-store": "basic"` der, vinner den over `--password-store` på kommandolinja (den
  legges til etterpå; observert med `--password-store=gnome-libsecret`). Lars' egen maskin har
  dette, så test-VS Code her startet til nå med `basic` (D2-testene brukte ikke SecretStorage).
  Røyktestene startes derfor med `--use-inmemory-secretstorage` (`.vscode-test.mjs` og
  `scripts/kjor-uten-tillit.mjs`): ingen nøkkelring, ingen `basic`-lagring, ingen dialog.
  Det trengs også i CI, der Ubuntu uten skrivebord ellers ville gitt den modale dialogen
  (som testkjøreren avviser).
- **Varselet vises bare ved `set`**, ikke ved `get`. Utvidelsen må selv forklare et token som
  har forsvunnet (flagg i `globalState`, se `DECISIONS.md` 2026-10-29 D3).
- **Øktvinduet (D0-spørsmålet):** Uten nøkkelring finnes tokenet bare i vinduet der det ble lagt
  inn, så øktvinduet har det ikke. Det er ikke et problem så lenge alle Canvas-kall skjer i
  hovedvinduet (bla og klone, D0 j). D6 (karakterpanelet) må enten ligge i hovedvinduet eller
  godta at det ikke virker uten nøkkelring. Utvidelsen varsler ikke om manglende token i
  øktvinduet. Per vindu er fortsatt **avledet fra kildekode**, ikke testet med to vinduer.

## D4-funn (2026-10-29): økter, «Ferdig» og sletting i praksis, VS Code 1.100.0 på Linux

**Oppsett for prøvekjøringene (bare scratch, ikke i repoet):** VS Code 1.100.0 fra
`vscode/.vscode-test/` startet direkte under `xvfb-run` med egen `--user-data-dir`, egen
`--extensions-dir` og eget `HOME` (så `~/canvas-clone/vscode` og `~/.vscode/argv.json` var
scratch). Utvidelsen ble installert fra `.vsix`, sammen med en liten prøvedriver-utvidelse som
lager en økt med `canvasClone._nyOkt`, legger inn et falskt elevrepo med alle fem
`.vscode`-filene (task med `runOn: folderOpen` og MCP-server som begge ville skrevet en fil),
åpner økten med `canvasClone._apneOkt` (T9c-flagget forhåndssatt i prøveprofilen), og i
øktvinduet lagrer filer og kjører «Ferdig». Ingen ekte elevdata. Prøvekjøringene bruker
**ikke** testkjøreren, fordi den holder all tilstand i minnet (D3-funn), og fordi to vinduer
trengs.

**Automatisert vs. prøvd for hånd vs. ikke prøvd:**

| Punkt (D0, «Må prøves i praksis», D4 og utsatt D2) | Automatisert (xvfb, `npm test`/`test:uten-tillit`) | Prøvd for hånd (to ekte vinduer) | Resultat |
|---|---|---|---|
| Negativ T8/T9a: `.vscode/*` i `<økt>/<repo>/` | Ja, betrodd og uten tillit: `settings.json` (tabSize, localHistory, egen nøkkel), `launch.json`, `tasks.json` (`fetchTasks`, bare betrodd: henger i Restricted Mode), ingen task-/MCP-kjøring | Ja, uten tillit og med arvet tillit: tabSize 4, localHistory `false`, ingen task-/MCP-kjøring | Ingen effekt. `extensions.json` og `mcp.json` er bare sjekket indirekte (ingen anbefaling i konfig, MCP-serveren startet ikke; MCP-servere startes uansett ikke av seg selv i 1.100) |
| `localHistory` | Innstillingen leses som `false` for elevfiler | Ja: lagring i øktvinduet (elevfil, og en fil utenfor økten) gir ingen oppføring i `User/History/`; positiv kontroll: lagring i hovedvinduet gir oppføring | Virker. NB: i et øktvindu gjelder øktens `settings.json` som workspace-innstilling for *alle* filer, også filer utenfor økten |
| `noRecentEntry` / `removeFromRecentlyOpened` | Argumentene til `openFolder` og kallet til `removeFromRecentlyOpened` (stubbet) | Ja: `history.recentlyOpenedPathsList` i `state.vscdb` har bare hovedmappen etter flere økter | Økten havner aldri i «Åpne nylig». Effekten av `removeFromRecentlyOpened` er ikke målt separat (det var ingenting å fjerne) |
| `workspaceStorage/<id>/` | Vakten (id-navn, direkte under roten, `workspace.json` peker på økten, ikke symlenke) | Ja: `storageUri` gir riktig `<id>`; mappen (med `state.vscdb`, `workspace.json`) slettes ca. 7 s etter «Ferdig» og dukker ikke opp igjen når VS Code avsluttes | Virker på Linux. Lås på Windows er ikke prøvd (D8) |
| «Ferdig» → markør → `closeWindow` → hovedvinduet sletter | Ja (stubbet `closeWindow`), inkl. gjenoppliving når vinduet ikke lukkes, og T11c | Ja: utvidelsesverten i øktvinduet avsluttes ca. 10 ms etter «Ferdig»; hovedvinduet ser markøren og sletter økten 7,0 s etterpå (FERDIG_VENT 6 s + tikk) | Virker. **Feil funnet og rettet:** hovedvinduet slo hjerteslag i 60 s for økter det selv hadde laget, også etter «Ferdig», så markøren ble opphevet og økten ble liggende. Nå slippes holdet ved åpning og ved ferdig-markør (regresjonstest i `okter.vsctest.js`) |
| Reload Window (utsatt fra D2) | Nei | Ja: utvidelsesverten startes på nytt, økten gjenopptas (`gjenopptatt: true`) og hjerteslaget fortsetter | Virker |
| Tillitsoverganger (utsatt fra D2) | T9d-logikken (modal, «Lukk økten» som første valg, «Fortsett likevel») kalt direkte | Nei. Ikke betrodd → betrodd og omvendt krever at noen trykker i UI-et | **Ikke prøvd i praksis.** Fra kildekoden (g): ingen omstart ved tillit gitt (`onDidGrantWorkspaceTrust` → T9d), omstart ved tillit fjernet (som Reload, som er prøvd) |
| Arvet tillit | `isTrusted` i testkjøreren (`--disable-workspace-trust`) gir T9d ved oppstart | Ja: `~/canvas-clone` lagt inn som betrodd i `content.trust.model.key` før start → øktvinduet har `isTrusted: true`, T9d-advarselen vises, «Ferdig» virker mens modalen står åpen | Virker |
| `GIT_ASKPASS` m.m. i utvidelsesvertens miljø | Nei | Ja, simulert: VS Code startet med `GIT_ASKPASS`, `SSH_ASKPASS`, `VSCODE_GIT_IPC_HANDLE`, `VSCODE_GIT_ASKPASS_*`, `GIT_SSH_COMMAND` og en global git-config med `insteadOf` til SSH. Variablene **finnes** i utvidelsesverten (arvet). `cloneRepoAsync` der: ukjent/privat repo → `no_access`; offentlig repo (`octocat/Hello-World`) → klonet over https; askpass og ssh ble aldri kalt | T18 holder. Ikke prøvd: `code` startet fra en ekte VS Code-terminal (miljøet er simulert) |
| Hvilemodus (B2) | Regelen (`vurderOkt`, `tikk`) med node-tester, inkl. at «får fortsette» og «slettes» aldri slår til samtidig | Ja, simulert: alle prosessene i VS Code-instansen fikk SIGSTOP i 210 s (> UTLOPT 180 s), så SIGCONT. Hovedvinduet slettet ikke økten; øktvinduet slo igjen innen 5 s og fortsatte. Økten ble slettet først etter «Ferdig» (7,0 s etter markøren) | Virker i simuleringen. Ekte hvilemodus (der klokke og tidtakere kan oppføre seg annerledes) er ikke prøvd |
| Gjenopprettede vinduer etter omstart («lukkes VS Code, er økten slutt») | `kanGjenopptas` med node-tester | Ja: VS Code avsluttet med øktvinduet åpent, startet igjen etter 80 s uten argumenter. VS Code gjenopprettet øktvinduet; utvidelsen ble aktivert der og lukket vinduet ca. 35 ms senere uten å slå. Hovedvinduet merket økten «aktiv» til hjerteslaget var 180 s gammelt, og slettet den da (ca. 100 s etter omstarten) | Virker. I første prøvekjøring ble `workspaceStorage/<id>/` for økten liggende, fordi den ikke ble avsluttet med «Ferdig»; etter rettingen (skanning av `workspaceStorage`, se DECISIONS D4) slettes den også her. Omstart innen 60 s (f.eks. «Restart to Update») lar økten fortsette; ikke prøvd |

**Ny kjøring etter rettingsrunden (2026-10-29, `node scripts/provekjoring.mjs`):** alle fem
scenarioene grønne, 38/38 sjekker. `ferdig` og `arvet`: slettet 7,0 s etter «Ferdig». `kryss`:
slettet etter 186 s. `omstart`: slettet 87 s etter ny start, og det gjenopprettede vinduet slo
ikke. `sovn`: SIGSTOP på 12 prosesser i 210 s, økten fortsatte. I alle scenarioene peker ingen
`workspaceStorage` på en økt etterpå. To feil i selve riggen ble rettet underveis: kontrollfilene
for Local History ble åpnet før de fantes, og et manglende resultat krasjet sjekken i stedet for
å gi FEIL. NB: krasjer riggen, kan VS Code-instansen dens bli stående, og neste kjøring sender da
alt til den gamle instansen. Se etter `provekjoring/userdata` i prosesslista før ny kjøring.

**Andre funn:**
- **Testkjøreren og Workspace Trust-innstillingen:** å endre `security.workspace.trust.enabled` fra en
  test får VS Code til å avslutte (omstart kreves). T9b testes derfor med stubbet lesing av
  innstillingen.
- **`tasks.fetchTasks()` henger i Restricted Mode** (venter på tillit), så task-listen sjekkes
  bare i den betrodde kjøringen.
- **Et øktvindu med en modal åpen (T9d)** kan fortsatt kjøre «Ferdig» og lukkes med
  `closeWindow`.
