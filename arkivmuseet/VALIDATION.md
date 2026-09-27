# Validering av oppgaver og læringsskår

27. september 2026. Produksjonsbygg testet med installert Microsoft Edge på Windows, Node og Playwright.

- 54 automatiske tester bestått. De dekker blant annet alle kombinasjoner av sporkort, vurderingskriterier, første/nyeste skår, øvre poenggrense, repetisjon, gjenoppretting fra eldre lagring og alle 64 kombinasjoner av Auroras ledervalg.
- Kilde- og innholdsvalidering, TypeScript og Vite-bygg bestått. Alle fem historiske hovedkilder og oppgitte lovbestemmelser er kontrollert på nytt; se [EDITORIAL-NOTES.md](./EDITORIAL-NOTES.md).
- 22 nye nettleserkontroller bestått på det endelige bygget. De følger alle fem oppgavene gjennom feil sporvalg, delvis tiltak, sammenligning, forbedring, læringsmerke og gjenopptakelse. De kontrollerer også 320/390 px, dialog- og tastaturfokus, unike ID-er i kildevisningen, sladdingens tilgjengelige navn, lederbestilling og ulike Aurora-resultater. Resultater og skjermbilder finnes i `qa-learning` og GitHub-artifaktet `museum-qa`.
- Eksisterende museum-, etterforsknings- og besøkskontroller bestod henholdsvis 61, 47 og 72 kontroller. De ble kjørt før siste avgrensede rettelser av dialogfokus, scenariofokus og sladdingens tilgjengelige navn; disse verifiseres særskilt i læringstesten og samlet i GitHub Actions.
- Testene avdekket og verifiserte en rettelse av en oppstartsfeil: Tidlig bruk uten 3D kan ikke lenger bytte materialer mens Three.js kompilerer dem.

Skjermbilder er visuelt kontrollert. Skåren er redaksjonelt utformet læringsstøtte, ikke en validert kompetansetest. Mobilbreddene er emulert; fysisk iOS/Safari og en full WCAG-revisjon er ikke gjennomført. Ingen produksjonspublisering inngår i kontrollen.

## Historikk: visuell oppgradering

26. september 2026. Kontrollert med Node 24 og installert Microsoft Edge via Playwright på Windows.

- 40 automatiske tester bestått. Navigasjon gjennom alle seks portaler, kollisjoner, bevegelsestiming, alle oppdrag, lagring og kildesporbarhet er kontrollert.
- TypeScript og Vite-produksjonsbygg bestått.
- Produksjonsbygget på `http://127.0.0.1:4196/`: 61 museumskontroller, 47 etterforskningskontroller og 72 besøks-/grensesnittkontroller bestått. Ingen registrerte JavaScript-feil eller manglende museumsressurser.
- Egne integrerte kontroller viser GTAO på stor skrivebordsskjerm, uten GTAO med lav bildekvalitet, tilbake til GTAO ved normal kvalitet og uten GTAO på emulert berøringsenhet.
- Originale saksdata, kilder, kildebilder, tekstversjon, spill- og lagringsmoduler er uendret. Faglige påstander er ikke redigert eller vurdert på nytt som del av den visuelle oppgraderingen.
- Blender 4.5.9 LTS eksporterte syv navngitte prototyper med kompatible dimensjoner. Modellpakken er 1 285 736 byte, har 22 mesh-primitiver og fire innebygde teksturer uten eksterne ressurslenker. Prototypene inneholder samlet 32 808 trekanter før instansiering.
- JavaScript er ca. 221 kB gzip. Modellpakken og renderingskostnaden er større enn i første utgave; telefoner og strømsparingsvalg beholder en enklere renderingsvei. Tegnekall og trekanter i diagnostikken teller nå alle renderingspass, også skygger og kontaktskygger, og kan ikke sammenlignes direkte med gamle tall for siste pass.

Skjermbilder av inngang, hovedhall, utstilling og mobil er visuelt kontrollert. Mobilprøvene er emulering; fysisk iOS/Safari og en full WCAG-revisjon er ikke gjennomført.

