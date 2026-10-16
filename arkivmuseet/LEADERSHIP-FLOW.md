# Faglig flyt: fra kildefunn til ledergrep

Redaksjonell revisjon 16. oktober 2026. Den frie 3D-reisen, originalkildene, historiske avgrensninger og valgfrie øvelser beholdes.

Hver sak følger fem deler: hendelse, kontrollsvikt, følge, oppfølging og konkret ledergrep. Hvert kildefunn vises før museets tolkning. Følger for lederens styring, ressursbruk og evne til å forklare saken omtales som muligheter, ikke som dokumenterte personlige sanksjoner.

## Fem særskilte lederoppgaver

- Osen: følg etterslepet fra ferdigstilling til kvalitetssikret journalføring.
- Tokke: krev prøve på gjenfinning og lesbarhet før systemavvikling.
- Innsyn: prøv om en annen medarbeider kan rekonstruere og oversende riktig saksgrunnlag.
- Hanekleiv: kontroller at nødvendig kunnskap følger leveransen inn i driftsfasen.
- NPE: begrunn retting etter konkret vurdering av feil og konsekvenser.

Forbeholdene er ikke svekket: Tokke er ikke bevis på endelig tap, Hanekleiv beviser ikke at arkivtap alene forårsaket raset, og NPE-rapporten dokumenterer ikke feil i erstatningsvedtak. Historiske lovhenvisninger holdes atskilt fra dagens regelverk. Den eksisterende datoen for rettskildekontroll er ikke flyttet frem som del av tekstredigeringen.

## Ett innholdsgrunnlag

`cases/leadership-flow.json` inneholder de redaksjonelle tekstene, med kilde-ID og lokalisering for hver sak. `src/case-flow.mjs` gjengir de samme kapitlene i 3D-app, tilgjengelig appmodus, fordypning og generert `tekst.html`. `src/case-flow.d.mts` gir TypeScript-kontrakten. Historiske sakspåstander i `cases/cases.json` er ikke omskrevet.

Appen har tilbakeknapp mellom kapitlene, tydelig sak-/kapittelnummer og overgang til neste rom som hovedhandling etter ledergrepet. Øvelsene er sekundære og valgfrie. Tekstversjonen har saksoverganger og en lederbestilling før de ekstra scenarioene. Ankomst uten 3D starter med første virkelige sak, ikke med første uløste øvelse.

## Kontroll

`tests/case-flow.test.mjs` tester innholdsdekning, kildetilknytning, skille mellom funn og tolkning, alle påstander i en liste, HTML-escaping og felles gjengivelse. `scripts/verify-case-flow.mjs` tester alle kapitler ved 320, 390 og 1280 piksler med større tekst, tilbakeknapp, direkte lederbestilling og full rute uten quiz. Den kontrollerer også tekstversjonen uten JavaScript. Den kjøres før de eksisterende besøkskontrollene via `pnpm test:visit-ui`.

Testkoden beskriver kontrollene; faktisk bestått status må leses i den aktuelle GitHub Actions-kjøringen.
