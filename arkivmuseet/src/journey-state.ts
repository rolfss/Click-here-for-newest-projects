export type Mission = {
  id:string; badge:string; title:string; brief:string; task:string;
  clues:{id:string;title:string;detail:string;relevant:boolean;feedback:string}[];
  decision:string; options:{title:string;tradeoff:string;protected:boolean;timeline:{when:string;title:string;text:string}[]}[];
  action:string; proof:string;
};
export type Attempt = {selected:string[];checked:boolean;choice:number|null;turn:number;completed:boolean};
export type PlanItem = {selected:boolean;owner:string;due:string};
export type JourneyState = {version:1;attempts:Record<string,Attempt>;plan:Record<string,PlanItem>};
export const emptyAttempt=():Attempt=>({selected:[],checked:false,choice:null,turn:0,completed:false});
export const emptyJourney=():JourneyState=>({version:1,attempts:{},plan:{}});
export function evidenceCorrect(m:Mission,selected:string[]){
  const relevant=m.clues.filter(c=>c.relevant).map(c=>c.id);
  return selected.length===relevant.length&&new Set(selected).size===selected.length&&relevant.every(id=>selected.includes(id));
}
export function canComplete(m:Mission,a:Attempt){
  const option=a.choice===null?undefined:m.options[a.choice];
  return a.checked&&evidenceCorrect(m,a.selected)&&!!option?.protected&&a.turn===option.timeline.length-1;
}
export function restoreJourney(raw:string|null,missions:Mission[]):JourneyState{
  const state=emptyJourney();
  try{
    const value=JSON.parse(raw||'null');if(value?.version!==1)return state;
    for(const m of missions){
      const a=value.attempts?.[m.id];
      if(a&&typeof a==='object'){
        const next=emptyAttempt();
        next.selected=Array.isArray(a.selected)?[...new Set<string>(a.selected.filter((id:unknown):id is string=>typeof id==='string'&&m.clues.some(c=>c.id===id)))]:[];
        next.checked=a.checked===true&&evidenceCorrect(m,next.selected);
        next.choice=next.checked&&Number.isInteger(a.choice)&&a.choice>=0&&a.choice<m.options.length?a.choice:null;
        const last=next.choice===null?0:m.options[next.choice].timeline.length-1;
        next.turn=Number.isInteger(a.turn)?Math.max(0,Math.min(last,a.turn)):0;
        next.completed=a.completed===true&&canComplete(m,next);
        state.attempts[m.id]=next;
      }
      const p=value.plan?.[m.id];
      if(p&&typeof p==='object')state.plan[m.id]={selected:p.selected===true,owner:typeof p.owner==='string'?p.owner.slice(0,100):'',due:validPlanDate(p.due)?p.due:''};
    }
  }catch{/* Damaged or unavailable browser storage must never prevent a visit. */}
  return state;
}
export function planText(missions:Mission[],state:JourneyState){
  const selected=missions.filter(m=>state.plan[m.id]?.selected);
  return ['ARKIVMUSEET · MIN LEDERBESTILLING','Ta med til neste ledermøte. Tiltakene må tilpasses virksomheten.','',
    ...selected.flatMap((m,i)=>[`${i+1}. ${m.badge}`,`Bestilling: ${m.action}`,`Ansvarlig rolle: ${state.plan[m.id].owner||'Avklares i ledermøtet'}`,`Oppfølging: ${state.plan[m.id].due||'Avklares i ledermøtet'}`,`Be om å få se: ${m.proof}`,'']),
    'Første møte: Velg en konkret sak eller leveranse. Avtal hvem som prøver gjenfinning, når dere følger opp, og hvordan avvik lukkes.',
    'Læringsøvelse, ikke en vurdering av virksomhetens etterlevelse. Ingen faktiske saksopplysninger er nødvendige.'].join('\n');
}

/** Select a practical action without awarding or changing any exercise progress. */
export function selectPlanItem(state:JourneyState,missions:Mission[],id:string):boolean{
  if(!missions.some(m=>m.id===id))return false;
  const item=state.plan[id]??={selected:false,owner:'',due:''};
  item.selected=true;
  return true;
}


export function validPlanDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function datedPlan(missions: Mission[], state: JourneyState) {
  return missions.filter(m => state.plan[m.id]?.selected && validPlanDate(state.plan[m.id].due));
}

// RFC 5545 sections 3.1, 3.3.11 and 3.6.1: escape TEXT, fold UTF-8 at
// <=75 octets, use CRLF, and make DATE-only events one day without a timezone.
const text = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string) {
  const encoder = new TextEncoder();
  let result = '', octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) { result += '\r\n '; octets = 1; }
    result += character; octets += size;
  }
  return result;
}

/** A local file only: no calendar account, invitations, alerts or network calls. */
export function planCalendar(missions: Mission[], state: JourneyState, now = new Date(), uid = crypto.randomUUID()) {
  const selected = datedPlan(missions, state);
  if (!selected.length) throw new Error('Velg minst ett tiltak med gyldig oppfølgingsdato.');
  if (!Number.isFinite(now.getTime()) || !/^[0-9a-f-]{36}$/i.test(uid)) throw new Error('Ugyldig kalenderidentifikator.');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arkivmuseet//Lederbestilling//NO', 'CALSCALE:GREGORIAN'];
  selected.forEach((m, index) => {
    const item = state.plan[m.id];
    const description = [`Ansvarlig rolle: ${item.owner || 'Avklares i ledermøtet'}`, `Bestilling: ${m.action}`,
      `Be om å få se: ${m.proof}`, 'Tiltaket må tilpasses virksomheten. Ikke en vurdering av etterlevelse.'].join('\n');
    lines.push('BEGIN:VEVENT', `UID:${uid}-${index}@arkivmuseet.invalid`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${item.due.replace(/-/g, '')}`, `SUMMARY:${text(`Følg opp: ${m.badge}`)}`,
      `DESCRIPTION:${text(description)}`, 'TRANSP:TRANSPARENT', 'CLASS:PRIVATE', 'END:VEVENT');
  });
  return [...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
