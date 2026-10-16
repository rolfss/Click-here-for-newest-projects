import {BOARD_KEY,CONSENT,MAX_SCORE,QUESTIONS,answer,cleanName,newRound,points,publicationText,readBoard,removeResult,saveResult} from './score-state';
import type {ScoreRound,ScoreEntry} from './score-state';
import records from '../cases/cases.json';
import './scoreboard.css';
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const $=<E extends HTMLElement>(s:string)=>document.querySelector<E>(s)!;
const rules='10 spørsmål · 10 poeng per riktig svar · maks 100. Første bekreftede svar teller. Ingen tidspoeng. Du kan lese sakene underveis. Ved lik poengsum beholdes først registrerte resultat. Beste resultat per visningsnavn beholdes.';
export class Scoreboard{
 private round:ScoreRound|null=null;
 private screen='';
 private resultMessage='';
 private lastPoints=0;
 constructor(private show:(title:string,html:string)=>void){
  document.addEventListener('click',e=>{if((e.target as Element)?.closest?.('[data-score-open]'))this.open();});
  window.addEventListener('storage',e=>{if((e.key===BOARD_KEY||e.key===null)&&this.screen==='board'&&document.querySelector('#score-board-start'))this.board();});
 }
 private view(title:string,html:string,screen:string){this.screen=screen;this.show(title,`<div class="score-panel">${html}</div>`);$('#dialog').scrollTop=0;$('#dialog-body').scrollTop=0;$('#dialog-title').tabIndex=-1;$('#dialog-title').focus();}
 open(){if(this.round)this.question();else this.entry();}
 private entry(){
  this.view('Poengrunde og topp 3',`<p>Prøv det du har lært om lederansvar i de fem sakene. Navn er frivillig. Dette er en egen kunnskapsrunde; læringsmerkene dine endres ikke.</p><p class="score-rules">${rules}</p><form id="score-entry"><label for="score-name">Visningsnavn</label><input id="score-name" maxlength="60" autocomplete="off" placeholder="For eksempel fornavn og initial" aria-describedby="score-privacy"><p id="score-privacy">Bare topp 3 lagres, i denne nettleseren på denne enheten, til listen slettes. Ingen felles liste mellom enheter. Bruk et gjenkjennelig visningsnavn, ikke sensitive opplysninger. Navnet lagres ikke før en fullført runde kvalifiserer.</p><label class="score-consent"><input id="score-consent" type="checkbox"><span>${esc(CONSENT)}</span></label><p id="score-error" role="alert"></p><div class="score-actions"><button class="primary" type="submit">Start med navn →</button><button id="score-anonymous" type="button">Prøv anonymt</button></div></form><p><button id="score-show-board">Se lagret topp 3 / eksporter</button></p><p class="caption">Runden beholdes bare mens siden er åpen. Lastes siden på nytt, begynner du på nytt. Poengsummen er ikke en vurdering av kompetansen din på jobb.</p>`, 'entry');
  $('#score-entry').onsubmit=e=>{e.preventDefault();const name=cleanName(($('#score-name') as HTMLInputElement).value);if(!name||!($('#score-consent') as HTMLInputElement).checked){$('#score-error').textContent='Skriv et visningsnavn og gi samtykke, eller velg «Prøv anonymt».';return;}this.start(name,true);};
  $('#score-anonymous').onclick=()=>this.start('',false);$('#score-show-board').onclick=()=>this.board();
 }
 private start(name:string,consent:boolean){this.round=newRound(crypto.randomUUID(),name,consent);this.question();}
 private question(){
  if(!this.round)return this.entry();
  const r=this.round,index=r.answers.findIndex(a=>a===null);
  if(index<0)return this.finish();
  const q=QUESTIONS[index],c=records.find(c=>c.id===q.caseId)!;
  this.view(`Spørsmål ${index+1} av ${QUESTIONS.length}`,`<p class="eyebrow">${esc(c.organization)} · ${r.name?esc(r.name):'ANONYM RUNDE'}</p><p>${points(r)}/${MAX_SCORE} poeng så langt</p><h3>${esc(q.prompt)}</h3><form id="score-question"><fieldset><legend class="sr-only">Velg ett svar</legend>${q.options.map((o,i)=>`<label class="score-option"><input type="radio" name="score-answer" value="${i}" required><span>${esc(o)}</span></label>`).join('')}</fieldset><button class="primary" type="submit">Bekreft svaret →</button></form><p><a href="${import.meta.env.BASE_URL}tekst.html#${q.caseId}" target="_blank" rel="noopener noreferrer">Les saken i en ny fane ↗</a></p><button id="score-abort">Avslutt runden …</button><p class="caption">Første bekreftede svar teller. Ingen nedtelling.</p>`, 'question');
  $('#score-question').onsubmit=e=>{e.preventDefault();const input=document.querySelector<HTMLInputElement>('input[name="score-answer"]:checked');if(!input||!this.round||this.round.answers[index]!==null)return;this.round=answer(this.round,index,Number(input.value));this.feedback(index);};
  $('#score-abort').onclick=()=>this.abort();
 }
 private feedback(index:number){
  if(!this.round)return;
  const q=QUESTIONS[index],ok=this.round.answers[index]===q.correct,c=records.find(c=>c.id===q.caseId)!,source=c.sources.find(s=>s.id===q.sourceId)!;
  this.view(ok?'Riktig · 10 poeng':'Dette svaret ga 0 poeng',`<h3>${esc(q.prompt)}</h3><p><strong>Riktig svar:</strong> ${esc(q.options[q.correct])}</p><p>${esc(q.explanation)}</p><p class="caption">${q.kind==='interpretation'?'Museets faglige tolkning':'Kildefunn'} · <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.institution)} · ${esc(source.locator)} ↗</a></p><p>${points(this.round)}/${MAX_SCORE} poeng</p><button class="primary" id="score-next">${index===QUESTIONS.length-1?'Fullfør og se resultatet':'Neste spørsmål'} →</button>`, 'feedback');
  $('#score-next').onclick=()=>this.question();
 }
 private finish(){
  if(!this.round)return;
  this.lastPoints=points(this.round);
  if(!this.round.consent)this.resultMessage='Anonym runde. Ingen navn eller poengsum er lagret.';
  else try{const result=saveResult(localStorage,this.round);this.resultMessage=result.saved?`Du kom på ${result.position}. plass. Navnet og poengsummen din er lagret i topp 3 på denne enheten for mulig senere publisering på Viva Engage.`:'Runden er fullført, men ga ikke en ny plass i topp 3. Navnet og resultatet fra denne runden er ikke lagret.';}catch{this.resultMessage='Resultatet kunne ikke lagres. Nettleserlagring er utilgjengelig eller topplisten har et skadet format. Dette resultatet er ikke bekreftet lagret.';}
  // Never retain non-qualifying names, answers or consent in persistent storage.
  this.round=null;
  this.view(`Resultat: ${this.lastPoints}/${MAX_SCORE} poeng`,`<p id="score-result" role="status">${esc(this.resultMessage)}</p><p>Ingen automatisk publisering. Arrangøren må eksportere og publisere listen selv.</p><div class="score-actions"><button class="primary" id="score-result-board">Se topp 3 / eksporter</button><button id="score-new">Neste deltaker</button></div>`, 'result');
  $('#score-result-board').onclick=()=>this.board();$('#score-new').onclick=()=>this.entry();
 }
 private abort(){this.view('Avslutte runden?',`<p>Navnet og svarene fra denne ufullførte runden fjernes. Den lagrede topp 3-listen berøres ikke.</p><div class="score-actions"><button id="score-abort-confirm">Ja, avslutt uten lagring</button><button class="primary" id="score-keep">Fortsett runden</button></div>`, 'abort');$('#score-abort-confirm').onclick=()=>{this.round=null;this.entry();};$('#score-keep').onclick=()=>this.question();}
 private board(){
  let entries:ScoreEntry[]=[],error=false;
  try{entries=readBoard(localStorage);}catch{error=true;}
  const text=publicationText(entries);
  this.view('Topp 3 · denne enheten',`<p>Lagret i denne nettleseren. Listen overlever gjenåpning, men sletting av nettleserdata fjerner den. Listen er ikke synkronisert mellom enheter.</p>${error?'<p role="alert">Topplisten kunne ikke leses. Lagring er blokkert eller formatet er skadet. Ingen resultater er overskrevet.</p>':entries.length?`<ol class="score-podium">${entries.map(e=>`<li><strong>${esc(e.name)}</strong><span>${e.score}/${MAX_SCORE} poeng</span><button data-score-remove="${esc(e.id)}" aria-label="Slett resultatet til ${esc(e.name)}">Slett …</button></li>`).join('')}</ol>`:'<p>Ingen navngitte resultater er lagret ennå.</p>'}<p class="caption">${rules}</p><details><summary>Eksporter til Viva Engage</summary><p>For arrangøren: Kontroller navn og samtykke før publisering. Teksten nedenfor inneholder bare den lagrede topp 3. Ingen innlegg publiseres automatisk.</p><label for="score-export">Forslag til innlegg</label><textarea id="score-export" readonly rows="9">${esc(entries.length?text:'Ingen resultater å eksportere.')}</textarea><div class="score-actions"><button id="score-copy" ${!entries.length?'disabled':''}>Kopier innlegg</button><button id="score-download" ${!entries.length?'disabled':''}>Last ned tekstfil</button></div><p id="score-copy-status" role="status"></p><p class="caption">Dette er en lokal læringskonkurranse, ikke en innlogget eller manipulasjonssikret konkurranse. Slett navnene fra listen når de ikke lenger trengs. Sletting her fjerner ikke allerede eksporterte filer eller publiserte innlegg.</p></details><div class="score-actions"><button class="primary" id="score-board-start">${this.round?'Fortsett runden':'Ny deltaker'}</button><button id="score-clear" ${!entries.length&&!error?'disabled':''}>Slett hele listen …</button></div>`, 'board');
  $('#score-board-start').onclick=()=>this.open();
  $('#score-copy').onclick=async()=>{const status=$('#score-copy-status'),area=$<HTMLTextAreaElement>('#score-export');try{await navigator.clipboard.writeText(text);if(status.isConnected)status.textContent='Kopiert. Lim inn teksten i Viva Engage og kontroller før publisering.';}catch{if(area.isConnected){area.focus();area.select();status.textContent='Automatisk kopiering er blokkert. Teksten er markert; kopier manuelt eller last ned filen.';}}};
  $('#score-download').onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Arkivmuseet-topp-3.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  document.querySelectorAll<HTMLButtonElement>('[data-score-remove]').forEach(b=>b.onclick=()=>this.confirmDelete(b.dataset.scoreRemove));$('#score-clear').onclick=()=>this.confirmDelete();
 }
 private confirmDelete(id?:string){this.view(id?'Slette dette resultatet?':'Slette hele topp 3-listen?',`<p>Slettingen kan ikke angres. Dette sletter bare den lokale topplisten, ikke museumsfremdrift eller allerede publiserte innlegg.</p><div class="score-actions"><button id="score-delete-confirm">Ja, slett</button><button class="primary" id="score-delete-cancel">Behold listen</button></div><p id="score-delete-error" role="alert"></p>`, 'delete');$('#score-delete-cancel').onclick=()=>this.board();$('#score-delete-confirm').onclick=()=>{try{removeResult(localStorage,id);this.board();}catch{$('#score-delete-error').textContent='Sletting kunne ikke bekreftes. Kontroller nettleserens lagringsinnstillinger.';}};}
}
