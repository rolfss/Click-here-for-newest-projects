# Sikkerhet og personvern

## Lokal behandling og valgfri ekstern analyse

Filinnlasting, tekstuttrekk, SHA-256 og første metadataforslag behandles lokalt i nettleseren. Oppstart, eksempler, innliming og filimport starter ingen Luna-analyse eller tilgjengelighetssjekk. Lokal kontroll og eksport virker uten AI-tjenesten.

Når brukeren åpner det valgfrie AI-panelet, sendes en tilgjengelighetssjekk til den eksterne backenden uten dokumenttekst. Når brukeren deretter trykker på en Luna-knapp, lastes Cloudflare Turnstile ved behov. Etter sikkerhetskontrollen sendes inntil 12 000 tegn per dokument, filnavn og utvalgte metadata via `noark-luna-api` til OpenAI for GPT-5.6 Luna med reasoning `medium`.

Metadatautvalget omfatter tittel/tittelforslag, dokumenttype, emne, dokumentdato, ansvarlig/forfatter, organisasjonsenhet, språk og uttrekksmetode. Forespørselen inneholder også forespørsels-ID og Turnstile-token. Originalfilens binærdata sendes ikke. Tekstutdraget og metadataene kan likevel inneholde personopplysninger eller fortrolig informasjon.

API-nøkkelen håndteres av backenden og inngår ikke i klienten. Klientkoden dokumenterer ikke eller garanterer backendleverandørenes lagringstid, logging eller behandlingsvilkår. Den offentlige demoen er ikke godkjent for fortrolige data; bruk syntetisk materiale ved utprøving.

## Kontroller i klienten

- Dokumenttekst vises som tekst med `textContent`. HTML i en importert fil skal ikke kjøres som markup i kildevisningen.
- AI-prompten behandler dokumentet som ubetrodd kildemateriale og ber modellen ignorere instruksjoner i innholdet. Dette er ikke en garanti mot feilaktige svar.
- Godkjente og menneskeredigerte titler overskrives ikke av AI. Endringer gjort mens et AI-kall pågår, beskyttes også mot det forsinkede svaret.
- Manglende dokumentdato forblir tom. Importtid og filens sist endret-dato fyller ikke manglende kildeopplysninger.
- Originalbyte beholdes. Eksport starter bare ved brukerens nedlastingshandling og leverer metadata ved siden av originalene.
- SHA-256 brukes til integritetskontroll og duplikatindikasjon, ikke kryptering.
- CSV-felt som starter med `=`, `+`, `-` eller `@`, nøytraliseres for å redusere risiko for formelinjeksjon.
- ZIP-stier renses for katalogtraversering og ugyldige filnavntegn.
- Import, lokalt uttrekk og ZIP-lesing har størrelsesgrenser. Ugyldige eller for store ZIP-poster avvises.
- Ved ugyldig UTF-8 kan teksten leses som Windows-1252. Et varsel ber brukeren kontrollere tegnsettet; originalbyte endres ikke.

## Verifisering og begrensninger

Node-testene bruker syntetiske dokumenter og kontrollerer blant annet tegnsett, kildebaserte datoer, tabellstruktur, kontrollstatus og originale eksportbyte. Playwright-testene kjører med mockede AI-/Turnstile-svar og kontakter ikke en levende modell. Ingen reell API-kvalitet, tjenestekonfigurasjon eller backendlagring kan utledes av disse testene.

Automatiske forslag og personopplysningssignaler kan være feil. PDF-uttrekket er begrenset og utfører ikke OCR. Kontroller dokumenttittel, originalinnhold, tilgang, hjemmel, arkivverdi og øvrige metadata før resultatet brukes videre. En utfyllingsprosent viser ikke at opplysningene er riktige, og sidecar-filer er ikke et uforanderlig arkivformat.
