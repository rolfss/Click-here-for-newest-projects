# Archive Assist

**Innholdsbasert saksdokumenttittel og metadatahjelp for arkivfiler**

[Åpne den publiserte demoen](https://rolfss.github.io/Click-here-for-newest-projects/archive-assist/)

Archive Assist leser dokumentinnhold lokalt, foreslår saksdokumenttittel og øvrige metadata, og lar saksbehandler eller arkivar kontrollere resultatet før videre overføring eller registrering. Brukeren kan i tillegg velge forbedring med **GPT-6 Luna** og **reasoning effort `medium`** via den samme sikre API-bakenden som Noark-assistenten.

## Saksdokumenttittel

Tittelen kommer ikke lenger bare fra filnavnet. Ved innlasting prioriterer motoren:

1. oppgitt emne eller sak;
2. uttrykkelig tittel i dokumentet;
3. emnefelt i dokumentet eller e-posten;
4. første tydelige overskrift;
5. første meningsbærende setning;
6. filnavnet som reserve.

Forslaget settes direkte i det redigerbare tittelfeltet. Brukeren ser metode, begrunnelse, sikkerhet og kontrollstatus, og kan godkjenne forslaget eller skrive en annen tittel. En menneskeredigert tittel blir ikke overskrevet av en senere Luna-analyse.

Den deterministiske innholdsanalysen virker uten API. Luna er valgfri og bruker OpenAI Responses API gjennom Cloudflare Worker-backenden. Modellen er fastsatt til `gpt-6-luna`, `reasoning.effort` er `medium`, `store` er `false`, og svaret må følge et strengt JSON-skjema. Bare et begrenset tekstutdrag (maks 12 000 tegn), filnavn og en tillatt delmengde metadata sendes når brukeren eksplisitt velger Luna. Selve binærfilen sendes ikke.

Se den versjonerte [prompten for saksdokumenttittel](./TITTELPROMPT.md).

## Dette virker i demoen

- Dra inn inntil 50 filer.
- Lokal tekstuttrekking fra tekst, Markdown, CSV, JSON, XML, HTML, EML, PDF, DOCX, PPTX, XLSX, ODT, ODS og ODP.
- Automatisk lokalt, innholdsbasert forslag til saksdokumenttittel ved innlasting.
- Valgfri forbedring av metadata med GPT-6 Luna og medium reasoning.
- Forslag til dokumentdato, dokumenttype, språk, beskrivelse, emne, forfatter, organisasjonsenhet og nøkkelord når grunnlaget finnes.
- Felles metadata for forfatter, organisasjonsenhet, sak, klassifikasjon, tilgang og livsløp.
- Kontroll av obligatoriske felt, betingede krav og menneskelig tittelgjennomgang.
- Indikasjon på mulige e-postadresser, telefonnumre, fødselsnumre og sensitive nøkkelord.
- SHA-256 og duplikatindikasjon.
- Normaliserte filnavn basert på kontrollert saksdokumenttittel.
- Eksport av JSON-manifest, CSV-manifest og ZIP-pakke med dokumenter og JSON-sidecars.
- Kontrollrapport i Markdown med overføringsstatus, tittelgjennomgang, obligatoriske mangler, duplikater og SHA-256.
- Tre syntetiske eksempelfiler for rask testing.
- Automatiske tester av tittelregler, promptformat, innholdsuttrekk, metadata, ZIP-bygger og Luna-kontrakten.

## Personvern og sikkerhet

Filinnlasting, tekstuttrekk, hashing og de første metadataforslagene skjer lokalt i nettleseren. Luna kjøres ikke automatisk når en fil legges til. Når brukeren velger Luna, sendes et avgrenset tekstutdrag og relevante metadata via `noark-luna-api`-Workeren til OpenAI. API-nøkkelen finnes bare som Worker-hemmelighet og eksponeres ikke i nettleseren.

Luna-kallet er beskyttet med Cloudflare Turnstile, bruker den eksisterende felles kostnads- og rate-limit-ledgeren, lagrer ikke OpenAI-responsen (`store: false`) og sender ikke tilgangshjemmel, klassifikasjon eller bevarings-/kassasjonsvedtak som AI skal finne på. Dokumentinnhold behandles som ubetrodd data i prompten.

Bruk likevel ikke demoen som eneste kontroll for reelle personopplysninger, tilgangsvurdering, journalføring, arkivverdi eller bevaring og kassasjon. Skannede PDF-er krever OCR og kan derfor gi et lokalt tittelforslag basert på filnavn og tilgjengelige metadata.

## Kjør lokalt

```bash
cd archive-assist
python -m http.server 8080
```

Åpne `http://localhost:8080`.

Tester:

```bash
npm test
npm run check
```

Node.js 22 anbefales.

## Avgrensning

Archive Assist er Noark-inspirert, men hevder ikke Noark-samsvar og er ikke et sak-/arkivsystem. En produksjonsversjon måtte i tillegg ha virksomhetsspesifikk metadataprofil, autentisering, serverbasert autorisasjon, uforanderlig hendelseslogg, godkjent behandlingsgrunnlag for dokumenter som sendes til en ekstern modell og konkrete import-/API-integrasjoner.

Se [ARKITEKTUR.md](./ARKITEKTUR.md), [PROSJEKTGRUNNLAG.md](./PROSJEKTGRUNNLAG.md), [TITTELPROMPT.md](./TITTELPROMPT.md) og [SECURITY.md](./SECURITY.md).

## Lisens

MIT.
