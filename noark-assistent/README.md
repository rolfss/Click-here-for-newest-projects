# Noark 5-arkivassistent

Korte, kildebaserte svar og konkrete henvisninger til Noark 5 versjon 6.0, arkivregelverket og Nasjonalarkivets praktiske veiledning. Formålet er å hjelpe leseren videre til relevant originalmateriale – ikke å skrive lange utredninger.

## To tydelige driftsmoduser

**Lokalt kildesøk** virker uten konto, server eller API-nøkkel. Appen rangerer kuraterte kildeposter og setter sammen forhåndskontrollerte sammendrag.

**GPT-6 Luna**, med resonneringsnivå `medium`, tilpasser svarene til spørsmålet og oppgitt situasjon. Enkle spørsmål besvares kort; forklaringer, sammenligninger og sjekklister får normalt 150–350 ord med begrunnelse og kildehenvisninger. Oppfølgingsspørsmål beholder temaet fra samtalen. API-bruken er separat fra ChatGPT-abonnementet.

Når Luna er valgt, erstattes ikke feil med et ferdig lokalt standardsvar. Appen viser «Luna svarte ikke», forklarer årsaken og lar spørsmålet stå klart for nytt forsøk. Brukeren kan velge lokalt søk selv. Kildeoversikten og relevansprosentene beholdes til høyre.

Den offentlige Worker-adressen er konfigurert i `api-config.mjs`; ingen hemmelighet ligger i klientkoden. Grensesnittet kontrollerer faktisk tilgjengelighet og faller tilbake til lokalt søk ved feil eller oppbrukt appbudsjett.

**Versjon 1.3.2:** GitHub Pages og Cloudflare må oppdateres separat med kildegrunnlaget fra 26.09.2026. En vellykket Pages-publisering alene bekrefter ikke at Luna-serveren er oppdatert. Ved versjonskonflikt viser klienten feil for spørsmål som trenger nyere kilder. Se [vedlikeholdsregelen](SOURCE_MAINTENANCE.md) og [utrulling og privat kvalitetsgjennomgang](../noark-api/GUIDANCE_AND_REVIEW.md).

## Kildegrunnlag

### Designvalg og arkivfaglig praksis

