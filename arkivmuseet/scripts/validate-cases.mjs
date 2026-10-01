import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateLearning} from './validate-learning.mjs';
export function validateCases(cases,legal){
 if(!Array.isArray(cases)||cases.length<1)throw Error('Ingen utstillinger');
 const ids=new Set(),sourceIds=new Set(legal.map(x=>x.id));
 for(const c of cases)for(const s of c.sources??[])sourceIds.add(s.id);
 for(const c of cases){
  for(const key of ['id','title','organization','eventDate','inspectionDate','location','shortNarrative','documentedFacts','consequence','authorityFindings','legalFrameworkAtTime','currentLegalRelevance','leadershipLesson','sources','quotes','disputedOrUncertainClaims','confidence','visualConcept','sourceCheckedDate','position'])if(c[key]===undefined||c[key]==='')throw Error(c.id+': mangler '+key);
  if(ids.has(c.id)||!/^[a-z][a-z0-9-]+$/.test(c.id))throw Error('Ugyldig/duplisert id');ids.add(c.id);
  if(!['journal','server','desk','tunnel','timeline'].includes(c.visualConcept))throw Error('Ukjent installasjon');
  if(!c.sources.length)throw Error('Saken mangler primærkilde');
  for(const s of c.sources){const url=new URL(s.url);if(url.protocol!=='https:'||!['www.nasjonalarkivet.no','www.sivilombudet.no','www.regjeringen.no','lovdata.no'].includes(url.hostname))throw Error('Kilden må være en godkjent primærkilde');for(const k of ['title','institution','date','locator'])if(!s[k])throw Error('Ufullstendig kilde');}
  for(const a of ['documentedFacts','consequence','authorityFindings','legalFrameworkAtTime','currentLegalRelevance'])if(!Array.isArray(c[a])||!c[a].length)throw Error('Mangler '+a);
  const claims=[c.shortNarrative,...c.documentedFacts,...c.consequence,...c.authorityFindings,...c.legalFrameworkAtTime,...c.currentLegalRelevance];
  for(const q of claims){if(!q.text||!q.locator||!q.sourceIds?.length||q.sourceIds.some(id=>!sourceIds.has(id)))throw Error(c.id+': usporbar påstand');if(!['fact','risk','interpretation'].includes(q.kind))throw Error('Umerket påstandstype');}
  for(const q of c.quotes){const source=c.sources.find(s=>s.id===q.sourceId);if(!source||q.text!==source.excerpt)throw Error('Sitat må samsvare med registrert kildeutdrag');}
  if(c.displayMetric){const m=c.displayMetric;if(!m.value||!m.label||!m.locator||!m.sourceIds?.length||m.sourceIds.some(id=>!sourceIds.has(id))||!claims.some(q=>q.text.includes(m.value)))throw Error('Utstillingstall må finnes i en kildebelagt påstand');}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.sourceCheckedDate)||Date.parse(c.sourceCheckedDate)>Date.now())throw Error('Ugyldig kontrolldato');
  if(c.position.length!==2||!c.position.every(Number.isFinite))throw Error('Ugyldig romposisjon');
 }
 return true;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const read=name=>JSON.parse(readFileSync(`cases/${name}.json`,'utf8'));const cases=read('cases');validateCases(cases,read('legal-sources'));validateLearning(read('missions'),read('leader-scenarios'),read('investigation'),cases);console.log('Utstillinger og oppgaver har sporbare kilder, tydelige vurderingskriterier og sammenhengende tidslinje.');}
