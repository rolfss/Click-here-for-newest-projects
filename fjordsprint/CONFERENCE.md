# FJORDSPRINT på konferansen

På Fagdagen kjører deltakerne Fjordlinjen med Arkivrally, Assistert og Mobilhjelp. Poengene for denne etappen ganges med tre. Fagdagen viser tidligere treetappersresultater sammen med nye resultater. Den nye poengtjenesten beholder beste fullførte runde per arbeidsbrukernavn. Ved lik poengsum sammenlignes kjøretid i forhold til referansetiden for hvert løpsformat. Tavlen viser faktisk kjøretid. En ny poengtavle starter hver dag kl. 08.00 i tidssonen Europe/Oslo.

## Koble til poengtjenesten

1. Publiser poengtjenesten med den eksisterende Cloudflare Workeren `fagdagen-2026` fra `fagdagen-web-live`. Fjordsprint har egen lagring i Workeren, ved siden av quizens lagring.
2. Kontroller at `/conference/scores?board=fjordsprint-three-stage-v1` på Fagdagen viser dagens resultater og at `supportedRulesets` inneholder `fjord-stage-v1`. Deretter kan spillversjonen på `main` publiseres via GitHub Pages.

## Lenker på arrangementsdagen

- Bruk [konferanseløpet](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/?conference=1) som mål for QR-koden.
- Bruk [den offentlige poengtavlen](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/conference-leaderboard.html) i TV-oppsettet. Siden henter nye poeng hvert 15. sekund og viser plassering, kallenavn, poeng og tid.
- Åpne [arrangørsiden](https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/conference-manager.html) med Fagdagens arrangørnøkkel for vinneroppslag fra Fjordlinjen. Hvis vinneren på den offentlige tavlen kjørte tre etapper, velg **Oppslag for treetappersløpet** og bruk den opprinnelige Fjordsprint-nøkkelen.

Prøvekjør fra to telefoner med hvert sitt testbrukernavn. Sammenlign poengsummen i spillet og på TV-en, og bekreft at arrangørsiden viser brukerens korte M365-brukernavn. Legg prøvekjøringen før dagens nullstilling hvis testresultatene skal være ute av poengtavlen ved åpning.

## Premieoppslag

Slå opp vinnerens innsendte brukernavn nøyaktig slik det står på arrangørsiden. Premiekontakt krever et eksakt treff i arbeidskatalogen. Deltakeren oppgir brukernavnet selv, og bekreftelsesfeltet sjekker at begge oppføringene er like. Arrangøren bekrefter kontoen ved oppslaget.

Serveren kontrollerer løpsbilletten, etapperekkefølgen og målegrensene. Den beregner totalscoren fra de samme poengreglene som spillet. Nettleseren leverer målingene av kjøringen, så en endret klient kan fremdeles oppgi oppdiktede verdier som passer grensene.
