# Archive Assist

**Innholdsbasert saksdokumenttittel og metadatahjelp for arkivfiler**

[Åpne den publiserte demoen](https://rolfss.github.io/Click-here-for-newest-projects/archive-assist/)

Archive Assist hjelper saksbehandlere og arkivarer med å foreslå, kontrollere og eksportere metadata for dokumenter. Filinnlasting, tekstuttrekk, kontrollsummer og første metadataforslag behandles lokalt i nettleseren. Valgfri AI-forbedring bruker **GPT-5.6 Luna med reasoning effort `medium`** via en ekstern backend og OpenAI.

## Prøv, kontroller, eksporter

1. **Prøv:** Velg filer, dra dem inn, bruk «Prøv tre eksempler» eller lim inn dokumenttekst. Innlimt tekst behandles som en TXT-fil gjennom samme lokale analyseflyt. Tom tekst gir ingen fil.
2. **Kontroller:** Velg dokumentet i listen og sammenlign tittelforslag, dato og øvrige metadata med kildeuttrekket. Rett feil og godkjenn tittelen. Felles metadata og avanserte felt kan åpnes ved behov. En utfyllingsprosent viser hvor mye som er fylt inn, ikke at opplysningene er riktige.
3. **Eksporter:** Last ned JSON, CSV, kontrollrapport eller ZIP med originaldokumenter og JSON-sidecars. Eksporten viser også mangler og kontrollstatus. De opprinnelige dokumentbytene endres ikke.

Arbeidsflaten har en varm, lys bakgrunn, mørkegrønne kontraster og tydelige steg. Kildeuttrekk og forslag vises ved siden av hverandre på brede skjermer og stables på mindre skjermer. Uttrekket er lesbar tekst og kan mangle layout; kontroller originalfilen ved tvil. Norske tegn, tabeller og listepunkter har egne syntetiske regresjonstester.

## Saksdokumenttittel og dato

Motoren prioriterer oppgitt emne eller sak, uttrykkelig tittel, dokumentets emnefelt, første tydelige overskrift og første meningsbærende setning. Filnavnet brukes som reserve når innholdet ikke gir et brukbart forslag. Metode, begrunnelse, sikkerhet, promptversjon og menneskelig kontrollstatus følger eksporten.

Dokumentdato hentes først fra et uttrykkelig datofelt i innholdet, deretter fra en gjenkjennelig dato i filnavnet. Mangler kildegrunnlaget, forblir datoen tom og må avklares manuelt. Filens sist endret-dato og importdato brukes ikke som dokumentdato. Frister og nettsiders oppdateringsdato skal ikke forveksles med dokumentdato.

En tittel som er godkjent eller redigert av et menneske, overskrives ikke av et senere AI-forslag. Felt som endres mens et AI-kall pågår, beskyttes også mot det forsinkede svaret. Se den versjonerte [prompten for saksdokumenttittel](./TITTELPROMPT.md).

## Valgfri Luna-forbedring og dataflyt

Oppstart og import starter ingen AI-analyse eller tilgjengelighetssjekk mot Luna. Når brukeren åpner «Valgfri AI-forbedring», sjekker appen tjenestens tilgjengelighet. Denne sjekken sender ikke dokumenttekst.

Først når brukeren trykker på en knapp for Luna-forbedring, lastes Cloudflare Turnstile ved behov, og appen sender inntil **12 000 tegn per dokument**, filnavnet og et utvalg metadata via `noark-luna-api` til OpenAI. Metadatautvalget er tittel/tittelforslag, dokumenttype, emne, dokumentdato, ansvarlig/forfatter, organisasjonsenhet, språk og uttrekksmetode. Originalfilen sendes ikke som binærfil. «Forbedre alle» kan sende ett slikt kall for hvert dokument med lesbart innhold.

Klienten forventer modellen `gpt-5.6-luna`, reasoning `medium` og et strukturert analysesvar. API-nøkkelen håndteres av backenden, ikke av nettleseren. Denne dokumentasjonen beskriver klientens dataflyt; den gir ingen garanti om lagringstid, logging eller øvrige behandlingsvilkår hos backendleverandører. Bruk syntetiske dokumenter i den offentlige demoen. Lokal analyse, kontroll og eksport virker også når Luna er utilgjengelig.

## Formater og funksjoner

- Inntil 50 filer; 100 MiB per fil og 300 MiB samlet. Lokal innholdsanalyse har en egen grense på 25 MiB per fil.
- Tekst, Markdown, CSV, JSON, XML, HTML, EML, PDF, DOCX, PPTX, XLSX, ODT, ODS og ODP. PDF-leseren er grunnleggende og utfører ikke OCR.
- UTF-8 med Windows-1252 som reserve ved ugyldig UTF-8; dette gir et varsel om å kontrollere tegnsettet.
- Forslag til tittel, dato, dokumenttype, språk, beskrivelse, emne, ansvarlig/forfatter, organisasjonsenhet og nøkkelord når det finnes grunnlag.
- Felles metadata for ansvar, klassifikasjon, tilgang og livsløp, samt kontroll av obligatoriske felt og menneskelig tittelgjennomgang.
- SHA-256, duplikatindikasjon og signaler om mulige personopplysninger. Signalene er ikke juridisk klassifisering.
- JSON-/CSV-manifest, ZIP med originaler og sidecars, og kontrollrapport i Markdown.

## Kjør og bygg lokalt

Bruk Node.js 22 eller nyere. Fra prosjektmappen:

```bash
cd archive-assist
npm ci
npm test
npm run build
npm run preview
```

Åpne `http://127.0.0.1:5197/`. `npm run build` kjører syntakskontroll og lager `dist/` med en avgrenset liste statiske klientfiler. Testdata og utviklingsavhengigheter inngår ikke i bygget. `npm run preview` serverer dette bygget bare på localhost. Sett `PORT` dersom en annen port er nødvendig. `npm run check` kan kjøres separat.

Appen bruker JavaScript-moduler og skal åpnes via HTTP, ikke direkte som `file://`.

## Nettlesertesting

Etter installasjon og bygg kan Playwright bruke sin Chromium:

```bash
npx playwright install chromium
npm run test:browser
```

Alternativt kan en installert Edge brukes. Eksempel i PowerShell:

```powershell
$env:ARCHIVE_ASSIST_CHROME = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

Nettlesertesten starter en lokal server, bruker syntetiske dokumenter og erstatter eksterne nettverkskall med kontrollerte testsvar. Den utfører ingen reelle eller betalte modellkall. Den kontrollerer blant annet import, redigering, eksport, responsiv visning og at AI krever eksplisitt handling. Resultater og skjermbilder skrives til `qa-output/`, eller mappen angitt med `ARCHIVE_ASSIST_QA_DIR`.

## Avgrensning

Archive Assist er Noark-inspirert, men hevder ikke Noark-samsvar og er ikke et sak-/arkivsystem. Tittelforslag, tekstuttrekk og personopplysningssignaler kan være feil. Avsender i et dokument er heller ikke nødvendigvis dokumentansvarlig eller forfatter. Tilgang, hjemmel, arkivverdi og bevaring/kassasjon må kontrolleres av mennesker.

En produksjonsversjon krever blant annet en virksomhetstilpasset metadataprofil, autentisering, serverbasert autorisasjon, godkjent behandling av dokumentinnhold, hendelseslogg og konkrete import-/API-integrasjoner.

Se [ARKITEKTUR.md](./ARKITEKTUR.md), [PROSJEKTGRUNNLAG.md](./PROSJEKTGRUNNLAG.md), [TITTELPROMPT.md](./TITTELPROMPT.md) og [SECURITY.md](./SECURITY.md).

## Lisens

MIT.
