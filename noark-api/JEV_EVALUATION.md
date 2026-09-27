# JEV-utprøving for Noark-assistenten

Evalueringsverktøyet måler om JEV velger nyttigere kildeposter og oppdager
påstander som ikke støttes av de oppgitte kildene. Det aktiverer ikke appen.
Appintegrasjonen har et separat [driftsoppsett](RAG_OPERATION.md) med samtykke,
budsjettregnskap og valgfri Bonsai-reserve. Kildekontroll er fortsatt bare evaluering.

Luna vurderer allerede relevansen til alle de 12 kildepostene den får. Derfor må
JEV sammenlignes med Luna, ikke bare med det lokale ordsøket, før vi hevder at
det forbedrer appen. En lokal JEV MCP-installasjon er nyttig i Codex, men er ikke
en forutsetning for denne utprøvingen eller en forbindelse til Cloudflare Worker.

## 1. Lokal basismåling, uten nøkkel eller nettverk

Fra repository-roten, med Node.js 22 eller nyere:

```sh
node noark-api/evals/evaluate-jev.mjs
```

Alternativt: `npm run eval:jev` fra `noark-assistent`. Ingen ekstra pakker trengs.
Standardkjøringen sender ingenting til en leverandør, også om API-nøkler finnes
i miljøet. Den bruker fjorten håndskrevne, syntetiske spørsmål og eksisterende korpus.
To spørsmål er merket `holdout`; hold dem utenfor justering av instrukser og terskel.
Kildetekstene er kuraterte sammendrag, ikke fulltekst eller en fersk lovkontroll.

Rapporten viser:

- Dagens 12 kildeposter og en utvidet kandidatgruppe på opptil 24 poster.
- Manglende forventede poster: JEV kan ikke velge informasjon søket aldri fant.
- Treff på førsteplass, recall@3/5/12 og gjennomsnittlig reciprok rang.
- At JEV, Luna-sammenligningen og semantisk kildekontroll **ikke er kjørt**.

For å lagre en rapport, opprett `noark-api/eval-results` og legg til
`--output noark-api/eval-results/offline.json`. Rapporter overskrives ikke; bruk et
nytt filnavn for neste kjøring. Denne mappen ignoreres av Git.

## 2. Kjør en liten, eksplisitt JEV-test

Sett `TYPESAFE_API_KEY` kun i den lokale Node-prosessens miljø via en lokal
hemmelighetshåndterer eller et skjult interaktivt felt. Ikke send nøkkelen i chat,
kommandolinjeargumenter, kildekode, GitHub, en nettleser eller rapportfiler.
Verktøyet leser ikke `.env`, Codex-konfigurasjon eller Windows-nøkkellagre automatisk.

Kjør deretter:

```sh
node noark-api/evals/evaluate-jev.mjs --live --split development --max-requests 20
```

Dette sender bare de innebygde syntetiske spørsmålene, relevant brukerhistorikk
og nødvendige offentlige kildeposter til TypeSafe. Ingen besøksspørsmål,
kvalitetslogger, private dokumenter eller assistenthistorikk hentes inn.

I vanlig Windows PowerShell kan nøkkelen angis skjult for én kjøring uten å
endre noen skriptpolicy. Lim inn kommandoene, og skriv selve nøkkelen først i
det skjulte feltet som åpnes av `Read-Host`:

```powershell
$jevSecure = Read-Host 'TypeSafe API key (hidden)' -AsSecureString
$jevPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($jevSecure)
$previousJevKey = $env:TYPESAFE_API_KEY
try {
  $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($jevPointer)
  node noark-api/evals/evaluate-jev.mjs --live --split development --max-requests 20
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($jevPointer)
  $jevSecure.Dispose()
  if ($null -eq $previousJevKey) { Remove-Item Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue }
  else { $env:TYPESAFE_API_KEY = $previousJevKey }
  $previousJevKey = $null
}
```

Hvert spørsmål med kandidater bruker ett batchet JEV-kall til rerangering.
Spørsmål med merkede testpåstander bruker ett ekstra batchet kildekontrollkall.
Hele planen kontrolleres mot `--max-requests` **før** første nettverkskall. Det er
en forespørselsgrense, ikke et dollarbudsjett: lokal utprøving bruker ikke appens
delte prøvebudsjett. Se faktisk tokenbruk og kostnad hos leverandøren.