## Historikk: lederreisen · versjon 1.1

8. september 2026.

- 12 automatiske tester bestått, inkludert alle 80 kombinasjoner av sporkort, alle 15 handlingsforløp og krav om fullført konsekvenskjede før læringsmerke.
- Test av lagring/gjenopptakelse, skadet lagring, ugyldige valg og lederbestillingens eksport.
- De fire bildene ligger lokalt med kontroll av filreferanser, kreditering, lisenslenker og skillet mellom stedsfoto og faksimile.
- TypeScript og produksjonsbygg kontrolleres med prosjektets ordinære byggkommando.
- Nettleser-, mobil-, utskrifts- og visuell testing er **ikke kjørt for versjon 1.1**. De eldre målingene nedenfor gjelder første utgave og sertifiserer ikke den nye reisen.
- Det eksisterende nettleserskriptet er tilpasset at rom nå åpner på oppdraget, og at Lederens rom avsluttes med en lederbestilling. Skriptet er ikke kjørt i denne endringen.

## Historikk: første utgave


Kontrollert 8. september 2026.

## Innhold

- Alle fem primærkildene er hentet direkte. Kontroll av dato, relevant tekst, sitater og kildeplassering.
- Konsolidert lov og forskrift er hentet direkte fra Lovdata; §§ 5 og 8 i loven, §§ 5–7 og 13–15 i forskriften, samt ikraftsettingsreglene er kontrollert.
- Tokke: uavklart lesbarhet er beholdt som risiko, ikke konkludert arkivtap.
- NPE: endringen etter innvendinger og positive funn er tatt med.
- Hanekleiv: teknisk granskningshistorie, uten påstand om konstatert arkivlovbrudd.
- 2008/171: dagens særregel om innsynssaker er forklart uttrykkelig.
- 5 automatiske datatester bestått. Typetest og Vite-produksjonsbygg bestått.

## Nettleser

46 funksjonskontroller bestått i Chrome på den lokale produksjonsbygde versjonen:

- Faktisk WebGL-rendering; musemodeller, skygger og innlasting.
- WASD, dra-for-å-se, pause og kollisjon mot sentralmonteren.
- Alle fem rom, fem fortellerdeler per rom, kilder og regelverk.
- Hele guidede besøket og alle åtte lederalternativer.
- Avslutning og tilbakeføring til fri utforskning.
- Lyd etter brukerhandling og av/på-kontroll.
- Mobilvisning 390 × 844, berøringsbevegelse, kildepanel og større tekst.
- Full tekstversjon med JavaScript slått av.
- Ingen registrerte JavaScript-/konsollfeil eller HTTP-feil på appens egne filer.

Skjermbilder av hovedhall, utstillinger, mobilforside, mobile kildepaneler og innstillinger er visuelt kontrollert. Kildelenkene har `target="_blank"` og `rel="noopener noreferrer"`.

## Ytelse og grenser

Hovedvisningen viste omtrent 100–200 tegnekall etter sammenslåing og instansiering. Ca. 180 kB komprimert JavaScript og en ukomprimert modellpakke på ca. 582 kB. Målinger fra lokal Chrome er ikke en garanti for fysiske mobilenheter. Ingen fysisk iPhone/Safari-test eller full WCAG-revisjon er gjennomført.

## Gjenta nettleserprøven

Bygg først, og start `pnpm preview`. Installer Chromium for Playwright med `pnpm exec playwright install chromium`, eller sett `MUSEUM_CHROME` til en allerede installert Chrome. Kjør `pnpm test:browser` i en annen terminal. `MUSEUM_URL` kan settes til den offentlige museumsadressen. Resultater og skjermbilder havner i den ignorerte mappen `qa-output/`, eller i `MUSEUM_QA_DIR`.

GitHub Pages-byggingen kjører de eksisterende prosjektenes tester og deretter museets datatester og produksjonsbygg. Den publiserte siden kontrolleres i tillegg fra nettleseren etter utrulling.
