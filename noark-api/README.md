# NOARK med JEV, Luna og Bonsai

Se [driftsoppsettet](RAG_OPERATION.md) for JEV-kildevalg, eksplisitt samtykke,
Bonsai på eierens PC, kvotereserve og sikker publisering. Eksisterende
budsjettregister og mottakerbegrensninger beholdes.

## Prøv JEV mot det eksisterende kildegrunnlaget

JEV-utprøvingen har et eget [oppsett og evalueringsløp](JEV_EVALUATION.md).
Kjør `node noark-api/evals/evaluate-jev.mjs` fra repository-roten for en lokal
basismåling uten API-kall. Betalte JEV-kall og sammenligning med Luna må velges
eksplisitt. Utprøvingen aktiverer ikke JEV for besøkende.

## Oppdater den eksisterende Luna-serveren

Fra roten av en oppdatert utsjekking av dette repositoryet, med Node.js 22 eller nyere:

```sh
node noark-api/deploy.mjs
```

Kommandoen kjører testene, bygger Worker-koden, åpner Cloudflares offisielle innlogging og publiserer til den eksisterende `noark-luna-api`. Godkjenn innloggingen i nettleseren på samme PC. Eksisterende Worker-hemmeligheter, dashboard-variabler og budsjettregister bevares gjennom konfigurasjonen i `wrangler.toml`.

Etter publisering kontrolleres **den offentlige backendadressen som nettsiden faktisk bruker**. Kontrollen må finne rett kildeversjon, svarversjon, modell, aktivering og alle tre budsjettgrenser. En gammel server med `configured: true` alene blir ikke godkjent. Helsekontrollen beviser ikke at OpenAI kan levere et svar: åpne deretter nettsiden på nytt, aktiver Luna og test «Hva er systemID?» og «Hva er avlevering?».

`node noark-api/deploy.mjs --check` kontrollerer bare den aktive utrullingen. `--dry-run` kjører tester og bygg uten innlogging eller publisering. Ingen av kontrollene sender betalte modellspørsmål. Wrangler-versjonen er låst i skriptet.

## Oppsett og arkitektur

Bakenden bruker **GPT-6 Luna**, `reasoning.effort: medium`, via OpenAI Responses API. Nettleseren forblir på GitHub Pages; API-nøkkelen ligger bare som hemmelighet i en Cloudflare Worker. Én SQLite Durable Object deler budsjett og forespørselsgrenser mellom alle brukere.

Modellbyttet krever en koordinert publisering av Worker, Noark-assistenten og Archive Assist, som deler denne bakenden. Begge klientene kontrollerer modell-ID-en. Behold eksisterende hemmeligheter, budsjettregnskap og Bonsai-reserve. Reservasjonssatsene er fortsatt konservative (USD 0,25 per million input-token og USD 1,20 per million output-token), ikke en faktura fra OpenAI.

Helseendepunktet kontrollerer konfigurasjon og lokal modellberedskap, ikke svarkvalitet eller OpenAI-kontoens modelltilgang. Verifiser faktiske svar etter utrulling. Nøkler følger aldri med kildekoden.

## Privat aktivering – anbefalt, enklest og sikkert

Krever Cloudflare-konto, Node.js 22+, tilgang til dette repositoryet og en OpenAI-prosjektnøkkel. **Ikke lim OpenAI-nøkkelen inn i en samtale, kildekoden, GitHub Pages, en nettleserinnstilling eller en vanlig tekstvariabel.**

Den enkleste sikre løsningen er å deploye Worker-koden først og deretter legge nøklene inn direkte i Cloudflare Dashboard. Koden har `keep_vars = true`, så dashboard-variabler bevares ved senere Wrangler-deploy. Worker-hemmeligheter bevares uansett og blir ikke skrevet tilbake til kildekoden.

1. Opprett en Cloudflare Turnstile-widget med tillatt vertsnavn **`rolfss.github.io`**. Ta vare på:
   - **Site key** – offentlig, ikke hemmelig.
   - **Secret key** – hemmelig.
2. Åpne en terminal i `noark-api` og kjør:

   ```sh
   npx wrangler@4 login
   npx wrangler@4 deploy
   ```

   Første utrulling kan være ukonfigurert; det er tilsiktet. Kopier Worker-adressen som slutter på `.workers.dev`.
