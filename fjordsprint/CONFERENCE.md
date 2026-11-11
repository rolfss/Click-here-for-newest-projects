# FJORDSPRINT på konferansen

Konferanseløpet bruker Fjordlinjen, Arkivrally, Assistert og Mobilhjelp for alle deltakere. Poengtavlen viser beste fullførte løp per arbeidsbrukernavn, rangert etter poeng med kortest tid som utslagsgivende ved lik poengsum. En ny poengtavle starter hver dag kl. 08.00 i tidssonen Europe/Oslo.

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
4. Når endringen er på `main`, åpner du **Actions → Publiser prosjektsiden → Run workflow** på `main`. Kontroller at publiseringen og den påfølgende kjøringen **Kontroller publisert Fjordsprint** lykkes før du deler QR-koden.

## Lenker på arrangementsdagen

- Bruk [konferanseløpet](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/?conference=1) som mål for QR-koden.
- Bruk [den offentlige poengtavlen](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/conference-leaderboard.html) i TV-oppsettet. Siden henter nye poeng hvert 15. sekund og viser plassering, kallenavn, poeng og tid.
- Åpne [arrangørsiden](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/conference-manager.html) i din egen nettleser. Oppgi arrangørnøkkelen og velg datoen da konkurransedagen startet. Du kan hente vinneren for den datoen også etter at den offentlige poengtavlen har startet på nytt. Velg **Lås visningen** når du er ferdig.

Prøvekjør fra to telefoner før arrangementet. Fullfør et løp med hvert sitt testbrukernavn, sjekk at både spillet og TV-en får de samme plasseringene, og bekreft at arrangørsiden viser brukerens korte M365-brukernavn. Legg prøvekjøringen før dagens nullstilling hvis testresultatene skal være ute av poengtavlen ved åpning.

## Premieoppslag

Slå opp vinnerens innsendte brukernavn nøyaktig slik det står på arrangørsiden. Premiekontakt krever et eksakt treff i arbeidskatalogen. Deltakeren oppgir brukernavnet selv, og bekreftelsesfeltet sjekker at begge oppføringene er like. Arrangøren bekrefter kontoen ved oppslaget.

Serveren kontrollerer innsendingen med en løpsbillett og grunnleggende plausibilitetsgrenser. Selve poengsummen kommer fra spillet i nettleseren. En endret spillklient kan derfor levere et falskt resultat som passer grensene.
