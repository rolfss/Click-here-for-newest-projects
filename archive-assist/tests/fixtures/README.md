# Syntetiske regresjonsdokumenter

Kilde: brukerlevert `Archive-Assist-testgrunnlag-2026-09-27.zip`, mottatt 27. september 2026.
ZIP-ens SHA-256: `7725675c56498c3bbd077f8b3018074885675d1de819612aae69167c49c4c16d`.

Bare de ti uendrede dokumentene i `dokumenter/` og fasiten i `fasit.json`/`FASIT.md`
er hentet fra pakken. Ingen vedlagte generatorer eller kontrollskript er kopiert
eller kjørt. Alle dokumenter, avsendere og kontaktadresser er syntetiske.
SHA-256 per dokument står i `fasit.json` og kontrolleres av Node-testene.

Arkivstiene ble kontrollert før utpakking: ingen absolutte stier, katalogtraversering,
symlinker eller duplikater. Hvert utpakkingsmål ble kontrollert mot denne mappen.
Originalbyteinnhold er bevart, inkludert Windows-1252 i `02-tegnsett.txt`, UTF-8 BOM
i CSV-filen og de komprimerte Office-pakkene.

Testene i `../fixture-extraction.test.mjs` bruker den lokale uttrekks- og
metadatamotoren. De foretar ingen modellkall eller nettverksforespørsler.
Dokumentdato kontrolleres med et bevisst avvikende filstempel og importtidspunkt,
slik at gjetting fra tekniske datoer ikke kan gi falskt bestått.

Fasiten beskriver avsender, mens appens `creator` gjelder ansvarlig/forfatter.
Disse feltene likestilles ikke i testene. Dokumenttype er en semantisk referanse,
ikke en påstand om at appen bruker identiske kategorier. Testene dokumenterer
konkrete uttrekks- og metadatafeil, ikke juridisk samsvar eller generell kvalitet.
Datasettet inneholder ikke PDF/OCR. Se `FASIT.md` for manuelle kontrollpunkter.
