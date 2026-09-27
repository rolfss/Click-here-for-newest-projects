# Archive Assist

**Prøv → kontroller → eksporter: innholdsbaserte saksdokumenttitler og metadata.**

[Åpne den offentlige prototypen](https://rolfss.github.io/Click-here-for-newest-projects/archive-assist/)

Archive Assist hjelper saksbehandlere og arkivarer med å foreslå, kontrollere og eksportere metadata. Import, tekstuttrekk, SHA-256 og første forslag skjer i nettleseren. Denne utgavens statiske prototype har ingen kontotilkobling og viser AI som utilgjengelig. Lokal kjøring kan koble **GPT-6 Luna med reasoning `medium`** til en innlogget ChatGPT-konto gjennom Codex App Server. Modellen kjører i skyen.

Dokumentasjonen gjelder koden i denne utgaven. Den publiserte demoen kan ligge etter inntil endringene er slått sammen og publisert.

## Arbeidsflyt og formål

1. **Prøv:** Velg filer, dra dem inn, bruk syntetiske eksempler eller lim inn dokumenttekst. Innlimt tekst blir en TXT-fil i samme arbeidsflyt.
2. **Kontroller:** Sammenlign forslag og grunnleggende metadata med kildeuttrekket, rett feil og godkjenn tittelen. Uttrekket kan mangle layout; kontroller originalen ved tvil. Utfyllingsprosent måler utfylte felt, ikke riktighet.
3. **Eksporter:** Last ned JSON, CSV, kontrollrapport eller ZIP med originaler og metadata-sidecars. Metode, begrunnelse, sikkerhet, promptversjon og kontrollstatus følger resultatet. Originalbytene endres ikke.

Målet er en nedlastbar, lokalt installert app som kan bruke **brukergodkjent** opplysning om bruker, avdeling og arbeidsmiljø sammen med arkivfaglig praksis. Dagens prototype leser ikke slik kontekst automatisk. Du kan oppgi den manuelt i det valgfrie AI-panelet. Dokumentbehandleren er aldri automatisk dokumentets forfatter; opphav og overordnet sak må kontrolleres mot kilden.

## Kjør lokalt med ChatGPT-konto

Bruk Node.js 22 eller nyere og en installert Codex som støtter App Server. Fra prosjektmappen:

```bash
cd archive-assist
npm ci
npm run local
```

Åpne `http://127.0.0.1:5197/`. Kommandoen bygger klienten og starter `scripts/local-server.mjs`, som tilbyr statiske filer og et lokalt API fra samme adresse. Codex finnes via `PATH` eller den offisielle Windows-installasjonen. Du kan også sette en absolutt bane i PowerShell før oppstart:

```powershell
$env:ARCHIVE_ASSIST_CODEX = 'C:\full\bane\til\codex.exe'
npm run local
```

Hvis Codex ikke allerede er innlogget med ChatGPT, kjør `codex login` og fullfør den offisielle innloggingen. Med eksplisitt bane kan du bruke `& $env:ARCHIVE_ASSIST_CODEX login`. Archive Assist ber ikke om passord, kontotoken eller API-nøkkel i nettsiden. [Codex-autentisering](https://learn.chatgpt.com/docs/auth) skiller ChatGPT-abonnement fra API-basert bruk; denne appen krever ChatGPT. Modellen må være tilgjengelig på kontoen, og analyse belaster abonnementets brukskvote.

Åpne «Valgfri AI-forbedring» for å sjekke tilkoblingen. Oppstart og import starter ingen AI-analyse. Tilgjengelighetssjekken sender ikke dokumenttekst. AI forblir avslått hvis riktig konto, modell eller sikker kjørekonfigurasjon mangler; appen går ikke over til API-nøkkel, betalt Worker eller en annen modell.

For bare den statiske klienten: kjør `npm run build` og `npm run preview`. Denne forhåndsvisningen har ikke AI-kobling. Sett `PORT` for en annen lokal port. Bruk HTTP, ikke `file://`.

## Hva en eksplisitt AI-handling sender

Luna-knappen sender inntil **12 000 tegn dokumenttekst**, filnavn og utvalgte metadata gjennom det lokale API-et til Codex og skymodellen. Utvalget er tittel/tittelforslag, dokumenttype, emne, dokumentdato, forfatter, organisasjonsenhet, språk, uttrekksmetode, saksreferanse, overordnet sammenheng og kilde. Originalfilens binærdata sendes ikke.

Bare konteksten du fyller inn, legges til: dokumentbehandler (120 tegn), avdeling (160 tegn) og overordnet sak/arbeidskontekst (600 tegn). Feltene lagres ikke i `localStorage`. «Forbedre alle» kan sende ett slikt kall per dokument med lesbar tekst. Godkjente eller menneskeredigerte titler og felt endret mens svaret er underveis, beskyttes mot overskriving.

## Formater og avgrensning

- Inntil 50 filer, 100 MiB per fil og 300 MiB samlet. Innholdsuttrekk har en egen grense på 25 MiB per fil.
- Tekst, Markdown, CSV, JSON, XML, HTML, EML, PDF, DOCX, PPTX, XLSX, ODT, ODS og ODP. PDF-leseren er grunnleggende og utfører ikke OCR.
- UTF-8 med varslet Windows-1252-reserve, SHA-256, duplikatindikasjon og signaler om mulige personopplysninger.
- Dokumentdato fra uttrykkelig datofelt før datert filnavn. Manglende dato blir tom; teknisk opprettelsesdato, filstempel og importtid blir ikke dokumentdato.
- Forslag til tittel, dato, type, beskrivelse, emne, forfatter, avdeling, nøkkelord og eventuell overordnet sammenheng (`relation`).

Archive Assist er Noark-inspirert, ikke et godkjent sak-/arkivsystem. Forslag og uttrekk kan være feil. Tilgang, hjemmel, arkivverdi og bevaring/kassasjon må vurderes av mennesker. Bruk syntetiske dokumenter ved utprøving; virksomhetsbruk krever godkjent behandling og en tilpasset metadataprofil.

## Verifisering

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Node- og nettlesertestene bruker syntetiske data og kontrollerte mock-svar; de starter ingen reell modellanalyse. Nettlesertesten kan bruke en installert nettleser gjennom `ARCHIVE_ASSIST_CHROME`. Resultater skrives til `qa-output/` eller `ARCHIVE_ASSIST_QA_DIR`. En eventuell levende kontroll er et separat, uttrykkelig valg med syntetiske data og ChatGPT-kontoens brukskvote.

Se [arkitektur](./ARKITEKTUR.md), [prosjektgrunnlag](./PROSJEKTGRUNNLAG.md), [versjonert prompt](./TITTELPROMPT.md) og [sikkerhet](./SECURITY.md). Integrasjonen følger [Codex App Server](https://learn.chatgpt.com/docs/app-server); [modellbeskrivelsen for GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) dokumenterer støtten for `medium`.

MIT-lisens.
