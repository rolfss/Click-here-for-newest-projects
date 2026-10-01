# Opphav og lisenser

- **Konsept og prosjekt:** Rolf Selås. Gjennomført med Codex etter oppdragsbeskrivelsen om Arkivmuseet.
- **Arkitektur og 3D-modeller:** Originale modeller laget for prosjektet i Blender 4.5.9 LTS. Genereringsoppskrift: `scripts/make-assets.py`. Modeller: riflede søyler, buer, monterunderstell, arkivskap, mapper, serverrack og papirskulptur. Ingen eksterne museumsmodeller er brukt. Merkede rapportfaksimiler er lagt til i lesepanelene.
- **Materialer:** Originale, deterministisk genererte farge- og normalkart for kalkstein og eik er innebygd i Blender-eksporten. Nettleseren genererer supplerende overflatedetaljer og kontaktskygger. Fotografier omtalt nedenfor brukes i tillegg som utstillingsbilder og er uendret av den visuelle oppgraderingen.
- **Lyd:** Originalt generert med Web Audio: filtrert støy, ventilasjonslignende romlyd, fottrinn og forsinket ekko. Ingen lydopptak, sampling eller musikk fra andre.
- **Typografi:** Lokale systemfonter: Georgia, Times New Roman, Segoe UI og Arial. Fontfiler distribueres ikke.
- **Three.js 0.185.1:** MIT-lisens. Opphavsrett til Three.js-forfatterne; lisens kopiert til `public/THREE-LICENSE.txt` og distribuert på nettstedet. GLTFLoader, Sky, RoomEnvironment, BufferGeometryUtils, EffectComposer, RenderPass, GTAOPass og OutputPass tilhører Three.js.
- **Vite 8.2.2:** MIT; byggeverktøy, ikke en egen 3D-motor. TypeScript 5.9.3: Apache-2.0; byggeverktøy. Typedefinisjoner følger sine egne pakklisenser. Avhengigheter er låst i `pnpm-lock.yaml`.
- **Blender:** GPL; brukt til produksjon av originale modeller. Programmet distribueres ikke med museet.
- **Historiske og juridiske kilder:** Rettigheter ligger hos utgiverne. Museet distribuerer korte sitater, selvstendige sammendrag og lenker. To rapporters førstesider vises som merkede faksimiler. Fotografiene nedenfor er gjengitt under sine oppgitte lisenser. Ingen avisartikler er kopiert.

Prosjektets egen kode, originale modeller, lydoppskrifter og genererte materialer følger MIT-lisensen i `LICENSE`. Det gir ikke lisens til originalkildenes innhold, tredjeparts varemerker eller fonter.

## Fotografier og faksimiler · lederreisen

- **Hanekleivtunnelen:** Foto Peter Fiskerstrand, 4. juni 2010. [Original og kreditering](https://commons.wikimedia.org/wiki/File:Hanekleivtunnelen.jpg), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Sørportalene, ikke raset i 2006.
- **Dalen i Tokke:** Foto Eirik Solheim, 21. juli 2008. [Original og kreditering](https://commons.wikimedia.org/wiki/File:Dalen_i_Telemark.jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). Stedsbilde, ikke dokumentasjon av arkivtilsynet eller elevsystemet.
- Fotografiene er nedskalert til høyst 1280 px og konvertert til WebP. Ingen beskjæring. De beholder sine CC BY-SA-lisenser; prosjektets MIT-lisens erstatter dem ikke.
- **Osen og NPE:** Førstesiden av Arkivverkets endelige rapporter, uendret bortsett fra tapsfri filformatkonvertering. Originaler lenkes i bildet og `cases/cases.json`. Grunnlaget for gjengivelse er at offentlige tilsynsvedtak vurderes å være omfattet av unntaket for offentlige myndigheters dokumenter i åndsverkloven § 14; dette er en vurdering av dokumenttypen, ikke en CC-lisens fra utgiver. Riksvåpenet beholdes i dokumentet og brukes ikke som museets merke.
- Fullstendige bildetekster, dimensjoner, originalkilder og lisenslenker følger bildene i `public/assets/cases/credits.json`.
