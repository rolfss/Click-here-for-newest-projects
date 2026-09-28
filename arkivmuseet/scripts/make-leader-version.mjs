import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderBenefits,renderLegalGuide,validateLeaderGuide,escapeGuide as esc} from '../src/leader-guide.ts';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const guide=read('cases/leader-guide.json'),cases=read('cases/cases.json');
validateLeaderGuide(guide,cases.map(c=>c.id));
mkdirSync(new URL('public/',root),{recursive:true});
copyFileSync(new URL('src/leader-guide.css',root),new URL('public/leader-guide.css',root));
const html=`<!doctype html>
<html lang="nb" class="guide-page"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arkivmuseet — lederens kortversjon</title><meta name="description" content="Hva arkiver gjør mulig, hva som står på spill, og seks norske arkivkrav for ledere. Kilder og praktiske spørsmål, uten JavaScript eller 3D.">
<link rel="stylesheet" href="./leader-guide.css"></head><body>
<a class="guide-back" href="./">← Til museet</a><header><p>ARKIVMUSEET · FOR LEDERE</p><h1>Arkiv gir handlingsrom.</h1><p>Muligheter. Fallgruver. Ansvar.</p><p>En lesbar vei gjennom museets hovedspørsmål, uten krav om 3D eller JavaScript.</p></header>
<nav class="guide-nav" aria-label="Lederens kortversjon"><a href="#muligheter">Mulighetene</a><a href="#saker">Fem virkelige saker</a><a href="#krav">Norske krav</a><a href="#ledermote">Neste ledermøte</a></nav>
<main><section id="muligheter" class="guide-section"><h2>Hva kan arkiver gjøre mulig?</h2>${renderBenefits(guide)}</section>
<section id="saker" class="guide-section"><h2>Fem saker. Fem spørsmål til ledelsen.</h2><p>Historiske funn er ikke en beskrivelse av virksomhetene i dag. Lederperspektivene er museets tolkninger; kildene og forbeholdene følger hver utstilling.</p>
<div class="case-index">${cases.map(c=>{const lens=guide.lenses.find(l=>l.caseId===c.id);return `<article><p>${esc(c.organization)} · ${esc(c.eventDate)}</p><h3>${esc(lens.theme)}</h3><p>${esc(c.shortNarrative.text)}</p><p class="guide-question">${esc(lens.question)}</p><a href="./tekst.html#${esc(c.id)}">Les hele saken: ${esc(c.title)} ↗</a></article>`;}).join('')}</div></section>
<section id="krav" class="guide-section"><h2>Hvilke krav må virksomheten følge?</h2>${renderLegalGuide(guide)}</section>
<section id="ledermote" class="guide-section"><h2>Ta med én bestilling – ikke bare en bekymring.</h2><div class="guide-action-sheet"><p>Museets forslag til en første oppfølging. Tilpass til virksomhetens risiko, regelverk og ressurser.</p><ol><li><strong>Velg én beslutning, ett system eller én leveranse.</strong> Hvilken dokumentasjon må en annen kunne finne og forstå?</li><li><strong>Avtal ansvarlig rolle, prøve og oppfølging.</strong> Be fag, arkiv og IT vise at underlaget faktisk kan brukes.</li><li><strong>Følg opp resultatet.</strong> Hva fungerte, hvilke avvik gjenstår, og hvem lukker dem?</li></ol><p>Ansvarlig rolle: ____________________</p><p>Oppfølging: ____________________</p><p>Bevis vi vil se: ____________________</p></div><p>I museets lederbestilling kan du velge konkrete tiltak fra alle fem saker, fylle inn rolle og dato og laste ned en tekstfil. Ingen øvelser må fullføres først.</p><p><a href="./">Åpne museet og velg Lederens rom</a> · <a href="./tekst.html#leder">Les lederøvelsene uten JavaScript</a></p></section></main>
<footer><p>Et uavhengig formidlingsprosjekt av Rolf Selås. Ikke en offisiell veileder fra myndighetene eller en vurdering av din virksomhets etterlevelse.</p><p>Regelverksoversikten er gjennomgått ${esc(guide.reviewed)}. Historiske kilder har egne kontroll- og hendelsesdatoer i den fullstendige tekstversjonen.</p><a href="./tekst.html">Alle historier, kildehenvisninger og avgrensninger</a></footer></body></html>`;
writeFileSync(new URL('public/leder.html',root),html);
console.log(`Lederens kortversjon og felles stilark generert: ${fileURLToPath(new URL('public/leder.html',root))}`);