3. I **Cloudflare Dashboard → Workers & Pages → noark-luna-api → Settings → Variables and Secrets → Add** legger du inn tre verdier:

   | Navn | Type | Verdi |
   |---|---|---|
   | `OPENAI_API_KEY` | **Secret** | OpenAI-prosjektnøkkelen din |
   | `TURNSTILE_SECRET_KEY` | **Secret** | Turnstile secret key |
   | `TURNSTILE_SITE_KEY` | Text / vanlig variabel | Turnstile site key |

   Velg **Deploy**. Secret-verdiene skjules etter lagring og er bare tilgjengelige for Worker-koden.
4. Fra repository-roten kjører du, med din faktiske Worker-adresse:

   ```sh
   node noark-api/configure.mjs https://DIN-WORKER.workers.dev
   ```

   Dette setter bare offentlig bakendeadresse og den tilhørende `connect-src`-regelen. Commit og push `noark-assistent/api-config.mjs` og `noark-assistent/index.html`. Den eksisterende GitHub Pages-jobben publiserer klientendringen.
5. Kontroller `https://DIN-WORKER.workers.dev/api/health`: `configured` skal være `true`, `model` skal være `gpt-6-luna`, og `dailyBudgetUsd` skal være `2`. Åpne appen, slå på Luna, fullfør sikkerhetskontrollen og still ett testspørsmål. Kontroller svar, kilder, relevansprosenter og faktisk API-forbruk.

### Alternativ: legg hemmelighetene inn fra terminal

Hvis du heller vil bruke Wrangler enn Cloudflare Dashboard:

```sh
npx wrangler@4 secret put OPENAI_API_KEY
npx wrangler@4 secret put TURNSTILE_SECRET_KEY
```

Wrangler ber deg lime inn hver verdi interaktivt. Nøkkelen skal ikke skrives inn i kommandoen, lagres i repoet eller legges i `wrangler.toml`.

Luna slås på eksplisitt i nettleseren. En delt spørsmålslenke eller en sidevisning utløser ikke automatisk et betalt modellkall. Standardklienten fungerer fortsatt med lokalt søk når bakenden er deaktivert.

## Kostnadsvern for utprøvingen

Standardgrenser i `worker.mjs`:

| Grense | Verdi |
|---|---:|
| Samlet prøvebudsjett, uten automatisk nullstilling | USD 6 |
| Kalender­måned, UTC | USD 6 |
| Kalenderdag, UTC | **USD 2,00** |
| Forespørsler per IP-identitet | 5/minutt og 60/dag |
| Forespørsler for hele appen | 250/dag |
| Samtidige modellkall | 4 |
| Maksimal modellutdata, inkludert resonnering | 8 192 tokens |

Hele den øvre estimerte forespørselskostnaden reserveres i en varig, atomisk transaksjon **før** modellkallet. Bekreftet tokenforbruk frigir ubrukt reserve. Ved ukjent utfall beholdes reservasjonen; appen prøver ikke automatisk igjen. Derfor kan modellen stoppe før et nominelt budsjett er brukt opp.

Regnskapet bruker konservativ pris på USD 0,25 per million inputtokens, inkludert mulig cache-skriving, og USD 1,20 per million outputtokens. Ordinær Luna-inputpris var USD 0,20 ved kontroll 7. september 2026. Cache-rabatt utnyttes ikke i budsjettanslaget.

**Dette er appens lokale, konservative sperre – ikke en garanti for OpenAI-kontoens samlede regning.** Andre apper/nøkler, hosting, skatter og fremtidige prisendringer er ikke dekket. Kontroller prisene før aktivering og ved modellendringer. OpenAIs prosjektbudsjett er en varslingsgrense, ikke en hard stopp. Koden endrer ikke fakturering eller automatisk påfyll på kontoen.

Ikke slett, gi nytt navn til eller opprett flere budsjettobjekter for å «starte på nytt»: nye instanser har separate budsjetter. De samlede seks dollarene gjenåpnes ikke ved månedsskiftet; en større utprøving krever en bevisst endring i `LIMITS`.

