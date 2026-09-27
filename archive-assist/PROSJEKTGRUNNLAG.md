# Prosjektgrunnlag

Archive Assist viderefører Arkivklar-ideen: et enkelt verktøy som hjelper saksbehandleren og arkivaren med å gjøre dokumenter forståelige, søkbare og etterprøvbare gjennom innholdsbaserte titler og metadata.

## Tiltenkt produkt og dagens prototype

Målet er en **nedlastbar, lokalt installert app**. Den skal kunne bruke brukerens godkjente opplysninger om rolle, avdeling, sak og arbeidsmiljø sammen med dokumentinnhold og arkivfaglig praksis. Dette kan gi bedre forslag til tittel, dokumentets opphav og overordnet sammenheng, men må ikke erstatte kildekontroll.

Dagens nettprototype kjenner ikke automatisk lokal identitet, avdeling, mappekontekst eller virksomhetens arkivregler. Den tilbyr filimport, innliming, syntetiske eksempler, lokale forslag, redigering og eksport. Kontekst oppgis manuelt i et valgfritt feltsett. Brukeren/dokumentbehandleren er aldri automatisk dokumentets forfatter, og avdelingen er ikke automatisk avsender.

Den offentlige demoen er statisk og har ikke tilgang til en ChatGPT-konto. Ved lokal kjøring med `npm run local` kan en separat Node-bro bruke en eksisterende Codex-innlogging med ChatGPT. Valgfri **GPT-6 Luna med `medium` reasoning** kjører i skyen og bruker kontoens brukskvote. Dette er ikke en ferdig distribuert skrivebordsapp eller en modell som kjører på enheten.

## Prinsipper for arbeidsflyten

1. **Innhold før filnavn:** emne, uttrykkelig tittel, overskrift og meningsbærende innhold prioriteres. Filnavnet er reserve. Ukjent dokumentdato forblir ukjent.
2. **Prøv → kontroller → eksporter:** kilden står ved siden av forslag og redigering på brede skjermer. Begrensninger, mangler og kontrollstatus er synlige før eksport.
3. **Valgfri AI:** lokal uttrekking fungerer alene. Bare en eksplisitt analyseknapp sender avgrenset tekst, metadata og oppgitt kontekst til skymodellen. Ingen automatisk konto- eller miljøinnhenting brukes som dokumentkilde.
4. **Bevar proveniens:** skill dokumentets opphav fra den som behandler det. Overordnet sammenheng (`relation`) må ha belegg i dokumentet eller en uttrykkelig oppgitt sak. Menneskelige endringer og originale filbyte bevares.
5. **Etterprøvbare forslag:** metode, begrunnelse, sikkerhet, promptversjon og menneskelig kontrollstatus følger eksporten. Utfyllingsgrad er ikke kvalitetsgodkjenning.
6. **Flyttbart resultat:** JSON, CSV, kontrollrapport og ZIP med originaler og sidecars gir grunnlag for videre import uten å skrive om originaldokumentene.

## Videre arbeid

En installert virksomhetsversjon trenger pakket distribusjon og oppdatering, eksplisitte valg for hvilke kontekstkilder som tillates, en metadataprofil og integrasjon mot virksomhetens sak-/arkivsystem. Automatisk konteksthenting er et fremtidig produktvalg som må godkjennes og være synlig for brukeren.

Archive Assist er Noark-inspirert og hevder ikke Noark-samsvar. Tilgang, hjemmel, arkivverdi, bevaring og kassasjon krever faglig beslutning. Dagens avgrensninger og dataflyt står i [README.md](./README.md) og [SECURITY.md](./SECURITY.md); den operative tittelpraksisen står i [TITTELPROMPT.md](./TITTELPROMPT.md).