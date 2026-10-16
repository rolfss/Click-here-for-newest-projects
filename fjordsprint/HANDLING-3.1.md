# Fjordsprint 3.1 – grep og sykehusløype

## Kjøreegenskaper

Ny, egenutviklet arkadefysikk inspirert av presisjonsracing som Trackmania, ikke en kopi av spillets kode eller fysikk. Bilens retning og bevegelsesretning simuleres hver for seg. Rask, proporsjonal styring uten magnetisk retting mot banen. Tydelig grep, brems–sving-drift og kontrollert gjenvinning av grep. Slipp styringen for å rette opp sladden; drifting lager ikke gratis boost. Sideveis treff mot autovernet koster mindre fart enn skarpe sammenstøt.

I luften kan bilen orienteres uten å flytte bevegelsesretningen kunstig. Brems stopper rotasjon, ikke framdrift. Hopp følger vertikal bevegelse, og landinger komprimerer en dempet fjæring. Boostens utløp endrer ikke farten momentant. Fysikken kjører i faste 120 Hz-trinn. Kameraet følger både bilen og kjøreretningen, med mindre forsinkelse.

W / pil opp: gass. S / pil ned: brems. A–D / piler: styr. Brems kort mens du svinger for å starte drift, eller bruk mellomrom. Shift: boost. E: kompetansekanonen. Mobilknappene og analog kontroller støttes fortsatt.

## Sykehuspartner og Helse Sør-Øst

Original Sykehuspartner-logo fra Helse Sør-Østs profilside: https://www.helse-sorost.no/om-oss/media/logo-og-profilprogram

Logoen er lagret lokalt som PNG uten å endre originalbildet. Den er plassert på panser, begge sider og bakvingen, samt på servicebygg, en servicebil og bannere. Spillet er uoffisielt; det hevdes ingen godkjenning eller sponsing fra Sykehuspartner.

44 navngitte sykehus og behandlingssteder står langs de tre banene, fordelt 14 / 16 / 14. Alle ni sykehusforetak og de fire private ideelle samarbeidssykehusene i Helse Sør-Østs oversikt er representert. Stiliserte bygninger med fem arkitektoniske varianter, egne navneskilt og en oversikt i menyen. En automatisk utsiktstur kjører roligere uten spørsmål, troll eller poenglagring.

Bygningene er spillmodeller, ikke kopier av de virkelige byggene. Banene er fiktive og ikke et geografisk kart. Katalogen omfatter ikke alle DPS, poliklinikker, rehabiliteringsenheter eller private avtaleleverandører. Datagrunnlag og kilder ligger i `dist/hso-data.js` og menyen «Sykehusløypa». Martina Hansens Hospital er korrekt knyttet til Vestre Viken; Drammen vises som Brakerøya, ikke gamle Drammen/Blakstad. Dikemark er merket som et område med virksomhet under flytting i 2026.

## Bevarte funksjoner

Kompetansekanon, unnskyldningstroll, 54 arkivspørsmål, tre baner og karriereraketten beholdes. Navngitte resultater er fortsatt lokale på enheten og utløper etter 48 timer. Nye kjøreegenskaper har egne rekordklasser, slik at gamle og nye tider ikke sammenlignes direkte. Tidligere oppføringer får ikke forlenget levetid. Ingen ny backend eller betalt tjeneste.

## Kontroller

`npm test` inkluderer 17 nye håndterings-/sykehustester: styrerespons, proporsjonal styring, drift, brems, hopp, airbrake, fjæring, boost, kollisjon, determinisme, tilbakeføring, seks komplette baneløp i begge styringsmoduser, alle sykehusplasseringer og 48-timers lagring. `tests/browser-smoke.py` tester navn, faktisk vannskudd, spørsmålspause, målgang, rakett, poengtavle, gjenåpning og utløp; dessuten logo, sykehusoversikt, utsiktstur og synlige landemerker i tre skjermformater. Testkroker settes bare inn lokalt av testserveren.
