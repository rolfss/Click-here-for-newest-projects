# FJORDSPRINT på konferansen

På Fagdagen kjører deltakerne Fjordlinjen med Arkivrally, Assistert og Mobilhjelp. Poengene for denne etappen ganges med tre og registreres på den eksisterende poengtavlen. Tavlen beholder tidligere treetappersresultater og viser beste fullførte runde per arbeidsbrukernavn. Ved lik poengsum sammenlignes kjøretid i forhold til referansetiden for hvert løpsformat. Tavlen viser faktisk kjøretid. En ny poengtavle starter hver dag kl. 08.00 i tidssonen Europe/Oslo.

## Koble til poengtjenesten

1. Åpne en terminal i prosjektmappen `fjordsprint/score-server`. Logg inn på Cloudflare, publiser Worker-tjenesten, og legg inn arrangørens tilgangsnøkkel.

   ```powershell
   npx --yes wrangler@4.130.0 login
   npx --yes wrangler@4.130.0 deploy
   npx --yes wrangler@4.130.0 secret put CONFERENCE_MANAGER_TOKEN
   ```

   Bruk en tilfeldig nøkkel på 32–128 tegn fra en passordbehandler, med bokstaver, tall, bindestrek eller understrek. Lim den inn når Wrangler ber om verdien, og behold den i passordbehandleren. Worker-tjenesten lagrer resultatene i et SQLite-basert Durable Object.

2. Kopier den offentlige HTTPS-adressen som `deploy` skrev ut. Åpne `/conference/scores` på den adressen og sjekk at svaret inneholder `day`, `resetsAt` og `scores`. `scores` er tom før første fullførte løp.
3. Den publiserte Worker-adressen ligger i `dist/conference-config.js`. Hvis poengtjenesten flyttes, kan du overstyre adressen i **Settings → Secrets and variables → Actions → Variables** med repositorievariabelen `FJORDSPRINT_CONFERENCE_API_URL`. Bruk Worker-adressen uten `/conference/scores`. Arrangørens tilgangsnøkkel ligger som en hemmelighet i Worker-tjenesten.
4. Ved en oppdatering publiserer du til den eksisterende Workeren `fjordsprint-scores` før GitHub Pages. Kontroller at `/conference/scores?board=fjordsprint-three-stage-v1` viser dagens resultater og at `supportedRulesets` inneholder `fjord-stage-v1`. Når nettsideendringen er på `main`, kontroller at **Publiser prosjektsiden** og **Kontroller publisert Fjordsprint** lykkes.

## Lenker på arrangementsdagen

- Bruk [konferanseløpet](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/?conference=1) som mål for QR-koden.
- Bruk [den offentlige poengtavlen](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/conference-leaderboard.html) i TV-oppsettet. Siden henter nye poeng hvert 15. sekund og viser plassering, kallenavn, poeng og tid.
- Åpne [arrangørsiden](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/conference-manager.html) i din egen nettleser. Oppgi arrangørnøkkelen og velg datoen da konkurransedagen startet. Du kan hente vinneren for den datoen også etter at den offentlige poengtavlen har startet på nytt. Velg **Lås visningen** når du er ferdig.

Prøvekjør fra to telefoner før arrangementet. Fullfør Fjordlinjen med hvert sitt testbrukernavn, sammenlign poengsummen i spillet og på TV-en, og bekreft at arrangørsiden viser brukerens korte M365-brukernavn. Bruk lenken **Vis tidligere énetappes løp** på arrangørsiden for eldre vinnere. Legg prøvekjøringen før dagens nullstilling hvis testresultatene skal være ute av poengtavlen ved åpning.

## Premieoppslag

Slå opp vinnerens innsendte brukernavn nøyaktig slik det står på arrangørsiden. Premiekontakt krever et eksakt treff i arbeidskatalogen. Deltakeren oppgir brukernavnet selv, og bekreftelsesfeltet sjekker at begge oppføringene er like. Arrangøren bekrefter kontoen ved oppslaget.

Serveren kontrollerer løpsbilletten, etapperekkefølgen og målegrensene. Den beregner totalscoren fra de samme poengreglene som spillet. Nettleseren leverer målingene av kjøringen, så en endret klient kan fremdeles oppgi oppdiktede verdier som passer grensene.
