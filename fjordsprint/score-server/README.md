# Felles toppliste — valgfri Cloudflare Worker

**Status: implementert og testet med SQLite lokalt; ikke koblet til den publiserte klienten.** GitHub Pages publiserer statiske filer og kjører ikke denne serveren. Ingen hemmelig nøkkel skal inn i HTML eller JavaScript.

## Aktivering

En eier med tilgang til Cloudflare-kontoen må godkjenne og utføre utrulling. Fra denne mappen: `npx wrangler deploy`. Dette krever innlogging og kontroll av kontoens vilkår og eventuelle kostnader; det er ikke utført av denne utgaven. `wrangler.jsonc` oppretter en SQLite-basert Durable Object og tillater nettleseropprinnelsen `https://rolfss.github.io`.

Etter vellykket utrulling og integrasjonstest settes `content` på `<meta name="leaderboard-api" content="">` i `dist/index.html` til den faktiske HTTPS-adressen. Publiser klienten på nytt. Ikke sett inn en gjettet adresse. Ingen API-nøkkel skal ligge i klienten.

## API

- `GET /health`: driftsstatus.
- `POST /sessions` med `{board}`: oppretter en engangsbillett for ett løp; gyldig i 30 minutter.
- `POST /scores` med `{ticket, board, name, timeMs, crashes, splits}`: registrerer et fullført løp.
- `GET /scores?board=...`: inntil 50 beste aktive navn i klassen.

Klasseeksempel: `fjord-archive2-0-assist`. Navn normaliseres til 2–20 tegn. Serveren bestemmer tidspunktet. Innholdet i en ny registrering får `expiresAt = createdAt + 259200000`. Gjentakelse av samme billett er idempotent og forlenger ikke utløpet. Lagrede resultater fjernes fra aktive spørringer ved utløp, med databaseopprydding via alarmer og ved forespørsler. Garantien gjelder den aktive databasen, ikke eventuell lagring eller sikkerhetskopiering hos infrastrukturleverandøren.

## Beskyttelse og avgrensninger

Parameteriserte SQL-spørringer, avgrensede forespørsler på 4096 byte, engangsbilletter, gyldige løpsklasser, stigende mellomtider og enkle tidskontroller. Maksimalt 60 skriveforsøk per time per pseudonymisert IP-nøkkel. Rå IP-adresser lagres ikke av koden; nøkkelen er en timespesifikk hash, ikke en garanti om anonymitet. CORS er begrenset til konfigurert opprinnelse, men CORS alene forhindrer ikke misbruk fra andre klienter.

Dette er **ikke full juksesikring**: en modifisert klient kan fremdeles fabrikkere en plausibel tid. Før en større offentlig konkurranse anbefales servervaliderte repriser, moderering, belastningstester og en publisert personvernbeskrivelse. Spilleren velger uttrykkelig om et resultat skal sendes til den felles listen. Lokal lagring fortsetter dersom nettverket feiler.

## Test

Kjør `npm test` fra foreldremappen. `tests/server.test.mjs` bruker Node.js SQLite som adapter for lagringsgrensesnittet og tester serverstyrt klokke, utløpsalarm, duplikater, validering, begrensning og CORS. Det erstatter ikke en utrullingstest mot ekte Cloudflare-infrastruktur.
