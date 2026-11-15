# Quizpå

Selvstyrte, tidsstyrte quizer på norsk. Arrangøren publiserer en runde og deler spill-lenken i Teams. Deltakerne velger kallenavn og spiller på mobil eller PC.

## Arrangør

1. Åpne arrangørsiden på /arrangor og sett opp passordet med den personlige oppsettkoden.
2. Velg **Ny quiz** eller **Bruk demoquizen**. Legg inn spørsmål, svaralternativer, riktig svar og tidsgrense.
3. Velg **Lagre quiz** og deretter **Publiser runde**. Velg eventuelt åpningstid, frist og når fasit og toppliste vises. Datoer bruker Oslo-tid.
4. Kopier spill-lenken eller velg **Kopier Teams-melding** og lim inn i en Teams-chat eller -kanal.
5. Åpne runden på arrangørsiden for å følge resultatene, hente CSV eller avslutte den.

Hver runde får sin egen invitasjonslenke og beholder spørsmålene slik de var ved publisering. En ny runde starter med tom toppliste. /spill/demo har en egen, fiktiv prøvequiz.

## Spill og poeng

Kallenavn er unike per runde. Deltakerens økt kan fortsettes på samme enhet. Den personlige koden åpner det samme forsøket på en annen enhet. En spill-lenke kan videresendes. Bruk rundeinnstillingen **Kun for arrangør** for å begrense topplisten til arrangørsiden.

Et riktig svar gir 1 000 poeng. Maksimalt 500 bonuspoeng fordeles på spørsmålene. Hvert riktig svar får bonus etter hvor mye tid som gjenstår. Feil, hopp og utløpt tid gir null. Ved lik poengsum avgjør antall riktige svar og samlet svartid. Identiske resultater deler plasseringen.

## Utvikling

Krever Node.js 24+. Kjør fra denne mappen.

    npm ci
    npm test
    npm run dev

Prøv /spill/demo på URL-en som skrives ut. Oppsettkoden for /arrangor i den lokale testserveren er 48 små a-er, eller verdien i QUIZPA_LOCAL_SETUP. Den lokale databasen ligger under .quizpa-local og er adskilt fra den publiserte appen. Testene bruker egne databaser og inkluderer 1 500 fullførte forsøk. Tallet er en test av lagring og rangering, uten måling av samtidige spillere i produksjon.

## Drift

Worker-bygget produseres med npm run build. Den driftede appen bruker en dedikert D1-database. Quizer, fasit og deltakernes resultater lagres i D1. Prøvequizen i kildekoden har fiktive data.

Ved egen Cloudflare-utrulling, opprett D1-databasen quizpa og fyll inn database_id i wrangler.jsonc. Kjør deretter følgende fra denne mappen.

    npx wrangler@4 d1 migrations apply DB --remote
    npm run deploy
    npx wrangler@4 secret put ADMIN_SESSION_SECRET
    npx wrangler@4 secret put ADMIN_SETUP_HASH

ADMIN_SESSION_SECRET er en tilfeldig nøkkel på minst 32 byte. Generer en egen oppsettkode med 24 tilfeldige byte som 48 heksadesimale tegn. ADMIN_SETUP_HASH er SHA-256 av oppsettkoden, med små heksadesimale tegn. Oppsettkoden formidles privat til arrangøren og brukes én gang. Den publiserte appen tar imot passordet på arrangørsiden og lagrer en saltet PBKDF2-verifikator.
