import questions from '../cases/score-questions.json' with {type:'json'};
export const QUESTIONS=questions;
export const RULESET='museum-knowledge-v1';
export const BOARD_KEY='arkivmuseet-top3-v1';
export const MAX_SCORE=QUESTIONS.length*10;
export const CONSENT='Jeg godtar at visningsnavnet og poengsummen min vises i topp 3 på denne enheten og kan publiseres av arrangøren på Viva Engage.';
export type ScoreEntry={id:string;name:string;score:number;completedAt:number;consent:true;consentVersion:1;ruleset:typeof RULESET};
export type ScoreRound={id:string;name:string;consent:boolean;answers:(number|null)[]};
export type ScoreStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function cleanName(value:unknown):string{
 if(typeof value!=='string')return '';
 return value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/gu,' ').trim().slice(0,60);
}
export function nameKey(value:string){return cleanName(value).toLocaleLowerCase('nb-NO');}
export function newRound(id:string,name='',consent=false):ScoreRound{
 if(!/^[\w-]{1,80}$/.test(id))throw new Error('Ugyldig runde-ID.');
 return {id,name:consent?cleanName(name):'',consent:consent&&!!cleanName(name),answers:QUESTIONS.map(()=>null)};
}
export function answer(round:ScoreRound,index:number,choice:number):ScoreRound{
 if(!Number.isInteger(index)||index<0||index>=QUESTIONS.length||!Number.isInteger(choice)||choice<0||choice>=QUESTIONS[index].options.length)throw new Error('Ugyldig svar.');
 if(round.answers[index]!==null)return round; // First confirmed answer is final.
 if(round.answers.slice(0,index).some(a=>a===null))throw new Error('Svar på spørsmålene i rekkefølge.');
 const answers=[...round.answers];answers[index]=choice;return {...round,answers};
}
export function points(round:ScoreRound){return QUESTIONS.reduce((sum,q,i)=>sum+(round.answers[i]===q.correct?10:0),0);}
export function resultEntry(round:ScoreRound,now=Date.now()):ScoreEntry|null{
 if(!round.consent||!cleanName(round.name)||round.answers.length!==QUESTIONS.length||round.answers.some((a,i)=>typeof a!=='number'||!Number.isInteger(a)||a<0||a>=QUESTIONS[i].options.length))return null;
 return {id:round.id,name:cleanName(round.name),score:points(round),completedAt:now,consent:true,consentVersion:1,ruleset:RULESET};
}
function validEntry(e:unknown):e is ScoreEntry{
 if(!e||typeof e!=='object')return false;const v=e as ScoreEntry;
 return typeof v.id==='string'&&/^[\w-]{1,80}$/.test(v.id)&&typeof v.name==='string'&&!!cleanName(v.name)&&v.name===cleanName(v.name)&&Number.isInteger(v.score)&&v.score>=0&&v.score<=MAX_SCORE&&v.score%10===0&&Number.isSafeInteger(v.completedAt)&&v.completedAt>0&&v.consent===true&&v.consentVersion===1&&v.ruleset===RULESET;
}
function order(a:ScoreEntry,b:ScoreEntry){return b.score-a.score||a.completedAt-b.completedAt||a.id.localeCompare(b.id);}
export function rank(entries:ScoreEntry[]):ScoreEntry[]{
 const names=new Set<string>(),ids=new Set<string>();
 return entries.filter(validEntry).sort(order).filter(e=>{const k=nameKey(e.name);if(names.has(k)||ids.has(e.id))return false;names.add(k);ids.add(e.id);return true;}).slice(0,3).map(e=>({id:e.id,name:e.name,score:e.score,completedAt:e.completedAt,consent:true,consentVersion:1,ruleset:RULESET}));
}
export function decodeBoard(raw:string|null):ScoreEntry[]{
 if(raw===null)return [];
 if(raw.length>8000)throw new Error('Topplisten er skadet.');
 let doc;try{doc=JSON.parse(raw);}catch{throw new Error('Topplisten er skadet.');}
 if(doc?.version!==1||doc.ruleset!==RULESET||!Array.isArray(doc.entries)||doc.entries.length>3||!doc.entries.every(validEntry))throw new Error('Topplisten har et ukjent eller skadet format.');
 return rank(doc.entries);
}
export function readBoard(storage:ScoreStorage){return decodeBoard(storage.getItem(BOARD_KEY));}
export function saveResult(storage:ScoreStorage,round:ScoreRound,now=Date.now()){
 const entry=resultEntry(round,now),current=readBoard(storage);
 if(!entry)return {entries:current,position:0,saved:false};
 const entries=rank([...current,entry]),position=entries.findIndex(e=>e.id===entry.id)+1;
 if(!position)return {entries:current,position:0,saved:false}; // Non-qualifiers are never written.
 const text=JSON.stringify({version:1,ruleset:RULESET,entries});
 storage.setItem(BOARD_KEY,text);
 if(storage.getItem(BOARD_KEY)!==text)throw new Error('Lagringen kunne ikke bekreftes.');
 return {entries,position,saved:true};
}
export function removeResult(storage:ScoreStorage,id?:string){
 if(id){const entries=readBoard(storage).filter(e=>e.id!==id);storage.setItem(BOARD_KEY,JSON.stringify({version:1,ruleset:RULESET,entries}));if(readBoard(storage).some(e=>e.id===id))throw new Error('Sletting kunne ikke bekreftes.');}
 else{storage.removeItem(BOARD_KEY);if(storage.getItem(BOARD_KEY)!==null)throw new Error('Sletting kunne ikke bekreftes.');}
}
export function publicationText(entries:ScoreEntry[]){
 const top=rank(entries);return ['Arkivmuseet – topp 3','',...top.map((e,i)=>`${i+1}. ${e.name} – ${e.score}/${MAX_SCORE} poeng`),'','Kunnskapsrunde om dokumentasjon og lederansvar. 10 spørsmål, 10 poeng per riktig svar. Ingen tidspoeng.','Resultatene gjelder denne lokale arrangementslisten. Ved lik poengsum beholdes først registrerte resultat.'].join('\n');
}
