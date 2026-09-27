# NOARK med JEV, Luna og Bonsai

Appen søker i sitt kuraterte kildegrunnlag, lar JEV velge opptil 12 av 24
kandidatposter og lar GPT-6 Luna skrive et svar med kontrollerte kilde-ID-er.
JEV velger kilder; det er ikke en garanti for at svaret er riktig. Semantisk
kontroll av påstander er fortsatt bare en evaluering, fordi den første målingen
feilaktig avviste en støttet påstand.

Brukeren kan velge Bonsai på eierens PC direkte. Ellers brukes Bonsai én gang
når Luna svarer HTTP 429 eller 503. En ufullstendig respons, feilaktige
kildehenvisninger, avvisning eller innloggingsfeil utløser ikke et nytt modellforsøk.
ChatGPT/Codex-kvoten er ikke appens API-kvote.

## Før aktivering

- Behold `OPENAI_API_KEY`, Turnstile-hemmeligheten, de eksisterende budsjettobjektene
  og migrasjonene. Ikke opprett et nytt budsjettregister.
- Legg `TYPESAFE_API_KEY` inn som **Secret** i Cloudflare → Workers & Pages →
  `noark-luna-api` → Settings → Variables and Secrets. Ikke bruk en tekstvariabel,
  GitHub, chatten eller nettleserens lokale lagring.
- `JEV_ENABLED=true` sammen med gyldig nøkkel gjør JEV tilgjengelig. Uten
  gjeldende samtykke (`2026-09-26-jev-v1`) brukes bare de opprinnelige kildesøkene.
- `BONSAI_ENABLED=true` krever den interne service-bindingen `BONSAI` til
  `second-rolf-api` sitt navngitte `NoarkBonsai`-endepunkt. Det eksisterende
  autentiserte, utgående sambandet til PC-en deles, med egne NOARK-regler.
  Offentlige Second Rolf-endepunkter beholder sitt formål og sine regler.
- NOARK-korpus og protokollversjon må samsvare i Worker og lokal connector.
  Den lokale modellen er låst til `Bonsai-2-27B-PQ2_0` på `127.0.0.1:8099`.
  Ingen ny brannmurregel, innkommende port eller sikkerhetsunntak trengs.

## Samtykke og nedetid

Lokalt kildesøk sender ikke spørsmål til noen modell. KI-valget beskriver
OpenAI, eventuell TypeSafe-behandling og eventuell behandling på eierens PC.
Gamle klienter gir ikke automatisk samtykke til nye mottakere. Samtykket til
lagring av spørsmål er fortsatt et separat valg; eksisterende innstilling for
logging bevares ved utrulling.

JEV-feil beholder det opprinnelige kildeutvalget og gir en synlig status.
Bonsai-svar merkes som Bonsai, og bare kjente kilde-ID-er kan bli klikkbare lenker.
Formatposter må beholde avtale- og konverteringsforbehold. Hvis ingen modell kan
gi et gyldig svar, vises en klar feil og kildesøket er fortsatt tilgjengelig.

## Kostnadsgrenser

Samme varige register håndhever fortsatt USD 2 per dag, USD 6 per måned og
USD 6 totalt prøvebudsjett. JEV og Luna reserveres før nettverkskall. Bekreftet
tokenbruk avregnes samlet; ukjent forbruk beholder reservasjonen. JEV-beregningen
bruker en konservativ regnskapsmargin på én mikro-USD per inn- og ut-token, ikke
en påstand om TypeSafes faktiske pris. Det finnes ingen garanti for leverandørens
faktura fra et lokalt estimat; behold også leverandørens egne kostnadsgrenser.

Hvis appbudsjettet er nådd, kan Bonsai svare uten JEV- eller OpenAI-kall etter
samtykke. Turnstile, duplikatkontroll, brukergrenser og samtidighetsgrenser gjelder
også gratis lokal inferens. PC-en må være på, modellen klar og forbindelsen aktiv.

## Verifikasjon

Kjør `npm run validate` fra `noark-assistent`, og Second Rolf-testene før den
delte connectoren oppdateres. Kontroller bygg med Wrangler dry-run for begge
Workers. Publiser den kompatible Second Rolf-serveren og connectoren før NOARK
bruker service-bindingen. Behold forrige connector-snapshot for tilbakeføring.

Deretter må `/api/health` vise riktig kilde- og svarversjon, `retrieval.enabled`
og `fallback.available`. Dette beviser konfigurasjon, ikke svarenes kvalitet.
Test faktiske spørsmål i nettleseren med både Luna og Bonsai, med korrekte
kilder, oppfølgingsspørsmål, uklare spørsmål og formatforbehold. Simuler
kvotefeil i testene; ikke tøm API-kreditt for å teste reservefunksjonen.

Utviklingsmålingen 26.09.2026: 14 fullførte TypeSafe-kall uten feil. Forventet
kilde først i 11/11 målbare spørsmål, mot 7/11 for ordsøket. Kildekontroll var
korrekt i 2/3 tilfeller. Luna-sammenligning og holdout må rapporteres separat;
disse små målingene beviser ikke juridisk riktighet eller allmenn kvalitet.

### Publisert løsning kontrollert 27.09.2026

PR #39 publiserte grensesnittet med GPT-6 Luna. Offentlig helsekontroll bekreftet
`gpt-6-luna`, svarversjon `2026-09-27-gpt6-luna-v1`, aktiv JEV og tilgjengelig
Bonsai. Spørsmålslogging var deaktivert; budsjettene var fortsatt USD 2/6/6.

Ni ekte nettleserkall gjennom ordinær Turnstile kontrollerte JEV med begge
svarmodellene. Luna svarte med kilder om systemID, beholdt temaet i oppfølging,
avgrenset PDF/A-3-aksept til riktig mottaker og avsto fra ukjente produktmenyer.
Bonsai beholdt SIARD-vilkårene og avsto også fra ukjente produktmenyer.

Ett tidlig Bonsai-svar svekket «skal ikke» til «bør ikke» i et støttepunkt.
PR #44 presiserte at instruksjonen skal bevare kravstyrke og avgrense unntak.
Etter oppdatering av PC-connectoren beholdt nye svar «skal ikke» for systemID
og mappeID, og skilte disse fra unntaket for registreringsID. Dette er en
kontrollert forbedring i eksemplene, ikke en garanti mot nye tolkningsfeil.

Automatisk reserve ved kvote-/kapasitetsfeil og oppbrukt budsjett er kontrollert
med simulerte leverandørsvar og budsjettgrenser i testene. Produksjonskontoens
kreditt ble ikke tømt for å fremprovosere reservebytte. Den private Bonsai-ruten
er separat bekreftet med ekte nettlesersvar.