## Sikkerhetsmodell

Bakenden bestemmer modell, instrukser, kildegrunnlag og tokenbegrensninger. Brukeren kan ikke velge vilkårlige API-endepunkter, modeller eller kildetekster. Nettlesertilgang avgrenses med CORS, men CORS er ikke autentisering: Turnstile valideres på serveren med riktig vertsnavn og handling, og alle kostnader begrenses sentralt.

Budsjettregisteret lagrer summer, forespørsels-ID-er og daglig saltede IP-avtrykk, ikke spørsmål, svar, rå IP-adresser eller nøkler. Misbruksvern er ikke full brukerautentisering; en offentlig app kan få sitt lille budsjett brukt opp av andre. En liten prøve bør derfor vurderes før bred annonsering.

Kun kilde-ID-er fra serverens egen katalog tillates. Modellens lenker aksepteres aldri. Siteringskontrollen kan ikke bevise at alle faglige påstander er riktige. Relevansskårer er heller ikke kalibrerte sannsynligheter. Spørsmål og kildeposter sendes til OpenAI med `store: false`; leverandørens øvrige datavilkår og sikkerhetslogger gjelder fortsatt.

## Kontroller etter aktivering

### Svarrettelse 8. september 2026

Den publiserte serveren rapporterte kildeversjon `2026-09-02`, mens klienten hadde `2026-09-07`. Dette utløste lokale standardsvar selv når Luna var valgt for spørsmål om nyere veiledere. Klienten viser nå en uttrykkelig feil i denne situasjonen. En oppdatering av GitHub Pages alene oppdaterer ikke Cloudflare-serveren.

Serveroppdateringen gir situasjonstilpassede instrukser, opptil seks kildebelagte avsnitt, rom for begrunnelser og praktiske råd, bedre temaoppfølging og 8 192 tokens til resonnering og svar. Det utføres fortsatt maksimalt ett betalt modellkall per forespørsel. Dags-, måneds- og prøvebudsjettene er uendret; utdatareservasjonen per forespørsel er høyere.

Publiser med `npx wrangler@4 deploy` fra `noark-api`. Behold eksisterende Worker, hemmeligheter, bindingen `LUNA_GATE`, klassen `LunaGate`, migrasjonen `v1` og objektet `noark-global-budget-v1`. Kontroller at `/api/health` viser `answerVersion: "2026-09-27-gpt6-luna-v1"`, `corpusVersion: "2026-09-26"`, `configured: true`, `model: "gpt-6-luna"`, `reasoning: "medium"` og `dailyBudgetUsd: 2`.

Regresjonstestene dekker kildeversjonskonflikten, bevaring av tema ved sjekklister og oppfølging, lengre kildebelagte svar, validering helt frem til klienten og uttrykkelige feil ved KI-svikt. Modellkallene er simulerte. En bestått test eller et konfigurert helseendepunkt dokumenterer ikke faktisk modelltilgang eller faglig kvalitet; kontroller dette med et ordinært Luna-spørsmål etter utrulling.

Kjør `npm run validate` i `noark-assistent`. Kontroller deretter manuelt korte svar, åpne originale kilder og sammenlign relevansskårer for eksempelvis «Hva er systemID?», «Hva krever krav 8.15?», et oppfølgingsspørsmål, et spørsmål utenfor arkivområdet og et spørsmål hvor kandidatpostene bare dekker deler av behovet. Beste treff skal ikke rutinemessig få 100 prosent. Prøv kopiering og kildelenker fra både siste og tidligere svar.

Enhetstestene bruker simulerte API-kall. De dokumenterer programatferd, ikke modellens faktiske faglige nøyaktighet eller en ferdig produksjonsutrulling. Full nettleser-/mobiltest og live modelltest gjenstår etter utrulling.

## Offisiell dokumentasjon

- [Luna-modell, priser og støttede funksjoner](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [OpenAI API-nøkler: sikker bruk](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [OpenAI: datakontroller](https://developers.openai.com/api/docs/guides/your-data)
- [Cloudflare Worker-hemmeligheter](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Wrangler-konfigurasjon og `keep_vars`](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Durable Objects: priser og gratisgrenser](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Turnstile: servervalidering](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
