# FJORDSPRINT — Saksrally 2.0

Et norsk 3D-arkaderally med arkivkunnskap og offentlig sektor som gjennomgående tema. Den opprinnelige Archive Run-utgaven er videreutviklet, ikke erstattet med et annet spill.

## Spill

Publiseringsadresse: https://rolfss.github.io/Click-here-for-newest-projects/fjordsprint/

Lokalt: `node launch.mjs`, eller dobbeltklikk `START-FJORDSPRINT.cmd` på Windows med Node.js installert. `npm start` starter bare serveren på http://127.0.0.1:4173. Åpne via server, ikke direkte som fil.

## Nytt i 2.0

- Navnebasert toppliste med nøyaktig 72 timers levetid per resultat, tydelig nedtelling, separate løpsklasser og trygg håndtering av ugyldige navn og utilgjengelig lagring.
- Valgbar virtuell medaljebil (bronse, sølv, gull) også før du har satt personlig rekord. Den er tydelig merket som virtuell og er aldri en oppdiktet spiller på topplisten.
- Svingveiledning, mellomtider, sektorsammenligning og merker som «Uten avvik» og «Saksflyt».
- Automatisk gass som valgfri hjelp, egne berøringsknapper for drift og gjenoppretting, kontrollerstyrte menyer og bedre småskjermoppsett.
- Fire bilfarger, synlig hjulstyring og bremselys. Roligere kameravalg og mindre pulserende effekter.
- Navnefeltet fanger ikke lenger spillets hurtigtaster. Bedre tidsformatering ved minuttskiftet.

## Toppliste: presis avgrensning

**Publisert standardoppsett er lokalt.** Navn og resultater deles ikke automatisk mellom telefoner eller datamaskiner. Det står også uttrykkelig i spillet. Listen fungerer uten konto eller en betalt tjeneste.

Skriv inn et kallenavn på 2–20 tegn etter en fullført etappe. Beste aktive tid per navn vises for valgt bane, styring, spillmodus og spørsmålssett. Hvert resultat utløper 72 timer etter lagringen, ikke ved en felles tredagersnullstilling. En eldre, fortsatt gyldig tid kan bli synlig når en bedre tid utløper. Demonstrasjoner kan ikke registrere resultater. Det finnes ingen oppdiktede toppspillere.

Resultater leses fra nettleserlagring og fjernes når de er utløpt. Dersom nettleseren er lukket, skjer oppryddingen neste gang spillet åpnes. Klokkeendring på enheten kan påvirke en lokal liste. Sletting av nettleserdata fjerner listen tidligere. Ved blokkert lagring viser spillet tydelig at resultatene bare varer i økten.

Personlig rekord, spøkelsesbil og cupfremgang er separat langtidsprogresjon, ikke del av 72-timerslisten. Disse er beholdt fra første utgave.

Koden for en felles server finnes i `score-server/`, med serverstyrt utløp og databasetester. **Den er ikke aktiv bare fordi koden finnes i dette repositoriet.** Se serverens README for nødvendig tilkobling.

## Kontroller

| Handling | Tastatur |
| --- | --- |
| Gass / brems | W / S eller pil opp / ned |
| Styring | A / D eller pil venstre / høyre |
| Boost | Shift |
| Drift | Mellomrom |
| Svar | 1, 2, 3 |
| Start etappen på nytt | R |
| Tilbake til siste port, +3 sekunder | Enter |
| Pause | Esc eller P |
| Kamera | C |
| Fullskjerm | F |

Kontroller: venstre spak styrer, RT/LT gir gass/brems, A boost, X drift, B gjenoppretting, Y omstart og Start pause. I spørsmål velger A/X/B svar 1/2/3. I menyer brukes retningsknapper og A. Berøringskontroller vises på berøringsenheter. Automatisk gass slås på i innstillinger og gjelder fra neste løp.

## Innhold som er bevart

Tre fiktive baner: Fjordlinjen, Tindepasset og Nordlysryggen. Fjellcupen åpner banene etter hvert; Trening åpner alle. Tre arkivporter per bane gir spørsmål i fokustid. Riktig svar gir boost. Flyvende kontrollører slipper ekstra spørsmålspakker; riktig ekspertsvar gir turbo, feil gir fartstap. Det finnes også boostfelt, hopp, medaljer, karrierefremgang, dyr, tilskuere, original syntetisert musikk og et eget målområde.

Assistert styring og Sport har egne rekorder. Arkivrally, spørsmålssett og rent tidsløp har egne klasser. Den fysiske kjøremodellen er ikke balansert om i denne oppdateringen; eksisterende personlige rekorder beholdes.

## Faglig materiale og rettigheter

De eksisterende 42 spørsmålene og deres kildehenvisninger er beholdt. Datoen 17.09.2026 i Arkivboka viser kontrollen fra den opprinnelige utgaven, ikke en ny faglig eller juridisk gjennomgang i 2.0. Dette er et læringsspill, ikke juridisk rådgivning. Kontrollørfigurene er fiktive; spillet representerer ikke etatene.

Alt nødvendig for å spille ligger i `dist/`, uten eksternt hentede spillressurser. Three.js 0.160.1 er inkludert under MIT-lisensen i `dist/vendor/THREE-LICENSE.txt`. Banelayout, prosedyremodeller, grensesnitt og syntetisert lyd er laget for prosjektet. Ingen nye tredjepartsbilder, musikkfiler eller fontfiler er lagt til.

## Tester og leveransestatus

`npm test` kjører opprinnelige spilltester og nye tester for toppliste, utløp, virtuell medaljebil, svingveiledning og serverlagring. `tests/browser-smoke.py` kjører nettleserbasert integrasjon med testinstrumentering; denne er ikke tilgjengelig i det publiserte spillet. Se `RELEASE-NOTES.md` for avgrensninger.

Dette er en nettleserutgave. Den er ikke utgitt på Steam, og denne leveransen er ikke en bekreftelse på at den oppfyller alle krav til en kommersiell Steam-utgivelse.
