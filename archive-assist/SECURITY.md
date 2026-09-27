# Sikkerhet og personvern

## Behandling og samtykke til analyse

Import, tekstuttrekk, SHA-256 og første metadataforslag skjer i nettleseren. Oppstart og import utløser ingen AI-analyse. Å åpne AI-panelet i den lokale appen sjekker tilgjengelighet uten dokumenttekst eller modellturn. Den offentlige statiske demoen og `npm run preview` har ingen kontotilkobling og holder AI avslått.

En eksplisitt Luna-knapp sender inntil 12 000 tegn dokumenttekst, filnavn, utvalgte metadata og manuelt oppgitt arbeidskontekst via lokal Node-server og Codex til **GPT-6 Luna (`medium`) i skyen**. Kontekstfeltene har grenser på 120/160/600 tegn for dokumentbehandler, avdeling og overordnet sak. Appen leser ikke brukeridentitet eller lokalt arbeidsmiljø automatisk og lagrer ikke disse feltene i `localStorage`. Dokumentbehandleren er ikke automatisk forfatter. Originalfilens binærdata sendes ikke, men utdrag og metadata kan likevel inneholde fortrolig informasjon.

Analysen bruker ChatGPT-kontoens tilgang og brukskvoter. Dette er ikke en garanti om lokal behandling, leverandørens lagringstid eller virksomhetens godkjenning. [Codex-autentisering](https://learn.chatgpt.com/docs/auth) beskriver hvordan innloggingsmetoden påvirker behandlingsvilkår og administratorkontroller. Bruk syntetisk materiale ved utprøving; virksomhetsdata krever en godkjent behandling.

## Konto og lokal server

- Codex håndterer sin administrerte ChatGPT-innlogging. Archive Assist leser eller kopierer ikke kontolegitimasjon til klient-JavaScript, GitHub eller en Worker. Innlogging skjer med `codex login`, aldri via et passord-/tokenfelt i appen.
- API-nøkkel-autentisering avvises. Ved manglende konto, modell eller sikker konfigurasjon avslås AI; det finnes ingen betalt API-/Worker-fallback.
- Node-serveren lytter bare på `127.0.0.1`. Analyse krever riktig Host, samme Origin, JSON og et tilfeldig lokalt økttoken. Dette økttokenet er separat fra ChatGPT-kontoens legitimasjon.
- Klientbygget inneholder bare tillatte statiske filer. Serverkode og kontofiler serveres ikke. Størrelsesgrenser, svarskjema, timeout og én samtidig analyse begrenser feil og uventet ressursbruk.

## Isolasjon av analysen

Broen lager en midlertidig arbeidsmappe og en ephemeral Codex-tråd per operasjon. Den setter en prosesslokal profil med filtilgang begrenset til lesing av arbeidsmappen, sperret agentnettverk og deaktiverte shell-, koblings-, plugin- og nettleserfunksjoner. Rettighetsprofilen tillater ikke filskriving selv om et skriveverktøy skulle være tilgjengelig. Global konfigurasjon endres ikke. Effektive innstillinger kontrolleres før modellen brukes, og uventede verktøy- eller godkjenningsforespørsler avbryter analysen. Underprosessen og arbeidsmappen ryddes etter bruk. Dette begrenser agentens tilgang; selve skymodellen trenger fortsatt forbindelsen til OpenAI.

## Dokument- og eksportkontroller

- Kildetekst vises med `textContent`. Prompten behandler dokument og kontekst som ubetrodd materiale.
- Godkjente/menneskeredigerte titler og felt endret mens et AI-kall pågår, beskyttes mot overskriving.
- Manglende dokumentdato forblir tom. Tekniske tidsstempler brukes ikke til å fylle manglende dokumentdato.
- Originalbyte beholdes; metadata eksporteres ved siden av originalene. SHA-256 gir integritetskontroll, ikke kryptering.
- CSV-felt med formeltegn nøytraliseres, ZIP-stier renses og import/utpakking har størrelsesgrenser.
- Windows-1252-reserve ved ugyldig UTF-8 gir et varsel uten å endre originalbyte.

Node- og nettlesertester bruker syntetiske data og mockede AI-svar. De beviser ikke modellkvalitet eller tjenestens behandlingsvilkår. Eventuell levende verifisering er separat og uttrykkelig autorisert med syntetiske data og ChatGPT-kontoen.

PDF-leseren utfører ikke OCR. Forslag, uttrekk og personopplysningssignaler kan være feil. Mennesker må kontrollere opphav, dato, tittel, overordnet sak, tilgang og bevaring/kassasjon. Sidecars er et overføringsformat, ikke et uforanderlig arkiv.
