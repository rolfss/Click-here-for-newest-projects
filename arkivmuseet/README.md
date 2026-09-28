# Arkivmuseet

**Sporene vi bevarer. Mulighetene vi skaper.** Et museum for ledere om hva arkiver gjør mulig, hva som står på spill uten brukbar dokumentasjon, og hvilke krav som gjelder i Norge.

[Besøk museet](https://rolfss.github.io/Click-here-for-newest-projects/arkivmuseet/) · [Full tekstversjon](https://rolfss.github.io/Click-here-for-newest-projects/arkivmuseet/tekst.html)

Denne grenen er et endringsforslag; lenkene ovenfor viser publisert versjon, ikke nødvendigvis grenens innhold.

## Muligheter, risiko og ledergrep

«Hvorfor arkiv?» forklarer tre muligheter: handle med kunnskap, gjøre rettigheter brukbare og beholde muligheter for fremtiden. Hver mulighet har en fallgruve og et spørsmål til ledelsen. Alle fem saker får et eget lederperspektiv med mulighet, risiko og spørsmål. Et konkret tiltak kan legges i lederbestillingen direkte fra saken, uten fullførte øvelser.

En kildebelagt oversikt forklarer seks norske krav og skiller lovkrav fra museets forslag til oppfølging. Virkeområde, kommunal internkontroll, innsynsunntak og særskilt ikraftsetting er synlige avgrensninger. `leder.html` gir hovedinnholdet uten JavaScript; `tekst.html` gir hele utstillingen med de samme lederperspektivene og regelverksoversikten. Se [LEADER-PURPOSE.md](./LEADER-PURPOSE.md) for kildekontroll og avgrensning.

Fem kildebelagte utstillinger: Osen kommune, Tokke kommune, Sivilombudsmannens sak 2008/171, Hanekleivtunnelen og Norsk pasientskadeerstatning. Fem interaktive lederoppdrag knytter kildefunnene til hverdagen: undersøk dokumentasjon, velg handling, spol frem til mulige følger og prøv igjen. Øvelsesoversikten viser fem læringsmerker; merkene måler bare gjennomførte øvelser. Lederens rom tilbyr først en praktisk lederbestilling. Fire ekstra scenarioer kan åpnes frivillig. Ingen konto, server, analyseverktøy eller runtime-KI.

## Besøket

- **Gå inn i museet:** besøket starter i den store hovedhallen med fri bevegelse, også når du har lagret fremdrift. Gå gjennom portalene eller velg et rom fra romoversikten. Åpne utstillingen når du er klar til å lese og prøve et oppdrag. Omvisning velges inne i museet.
- **Utforsk rommene:** fem oppdrag med 20 undersøkbare sporkort og 15 ulike handlingsforløp. Konsekvensene er tydelig merket som tenkte; historiske funn og forbehold finnes ved siden av.
- **Prøv valgene:** hvert forløp har tre tidspunkt. Spol frem, sammenlign med et alternativ og gå tilbake. Ingen tidsfrist eller poeng for fart.
- **Øvelser:** fremdrift og valg lagres bare i denne nettleseren. Skadet eller utilgjengelig lagring blokkerer ikke besøket. Reisen kan nullstilles etter bekreftelse.
- **Min lederbestilling:** velg tiltak, ansvarlig rolle og oppfølgingsdato. Last ned tekst, skriv ut / lagre PDF, eller eksporter valgte tiltak med dato til en kalenderfil du importerer selv. Ingen opplysninger sendes til en server.
- **Besøk uten 3D:** alle oppdrag og lederbestillingen kan brukes uten WebGL. Den fullstendige tekstversjonen har også oppdrag, alle alternativer, bilder og kilder uten JavaScript.
- Fotografier fra Hanekleivtunnelen og Dalen i Tokke og faksimiler fra Osen- og NPE-rapportene er inkludert lokalt. Stedsbilder er merket som stedsbilder. Se `public/assets/cases/credits.json`.

- WASD: gå. Dra på rommet: se. Piltaster: gå/snu. E eller klikk på installasjonen: åpne.
- Dobbeltklikk: valgfri låsing av musepeker. Escape: meny og pause.
- Guidet visning eller romoversikt: flytt direkte til en utstilling uten førstepersonskontroller.
- Berøring: egne bevegelsesknapper og dra for å se.
- Menyen har redusert bevegelse, følsomhet, volum, tekststørrelse og lavere bildekvalitet. Lokale preferanser lagres i nettleseren.
- Lyden er valgfri. Ingen faglig informasjon formidles bare gjennom lyd. Tekst beskriver romlyd og fottrinn.
- Tekstversjonen virker uten WebGL og JavaScript og har alle historier, kildeavgrensninger, regler og lederscenarioer.

## En tydeligere museumsreise

Hovedruten er **virkelige saker → muligheter og risiko → ett praktisk tiltak**. Lederøvelsene er valgfrie sidespor. Et rom åpner den kildebaserte utstillingen først. «Neste rom» følger museumsruten uavhengig av øvelsesmerker. Besøkende kan nå avslutningen uten å svare på en quiz.

Besøksplanen er en sammenfoldet bunnlinje, ikke et kort midt i 3D-rommet. Den viser én kontekstuell hovedhandling. Utvid planen for omvisning, lyd, fremdrift og fordypning. Menyen er alltid tilgjengelig. Bevegelsesknappene beholder trykkflater på minst 44 × 44 CSS-piksler og forsvinner ikke uten at en annen flate tar over.

**Det manglende grunnlaget** er en valgfri, fiktiv etterforskning av prosjekt Aurora. Den har egen fremdrift og forklares før oppstart. Det tidligere navnet «Sak 17» var et internt fiksjonsnummer, ikke en historisk sak eller nummereringen av museets rom. Lagringsnøkler og gamle tekstlenker beholdes. Se [SAK17.md](./SAK17.md) og [UX-NOTES.md](./UX-NOTES.md).

## Utvikling

Node 22.12+ eller 24+, pnpm 11.19.0. Installer med `pnpm install --frozen-lockfile`. Start med `pnpm dev`. Kjør `pnpm test` og `pnpm build`. Produksjonen kan prøves med `pnpm preview`. Mens forhåndsvisningen kjører, tester `pnpm test:browser`, `pnpm test:investigation` og `pnpm test:visit-ui` den virkelige nettleseropplevelsen. Den siste kjører også `test:leadership`. Denne kontrollerer den nye lederreisen, kildevisning, eksport, manglende WebGL/lagring, JavaScript-fri lesing og flytting av det ferdige bygget. Besøkskontrollen kontrollerer blant annet sammenfolding, tastaturfokus, leserute uten quizkrav, 320–430 piksler brede telefoner, landskap og større tekst. Resultater og skjermbilder lagres i GitHub Actions som `museum-qa`; se siste kjøring for faktisk status.

Bygget bruker relativ base (`./`) og kan ligge under det nye repositorynavnet uten hardkodede asset-stier. `pnpm preview` bruker lokal rot på `http://127.0.0.1:4196/`; nettlesertesten serverer også det samme `dist/` under `/Click-here-for-newest-projects/arkivmuseet/` uten redirect. Dette er ikke en endring av selve GitHub Pages-konfigurasjonen. GitHub Pages-arbeidsflyten installerer avhengigheter fra låsefil, tester, bygger og kopierer bare `dist/` til `_site/arkivmuseet/`. De øvrige prosjektene beholder sine vanlige løp.

## Innhold og nye utstillinger

`pnpm content` genererer tekstsidene før utvikling, enhetstester og produksjonsbygg. `public/tekst.html`, `public/leder.html` og `public/leader-guide.css` er genererte og ignoreres av Git, på samme måte som etterforskningens tekstsider. Rediger JSON, renderer og stilark, ikke genererte sider.

`cases/leader-guide.json` er det felles grunnlaget for muligheter, fem saksperspektiver og seks rettslige hovedtrekk. `src/leader-guide.ts` gjør all HTML-escaping og kildekontroll i en ren renderer som brukes i både museet og tekstgeneratorene. Den validerer struktur, ikke juridisk etterlevelse.

`cases/cases.json` er publiseringsgrunnlaget. Påstander har kilde-ID, lokalisering og type (`fact`, `risk`, `interpretation`). `cases/legal-sources.json` inneholder felles rettskilder. `cases/leader-scenarios.json` har de opprinnelige fiktive ledervalgene. `cases/missions.json` beskriver de fem nye oppdragene; `src/journey-state.ts` håndterer validerbar fremdrift, bevisvurdering og eksport. `src/journey.ts` kobler oppdragene til museumsreisen.

`scripts/validate-cases.mjs` stanser bygging ved manglende kilder, usporbare påstander, avvikende sitater, dupliserte ID-er eller ufullstendige saksdata. Valideringen beviser strukturell sporbarhet, ikke at en tolkning er riktig. Kildekritikk må fortsatt gjøres redaksjonelt.

Legg til data etter samme skjema, velg en installasjonstype og angi romposisjon. De seks eksisterende romposisjonene er forhåndsbygget. Flere fysiske fløyer krever utvidelse av romoppsettet og navigasjonsgrensene i `src/world.ts`; innholdet kan utvides uten å modellere nye gjenstander. `scripts/curate-cases.mjs` er et redaksjonelt engangsverktøy for de første fem sakene og kjøres ikke automatisk ved bygging. Endre JSON direkte ved senere kuratering.

## 3D og ytelse

Én motor: Three.js, TypeScript og Vite. Modulære Blender-modeller eksporteres med `blender --background --factory-startup --python scripts/make-assets.py`. Ferdig GLB er inkludert; Blender trengs ikke i Pages-byggingen.

Modellpakken er ca. 582 kB ukomprimert. 3D-koden lastes som separat modul. Se byggloggen for målte filstørrelser; lederoversikten ligger i den vanlige applikasjonsmodulen, ikke i en ny nettjeneste. Kolonner og gulv er instansierte; statisk geometri slås sammen per materiale. Rominstallasjoner bygges ved nærhet og skjules på avstand. Bildeoppløsning begrenses; skygger kan slås av med lavere bildekvalitet. Materialdetaljer og lyd genereres lokalt. De fire bildene er lokale WebP-filer på til sammen omtrent 750 kB. Ingen bilde-CDN eller ekstern forespørsel trengs under besøket. Fototeksturer lastes ved rombesøk.

Automatisk maskinvaremåling og nettleseremulering er ikke en garanti for alle telefoner. Kontrollene kjøres i Chromium med berørings- og skjermemulering; fysisk iOS/Safari må prøves separat. Full tekst gir et varig alternativ ved manglende grafikkstøtte.

Se [SOURCES.md](./SOURCES.md), [LEGAL-NOTES.md](./LEGAL-NOTES.md), [CREDITS.md](./CREDITS.md) og [VALIDATION.md](./VALIDATION.md).
