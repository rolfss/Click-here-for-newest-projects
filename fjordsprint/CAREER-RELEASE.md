# Saksrally 3.0 – kompetansekanon og karrierestjerner

## Spillinnhold

Tre eksisterende 3D-baner har hvert sitt tema: dokumentfangst, helse og sikker samhandling, samt ledelse og langtidsbevaring. 54 nye, kildehenviste scenarioer velges og stokkes uten gjentakelser i samme løp. Bilen og løpsklokken står stille under lesepausene.

En vannkanon på taket skyller bort tolv navngitte unnskyldningstroll per bane. To treff kreves. Vanntrykket fylles automatisk; kollisjoner bremser bilen. E, venstre museknapp, RB eller VANN på mobil. 18 forskjellige unnskyldninger, varslet innmarsj, vanndråper og lydeffekter. Ingen vold eller realistiske våpen.

Ny road-relative bicycle-modell bruker hastighetsavhengig styreutslag, treghet, begrenset veigrep, bremsing, luftmotstand, helning og fjæring. Dette er et tilgivende racingspill, ikke en bilsimulator. Tidligere fysikkmodul og referansetester beholdes for å beskytte gamle funksjoner.

Riktige svar gir 18 juice. Et ryddet troll gir 6–9 juice. Juice er separat fra vanlig boost. Etter målgang kobles en arkivrakett til bilen, som stiger mellom flyvende dokumenter og karrierestjerner. Seks insignier: rådgiver, seniorrådgiver, TU/TA, produkteier, produktområdeleder, toppleder. Terskler: 0, 20, 45, 70, 95 og 120 juice. Stigen er humoristisk, ikke en reell organisasjonsmodell.

## Navn, poeng og personvern

Navn/kallenavn etterspørres før første start; Bytt fører finnes i menyen. Navnet huskes bare i den åpne økten, bortsett fra de tidsbegrensede poengresultatene. Resultater lagres automatisk ved målgang. Hver oppføring utløper etter nøyaktig 172800000 ms (48 timer); nye løp forlenger ikke gamle oppføringer. Beste aktive resultat per navn rangeres etter poeng, så tid. Separate lister for bane, spørsmål av/på og assistert/sport.

Listen er **lokal i nettleseren**, ikke felles på nett. Ingen ny server, konto, abonnement eller betalt tjeneste er aktivert. Lokal lagring kan redigeres av spilleren; dette er ikke en jukssikker konkurranseserver. Ved blokkert lagring brukes en tydelig merket øktliste. Utløpte oppføringer fjernes ved kontroller mens spillet kjører eller ved neste åpning. En lukket nettside kan ikke fysisk slette lokal lagring på et bestemt klokkeslett. Gamle navngitte 72-timersdata fjernes ved oppstart. Anonyme personlige tidsrekorder og cupfremgang beholdes separat.

## Kilder og kvalitetssikring

Fagkilder fra Nasjonalarkivet, Helsedirektoratet/Normen og Digdir er knyttet til spørsmålene og samlet i Arkivboka. Scenarioene er originale læringseksempler, ikke juridisk rådgivning. Kildedato: 16. oktober 2026.

`npm test` kjører eksisterende kontrollsett og 17 nye tester, inkludert alle seks bane-/styringskombinasjoner, spørsmål, troll, poeng, navn og presist utløp. `python3 tests/browser-smoke.py` kjører ekte Chromium/WebGL på tre skjermformater, med lokale testkroker som ikke leveres til spillere. Testen dekker start, vannskudd, lesepause, normal målpassering, rakett, poengtavle, gjenåpning og 48-timersutløp. Skjermbilder og rapport lastes opp av GitHub Actions.

Dette er en videreutviklet nettleserutgave. Steam-pakke, betalt distribusjon og bred maskinvare-/spillertesting inngår ikke i denne versjonen.