Grensesnittets «Kilder og metode» forklarer fire valg: kontrollerbare originalhenvisninger, kildenes virkeområde og versjon, synlig KI-bruk og usikkerhet, og brukerens faglige kontroll før svaret tas i bruk. Dette støtter etterprøvbarhet, kontekst og tydelig ansvar. Koblingen er vår anvendelse av [Nasjonalarkivets veiledning om internkontroll](https://www.nasjonalarkivet.no/veiledere/etablere-internkontroll-med-dokumentasjonsforvaltningen/), ikke en godkjenning av appen. Et kopiert beslutningsnotat må håndteres etter virksomhetens dokumentasjonsrutiner.

### Innhold og vedlikehold

**Fast vedlikeholdsregel:** Søk etter nye og reviderte, relevante dokumenter hver tirsdag og torsdag kl. 09.00 norsk tid. Kunnskapsbasen endres bare når **GPT-6 Astra med ultra** vurderer det nødvendig. Kontrollen kjøres via eierens Codex og krever at maskinen er på og appen kjører. Regelen vises i brukergrensesnittet. Se [fremgangsmåte, vurderingskrav og publisering](SOURCE_MAINTENANCE.md).

164 kildeposter fra 20 offisielle kilder, inkludert 65 formatoppføringer. Materialet omfatter Noark, regelverk, avlevering, internkontroll, fysisk sikring, dokumentasjonskartlegging, bevaringskriterier, mediekonvertering, kassasjon og Arkade. Etter [Astra Ultra-vurderingen 26.09.2026](maintenance/2026-09-26.md) er en post om Arkade 2.13.1 lagt til, mappeID-kravet presisert og én kildehenvisning rettet. Kontrollen undersøkte alle 19 daværende kilder og nye relevante publikasjoner. Kildenes publiseringsdatoer skilles fra kontrolldatoer; ukjente veilederdatoer forblir ubekreftet.

Formatoppføringene bevarer filendelser, PRONOM-identifikatorer og eksplisitte versjoner fra Nasjonalarkivets liste. Nye kilder har kontrolltidspunkt, virkeområde og seksjon. Akseptert format er ikke godkjenning av hele avleveringen; kravene gjelder ikke automatisk alle kommunale depot. Eldre veiledere merket utdaterte brukes ikke som gjeldende regelgrunnlag.

## Prosenttreff og kilder

Prosenten er et **anslag på kildepostens relevans for spørsmålet**, ikke sannsynligheten for at svaret er riktig, og ikke hvor stor del av hele originaldokumentet som svarer på spørsmålet.

- Lokalt: vektet dekning av spørsmålets ord, synonymer og kravnummer, kombinert med BM25-signal. Toppresultatet får ikke automatisk 100 prosent.
- Med Luna: semantisk vurdering av hver kandidatpost mot spørsmålet og relevant samtalekontekst. Hvert treff får en kort begrunnelse. Skårene er ikke statistisk kalibrert.
- Treff sorteres etter anslått relevans. Henvisninger og kopierte beslutningsnotater bruker samme rekkefølge. En eldre svarhenvisning viser kildene til akkurat det svaret.

Bare registrerte kilde-ID-er kan brukes. Lenker, seksjoner, kravnummer og sideankere kommer fra kildebasen, aldri fra modellgenererte nettadresser. Dette hindrer oppdiktede lenker, men beviser ikke at en påstand er korrekt støttet.

## Begrensninger og personvern

Dette er en kuratert kunnskapsbase, ikke en fulltekstindeks eller løpende nettsøk. KI kan feiltolke spørsmål, kilder og rettslige skiller. Kontroller ordlyd, dato og gyldighet i originalmaterialet; dette er fagstøtte, ikke juridisk rådgivning.

Ved eksplisitt aktivering av Luna sendes spørsmålet, inntil fire tidligere meldinger og relevante kildeposter via bakenden til OpenAI. Ikke skriv personopplysninger, pasientdata, taushetsbelagt eller intern informasjon. Samtaletekst lagres ikke i bakendens budsjettregister. `store: false` utelukker ikke leverandørens sikkerhetslogger eller øvrige oppbevaring.

Etter oppdatert Worker-utrulling kan godkjente backendforespørsler registreres i en separat, privat kvalitetslogg. **Spørsmålstekst krever eget, ikke forhåndsavkrysset samtykke**; ellers lagres bare minimal diagnostikk med kilde-ID-er, skårer og utfall. Redigering av samtykket tekst er ikke garantert anonymisering. Aktiv lagring utløper etter 30 dager; loggen har maks. 5 000 poster og eierbeskyttet eksport/sletting. Leverandørens gjenopprettingskopier og lokale eksportfiler har egne hensyn.

Loggen brukes til manuell gjennomgang av manglende kilder og forbedring av tester, ikke automatisk trening eller som faglig kilde. Rene lokale søk forlater ikke nettleseren. Nylige spørsmål lagres lokalt og kan slettes i grensesnittet.

## Kjøring og tester

Fra repository-roten, med Node.js 22 eller nyere:

```sh
cd noark-assistent
npm run validate
python3 -m http.server 8000
```

Åpne `http://localhost:8000`. Lokalkjøringen trenger ingen API-nøkkel. Testene dekker blant annet kildeintegritet, bevaringsplaner, formatvarianter, søk, relevans, henvisninger, gammel/ny korpuskompatibilitet, misbruksvern, budsjettreservasjoner og privat logging. Modell- og Turnstile-kall i testene er simulerte; live modellkvalitet og full nettlesertest må vurderes separat.

## Viktige filer

`guidance-data.mjs` inneholder nye kilder, veiledningsposter og formatoppføringer. `engine.mjs` er lokal søkemotor. `rag-shared.mjs` håndterer kontekst, svarformat og kildevalidering. `luna-client.mjs` kobler nettleseren til bakenden uten API-nøkkel. `app.mjs` viser dialog og kildepanel. `../noark-api/worker.mjs` inneholder modellkall, botkontroll og varig budsjettstyring. `../noark-api/question-log.mjs` og `review-questions.mjs` håndterer privat kvalitetsgjennomgang.

Ved regelendringer: kontroller originalkildene, oppdater berørte poster og `corpusVersion`, legg til relevante tester og valider før koordinert publisering av klient og Worker.
