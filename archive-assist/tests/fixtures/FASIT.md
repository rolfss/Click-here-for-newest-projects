# Kontrollerbar fasit

Alle dokumenter og avsendere er syntetiske.

## 01 – dokumenter/01-brev.txt

- Tittel: Forespørsel om avleveringsplan for byggesaksarkiv
- Dokumentdato: 2026-09-14
- Avsender: Eksempelvik kommune
- Dokumenttype (semantisk): brev
- Utfordring: Dokumentdato kontra frist
- Kildebelegg: {"title": "linje 4", "document_date": "linje 3", "sender": "linje 2"}
- Bevar: TEST-2026/101 | 30.11.2026
- Manuell kontroll: Frist er ikke dokumentdato.

## 02 – dokumenter/02-tegnsett.txt

- Tittel: Årlig gjennomgang av arkivnøkler
- Dokumentdato: 2026-09-15
- Avsender: Prøveby arkivtjeneste
- Dokumenttype (semantisk): notat
- Utfordring: Windows-1252 og norske tegn
- Kildebelegg: {"title": "linje 4 (Windows-1252)", "document_date": "linje 3", "sender": "linje 2"}
- Bevar: blåbær | øvelse | Ås
- Manuell kontroll:

## 03 – dokumenter/03-innrykk.docx

- Tittel: Sjekkliste for kvalitetssikring før avlevering
- Dokumentdato: 2026-09-16
- Avsender: Eksempelvik kommune
- Dokumenttype (semantisk): sjekkliste
- Utfordring: Ekte Word-liste med innrykk
- Kildebelegg: {"title": "word/document.xml, avsnitt 2", "document_date": "avsnitt 3", "sender": "avsnitt 4"}
- Bevar: Kontroller dokumentdato. | Bevar vedleggsrekkefølge. | Registrer manglende signatur.
- Manuell kontroll: Alle tre listepunkter i samme rekkefølge.

## 04 – dokumenter/04-liste-tabell.docx

- Tittel: Oppfølging av avvik i dokumentfangst
- Dokumentdato: 2026-09-17
- Avsender: Testfjord etat
- Dokumenttype (semantisk): notat
- Utfordring: Liste før og etter tabell
- Kildebelegg: {"title": "word/document.xml, avsnitt 2", "document_date": "avsnitt 3", "sender": "avsnitt 4"}
- Bevar: Kontroller status i tabellen. | Bekreft at A-17 er lukket. | Følg opp A-18 innen fristen. | A-17 | Lukket | A-18 | Åpent
- Manuell kontroll: Rekkefølge: første listepunkt, tabell, siste to listepunkter. A-17=Lukket, A-18=Åpent.

## 05 – dokumenter/05-kontroll.xlsx

- Tittel: Kontrolloversikt for avleveringspakker
- Dokumentdato: 2026-09-18
- Avsender: Prøveby arkivtjeneste
- Dokumenttype (semantisk): kontrolloversikt
- Utfordring: Tabellkobling og duplisering
- Kildebelegg: {"title": "Kontroll!B2", "document_date": "Kontroll!B3", "sender": "Kontroll!B4"}
- Bevar: TEST-P01 | 12 | Godkjent | TEST-P02 | 7 | Mangler vedlegg
- Manuell kontroll: Rad 6 og 7 forekommer én gang hver. Kolonnerelasjonene skal bevares.

## 06 – dokumenter/06-epost.eml

- Tittel: Avklaring av vedlegg til avlevering
- Dokumentdato: 2026-09-19
- Avsender: Testarkiv <arkiv@example.invalid>
- Dokumenttype (semantisk): e-post
- Utfordring: Tom tekstdel, innhold i HTML-del
- Kildebelegg: {"title": "Subject-header", "document_date": "Date-header", "sender": "From-header"}
- Bevar: Vedlegg V-03 mangler i pakke TEST-P02. | 25.09.2026
- Manuell kontroll: Ikke mist HTML-innholdet. Adressene er syntetiske; personvernindikator er ikke juridisk konklusjon.

## 07 – dokumenter/07-nettside.html

- Tittel: Rutine for kontroll av journalmetadata
- Dokumentdato: 2026-09-20
- Avsender: Testfjord etat
- Dokumenttype (semantisk): rutine
- Utfordring: Nettsidetittel kontra dokumenttittel
- Kildebelegg: {"title": "main/h1", "document_date": "p med Dokumentdato", "sender": "p med Avsender"}
- Bevar: Kontroller tittel. | Kontroller dokumentdato.
- Manuell kontroll: Ikke bruk Testportal som tittel eller oppdateringsdato som dokumentdato.

## 08 – dokumenter/08-register.csv

- Tittel: Avviksregister for metadata
- Dokumentdato: 2026-09-21
- Avsender: Eksempelvik kommune
- Dokumenttype (semantisk): register
- Utfordring: UTF-8 BOM og sitert semikolon
- Kildebelegg: {"title": "rad 1, kolonne 2", "document_date": "rad 3, kolonne 2", "sender": "rad 2, kolonne 2"}
- Bevar: Be om presisering; ikke gjett | TEST-02 | Manuell kontroll
- Manuell kontroll: Semikolon i tiltak er del av én celle.

## 09 – dokumenter/09-referat.md

- Tittel: Referat fra møte om arkivuttrekk
- Dokumentdato: 2026-09-22
- Avsender: Testfjord etat
- Dokumenttype (semantisk): referat
- Utfordring: Overskrift, underoverskrift og frist
- Kildebelegg: {"title": "linje 1", "document_date": "linje 5", "sender": "linje 4"}
- Bevar: TEST-U04 | før overføring | 15.10.2026
- Manuell kontroll: Ikke bruk Vedtak eller Frist alene som tittel.

## 10 – dokumenter/10-udatert.xml

- Tittel: Forespørsel om manglende arkivvedlegg
- Dokumentdato: IKKE OPPGITT – skal ikke gjettes
- Avsender: Prøveby arkivtjeneste
- Dokumenttype (semantisk): forespørsel
- Utfordring: Manglende dato
- Kildebelegg: {"title": "/dokument/emne", "document_date": "Ingen dato i kilden; null er fasit", "sender": "/dokument/avsender"}
- Bevar: TEST-V09 | Dato er ikke oppgitt.
- Manuell kontroll: Ikke bruk dagens dato eller filens tidsstempel. Krever manuell avklaring.
