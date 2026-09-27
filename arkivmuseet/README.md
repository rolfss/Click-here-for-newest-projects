# Arkivmuseet

**Sporene staten ikke hadde råd til å miste.** Et museum i sanntids-3D om offentlig dokumentasjon, offentlighet og etterprøvbarhet.

[Besøk museet](https://rolfss.github.io/Click-here-for-newest-projects/arkivmuseet/) · [Full tekstversjon](https://rolfss.github.io/Click-here-for-newest-projects/arkivmuseet/tekst.html)

Fem kildebelagte utstillinger: Osen kommune, Tokke kommune, Sivilombudsmannens sak 2008/171, Hanekleivtunnelen og Norsk pasientskadeerstatning. Fem interaktive lederoppdrag knytter kildefunnene til hverdagen: undersøk dokumentasjon, velg handling, spol frem til mulige følger og prøv igjen. Øvelsesoversikten viser fem læringsmerker; merkene måler bare gjennomførte øvelser. Lederens rom tilbyr først en praktisk lederbestilling. Fire ekstra scenarioer kan åpnes frivillig. Ingen konto, server, analyseverktøy eller runtime-KI.

## Besøket

Oppgavene er redaksjonelt gjennomgått 27. september 2026. Hver lederøvelse viser læringsmål og forklarer forbindelsen til den virkelige saken. Tiltak som bare løser en del av problemet, får begrunnet delskår og et konkret råd om videre oppfølging. Historiske funn, dagens regler og tenkte følger holdes atskilt; se [redaksjonelt grunnlag](./EDITORIAL-NOTES.md).

Læringsskåren vurderer **kildegrunnlag, ledergrep og etterprøvbar oppfølging**, med 0–2 poeng per kriterium. Maksimum er 6 per oppgave og 30 for alle fem. Profilen viser hvor mange oppgaver som er vurdert, første gjennomgang og nyeste gjennomgang. Første sporvalg inngår i første skår; siste skår bruker det gjennomgåtte forsøket. Ny prøve erstatter skåren, uten å legge til poeng. Læringsmerker beholdes når du sammenligner og prøver igjen. Eldre lagret fremdrift gir ingen oppdiktet førstegangsskår. Fart og ferdigheter i 3D gir ingen poeng. Skåren er tilbakemelding i en øvelse, ikke en test av lederevne eller virksomhetens etterlevelse.

Aurora-etterforskningen har en egen datert tidslinje. Oppsummert gjennomføring og kvaliteten på ledervalgene vises separat, også i den nedlastede rapporten. Alle deloppgaver kan være gjennomgått mens konkrete ledergrep fortsatt mangler.

- **Gå inn i museet:** besøket starter i den store hovedhallen med fri bevegelse, også når du har lagret fremdrift. Gå gjennom portalene eller velg et rom fra romoversikten. Åpne utstillingen når du er klar til å lese og prøve et oppdrag. Omvisning velges inne i museet.
- **Utforsk rommene:** fem oppdrag med 20 undersøkbare sporkort og 15 ulike handlingsforløp. Konsekvensene er tydelig merket som tenkte; historiske funn og forbehold finnes ved siden av.
- **Prøv valgene:** hvert forløp har tre tidspunkt. Spol frem, sammenlign med et alternativ og gå tilbake. Ingen tidsfrist eller poeng for fart.
- **Øvelser:** fremdrift og valg lagres bare i denne nettleseren. Skadet eller utilgjengelig lagring blokkerer ikke besøket. Reisen kan nullstilles etter bekreftelse.
- **Min lederbestilling:** velg tiltak, ansvarlig rolle og oppfølgingsdato. Last ned tekst eller skriv ut / lagre PDF. Ingen opplysninger sendes til en server.
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

Hovedruten er **virkelige saker → valgfrie lederøvelser → ett praktisk tiltak**. Et rom åpner den kildebaserte utstillingen først. «Neste rom» følger museumsruten uavhengig av øvelsesmerker. Besøkende kan nå avslutningen uten å svare på en quiz.

Besøksplanen er en sammenfoldet bunnlinje, ikke et kort midt i 3D-rommet. Den viser én kontekstuell hovedhandling. Utvid planen for omvisning, lyd, fremdrift og fordypning. Menyen er alltid tilgjengelig. Bevegelsesknappene beholder trykkflater på minst 44 × 44 CSS-piksler og forsvinner ikke uten at en annen flate tar over.

**Det manglende grunnlaget** er en valgfri, fiktiv etterforskning av prosjekt Aurora. Den har egen fremdrift og forklares før oppstart. Det tidligere navnet «Sak 17» var et internt fiksjonsnummer, ikke en historisk sak eller nummereringen av museets rom. Lagringsnøkler og gamle tekstlenker beholdes. Se [SAK17.md](./SAK17.md) og [UX-NOTES.md](./UX-NOTES.md).

## Utvikling

Node 22.12+ eller 24+, pnpm 11.19.0. Installer med `pnpm install --frozen-lockfile`. Start med `pnpm dev`. Kjør `pnpm test` og `pnpm build`. Produksjonen kan prøves med `pnpm preview`. Mens forhåndsvisningen kjører, tester `pnpm test:browser`, `pnpm test:investigation` og `pnpm test:visit-ui` den virkelige nettleseropplevelsen. Den siste kontrollerer blant annet sammenfolding, tastaturfokus, leserute uten quizkrav, 320–430 piksler brede telefoner, landskap og større tekst. Resultater og skjermbilder lagres i GitHub Actions som `museum-qa`; se siste kjøring for faktisk status.

Vite bruker relativ basepath (`./`), slik at JavaScript, stilark og museumsressurser fungerer også etter at GitHub-repositoriet får nytt navn. Lokal forhåndsvisning åpnes på `http://127.0.0.1:4196/`. GitHub Pages-arbeidsflyten installerer avhengigheter fra låsefil, tester, bygger og kopierer bare `dist/` til `_site/arkivmuseet/`. De øvrige prosjektene beholder sine vanlige løp.

## Innhold og nye utstillinger

`cases/cases.json` er publiseringsgrunnlaget. Påstander har kilde-ID, lokalisering og type (`fact`, `risk`, `interpretation`). `cases/legal-sources.json` inneholder felles rettskilder. `cases/leader-scenarios.json` har de opprinnelige fiktive ledervalgene. `cases/missions.json` beskriver de fem nye oppdragene; `src/journey-state.ts` håndterer validerbar fremdrift, bevisvurdering og eksport. `src/journey.ts` kobler oppdragene til museumsreisen.

`scripts/validate-cases.mjs` stanser bygging ved manglende kilder, usporbare påstander, avvikende sitater, dupliserte ID-er eller ufullstendige saksdata. Valideringen beviser strukturell sporbarhet, ikke at en tolkning er riktig. Kildekritikk må fortsatt gjøres redaksjonelt.

Legg til data etter samme skjema, velg en installasjonstype og angi romposisjon. De seks eksisterende romposisjonene er forhåndsbygget. Flere fysiske fløyer krever utvidelse av romoppsettet og navigasjonsgrensene i `src/world.ts`; innholdet kan utvides uten å modellere nye gjenstander. `scripts/curate-cases.mjs` er et redaksjonelt engangsverktøy for de første fem sakene og kjøres ikke automatisk ved bygging. Endre JSON direkte ved senere kuratering.

## 3D og ytelse

Én motor: Three.js, TypeScript og Vite. Modulære Blender-modeller eksporteres med `blender --background --factory-startup --python scripts/make-assets.py`. Ferdig GLB er inkludert; Blender trengs ikke i Pages-byggingen.

Modellpakken er under 1,5 MB ukomprimert og inneholder originale farge- og normalkart for kalkstein og eik. 3D-koden lastes som separat modul; samlet komprimert JavaScript er ca. 221 kB. Kolonner og gulv er instansierte; statisk geometri slås sammen per materiale. Rominstallasjoner bygges ved nærhet og skjules på avstand. De fire historiske bildene er uendrede, lokale WebP-filer på til sammen omtrent 750 kB. Ingen bilde-CDN eller ekstern forespørsel trengs under besøket. Fototeksturer lastes ved rombesøk.

Den visuelle oppgraderingen fra september 2026 gir hallen steinfuger, kassettak, messingarmaturer, glassoverlys og mer detaljerte arkivmøbler. Blender-modellene har avrundede kanter, utskårne søyler, skuffefronter, håndtak og papirlag. Dette er fortsatt scenografi, ikke nye historiske gjenstander eller kilder. Romposisjoner, kollisjoner, oppdrag, tekst og lagring er beholdt.

Store skjermer med presis peker får GTAO-kontaktskygger og fireprøvers MSAA, med begrenset intern oppløsning. Berøringsenheter, vinduer under 1000 piksler og «Lavere · spar strøm» bruker den enklere renderingen; sistnevnte slår også av solskygger. Kvalitetsbytte og endret vindusstørrelse gjelder umiddelbart. Hovedhallen har i tillegg lette, instansierte kontaktskygger. Stillestående lese- og pausevisninger tegnes bare på nytt ved behov.

Automatisk maskinvaremåling og nettleseremulering er ikke en garanti for alle telefoner. Kontrollene kjøres i Chromium med berørings- og skjermemulering; fysisk iOS/Safari må prøves separat. Full tekst gir et varig alternativ ved manglende grafikkstøtte.

`pnpm test:learning` kontrollerer hele lederøvelsen i nettleseren, delskår, gjentakelse, gjenoppretting, mobilvisning og eksport. Den kjøres også i GitHub Actions. Tekstversjonene viser de samme vurderingskriteriene og forklaringene uten JavaScript.

Se [SOURCES.md](./SOURCES.md), [LEGAL-NOTES.md](./LEGAL-NOTES.md), [EDITORIAL-NOTES.md](./EDITORIAL-NOTES.md), [CREDITS.md](./CREDITS.md) og [VALIDATION.md](./VALIDATION.md).