Forespørsler og svar har størrelsesgrenser og tidsavbrudd. Omdirigeringer følges
ikke, feiltekster fra leverandøren skrives ikke ut, og et mislykket kall avslutter
kjøringen uten automatiske forsøk. Allerede utført arbeid kan ha kostet penger;
rapporten markerer resten som ikke kjørt.

## 3. Sammenlign med eksisterende Luna

Med begge nøklene i prosessmiljøet (`TYPESAFE_API_KEY` og `OPENAI_API_KEY`):

```sh
node noark-api/evals/evaluate-jev.mjs --live --compare-luna --max-requests 40
```

Denne varianten gjør ekstra betalte OpenAI-kall. Den gjenbruker appens faktiske
`buildPayload`, `gpt-6-luna`, medium resonnering, `store: false`, svarskjema og
siteringsvalidering. Den ber ikke Cloudflare om å utlevere en lagret nøkkel.
Rapporten lagrer kilde-ID-er, skårer, summerte tokens og tidsbruk; rå leverandørsvar
og genererte svartekster lagres ikke.

JEV velger opptil 12 av opptil 24 kandidater; dagens Luna vurderer dagens 12.
Dette sammenligner to kandidatløp, og eventuell gevinst kan delvis komme fra den
større kandidatgruppen. Rerangering beholder alltid avtaleforbeholdene
`guide-format-agreement` og `guide-format-conversion` når formatposter velges.
Eksisterende kildeobjekter, lenker og kravnummer eies fortsatt av korpuset.

## 4. Vurder resultatene før aktivering

Kontroller først utviklingsspørsmålene. Kjør deretter `--split holdout` uten å
justere mot disse resultatene. Rapporten sammenligner bare par der begge metoder
er fullført, slik at feil eller utelatte kall ikke gir en misvisende gevinst.

Seks påstander er merket som støttet/ikke støttet av **de siterte sammendragene**.
`--threshold 0.8` er en foreløpig testterskel; den er ikke kalibrert for juridiske
beslutninger. Se spesielt på falske positive: påstander som JEV godkjenner selv
om kildene ikke støtter dem. Noul-verdien er en vurdering av det stilte spørsmålet,
ikke en sannsynlighet for at hele svaret er korrekt. Kontroll av håndskrevne
testpåstander er heller ikke kontroll av alle fremtidige Luna-svar.

Fjorten spørsmål og seks påstander er en start, ikke et representativt kvalitetsbevis.
Utvid med flere redigerte, ikke-sensitive norske eksempler og vurder faktiske
svar med en fagperson. Sammenlign også forsinkelse og kostnad. Fast modellversjon
kan velges med `--model jev-...`; standardaliaset `jev-latest` kan endres over tid.

Appintegrasjonen ligger i `LunaGate.fetch`, etter Turnstile og budsjettreservasjon.
Den skal fortsatt:

1. Ha en egen TypeSafe-hemmelighet på serveren og eksplisitt informasjon/samtykke
   til denne ekstra mottakeren av spørsmål og nødvendig kontekst.
2. Reservere JEV-kostnad i det eksisterende varige regnskapet uten å nullstille
   eller duplisere `noark-global-budget-v1`; behold alle nåværende grenser.
3. Beholde eksisterende kildelister, avtalekontekst, siteringskontroll og lokal modus.
4. Falle tilbake til dagens kandidatløp ved JEV-feil, med korrekt status og uten
   automatisk betalt omkjøring. Kreve serveraktivering, nøkkel og gjeldende samtykke.

Manglende API-nøkkel blokkerer live-målingen, men ikke offline-testene. At en
lokal API-nøkkel virker, betyr ikke at en Worker-hemmelighet er konfigurert.

## Kilder og tester

- [TypeSafe HTTP API](https://docs.typesafe.ai/api)
- [TypeSafe rerangering](https://docs.typesafe.ai/cookbooks/rerank_typesafe)
- [TypeSafe Noul](https://docs.typesafe.ai/primitives/noul)
- [OpenAI Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

Kjør `npm run validate` fra `noark-assistent`. Alle enhetstester bruker simulerte
API-svar. At testene passerer, viser programatferd og bevaring av sperrer; det
viser ikke at JEV-kontoen virker eller at kvalitetsmålingene vil bli bedre.
