# Prosjektgrunnlag

Archive Assist realiserer den opprinnelige Arkivklar-ideen om et enkelt verktøy som knytter metadata til filer i en arkiv- og dokumentasjonsforvaltningskontekst.

## Rekonstruert kjernebehov

1. Brukeren skal kunne velge én eller flere filer uten å sende dem til en ekstern tjeneste.
2. Løsningen skal lese innholdet og foreslå en sømmelig saksdokumenttittel – ikke bare rydde filnavnet.
3. Forslaget skal bygge på dokumentets handling, tema, overskrift, emne og tilgjengelige metadata.
4. Saksbehandler eller arkivar skal kunne godkjenne forslaget eller redigere det før videre bruk.
5. Metode, begrunnelse, sikkerhet og menneskelig kontrollstatus skal være synlig og kunne følge eksporten.
6. Metadata skal dekke ansvar, kontekst, tilgang, klassifikasjon og livsløp – ikke bare filtype og dato.
7. Resultatet skal kunne tas videre som maskinlesbart manifest og dokumentbundne sidecar-filer.
8. Demoen skal kunne brukes direkte av utenforstående fra GitHub Pages, uten API-nøkkel.

## Viktige designvalg

- **Innhold før filnavn:** emne, uttrykkelig tittel, overskrift og meningsbærende innhold prioriteres. Filnavnet er reserve.
- **To analysetrinn:** en forklarbar lokal motor lager første forslag; valgfri GPT-5.6 Luna kan forbedre resultatet etter en eksplisitt brukerhandling. Luna sender et begrenset tekstutdrag og utvalgte metadata via ekstern backend til OpenAI.
- **Versjonert prompt:** reglene for saksdokumenttittel ligger i `TITTELPROMPT.md` og kildekoden.
- **Menneskelig kontroll:** forslag settes i et redigerbart felt, og eksporten varsler når tittelen ikke er kontrollert.
- **Lokal behandling som standard:** gir en testbar offentlig demo uten ekstern dokumentanalyse. Sky-AI er et separat valg med synlig forklaring av dataflyten.
- **Sidecar fremfor binær omskriving:** unngår å korrumpere PDF-, Office- og bildefiler og gir samme modell på tvers av formater.
- **Flyttbart resultat:** JSON, CSV og ZIP gjør veien videre mot import eller integrasjon konkret.

Den komplette opprinnelige Antigravity-eksporten ble ikke funnet i repoet da prosjektet ble rekonstruert. Kravene og tittelpremissene er derfor gjort eksplisitte og versjonerte i denne utgaven, fremfor å bli fremstilt som en ordrett kopi av en utilgjengelig promptpakke.

Den tidligere migrerte mappen `metaready` utviklet seg til en bredere informasjonsstyringsdemo. MetaReady og Archive Assist beholdes derfor som to selvstendige prosjekter: MetaReady for informasjonsstyring og AI-beredskap, og Archive Assist for konkret filbasert metadataflyt og saksdokumenttitler.
