# Arkivmuseet – poengrunde og topp 3

Velg **Poengrunde og topp 3** på forsiden eller i menyen. En separat, valgfri kunnskapsrunde har ti spørsmål fra de fem sakene. Første bekreftede svar gir 10 poeng hvis det er riktig, maksimalt 100. Ingen tidspoeng. Læringsmerkene og museumsreisen påvirkes ikke.

Deltakeren kan bruke visningsnavn og gi samtykke til lokal visning og senere manuell publisering på Viva Engage, eller spille anonymt. Bare de tre beste fullførte, navngitte resultatene med samtykke lagres, i `arkivmuseet-top3-v1` på denne nettleseren/enheten. Ingen felles server eller synkronisering mellom telefoner og PC-er. Navn uten topp 3-plassering lagres ikke. Påbegynt runde ligger bare i minnet og forsvinner ved omlasting.

Ved poenglikhet prioriteres først registrerte resultat; bare beste resultat per normalisert visningsnavn beholdes. Bruk ulike initialer ved navnelikhet. Listen kan kopieres som innlegg eller lastes ned som tekstfil. Ingen automatisk publisering eller Viva Engage-tilkobling. Arrangøren må kontrollere listen og slette navnene når de ikke lenger trengs. Enkeltresultater og hele listen kan slettes etter bekreftelse. Sletting her trekker ikke tilbake allerede eksporterte eller publiserte opplysninger. Lokal lagring er ikke manipulasjonssikker; dette er en læringsaktivitet, ikke en kompetansevurdering eller en sikret konkurranse. Bruk én arrangementsmaskin for én felles lokal liste.

`tests/score-state.test.mjs` tester poeng, kvalifisering, samtykke, rangering, lagringsfeil og sletting. `pnpm test:scores` tester brukerflyten i Chromium; inngår også i `pnpm test:visit-ui`.

