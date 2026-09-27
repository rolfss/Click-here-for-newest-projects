export type Mission = {
  id:string; badge:string; title:string; brief:string; task:string; learningGoal:string; historicalBoundary:string;
  clues:{id:string;title:string;detail:string;relevant:boolean;feedback:string}[];
  decision:string; options:{title:string;tradeoff:string;protected:boolean;assessment:{decision:0|1|2;followUp:0|1|2;reason:string;nextStep:string};timeline:{when:string;title:string;text:string}[]}[];
  action:string; proof:string;
};
export type Review = {selected:string[];choice:number};
export type MissionReview = {evidence:number;decision:number;followUp:number;total:number;max:6};
export type Attempt = {selected:string[];checked:boolean;choice:number|null;turn:number;completed:boolean;
  replaying:boolean;firstEvidence:string[]|null;firstReview:Review|null;latestReview:Review|null;completedReview:Review|null};
export type PlanItem = {selected:boolean;owner:string;due:string};
export type JourneyState = {version:2;attempts:Record<string,Attempt>;plan:Record<string,PlanItem>};
export const emptyAttempt=():Attempt=>({selected:[],checked:false,choice:null,turn:0,completed:false,
  replaying:false,firstEvidence:null,firstReview:null,latestReview:null,completedReview:null});
export const emptyJourney=():JourneyState=>({version:2,attempts:{},plan:{}});
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function validSelection(m:Mission,value:unknown):value is string[]{
  return Array.isArray(value)&&value.length<=m.clues.length&&new Set(value).size===value.length&&
    value.every(id=>typeof id==='string'&&m.clues.some(clue=>clue.id===id));
}
function restoreReview(m:Mission,value:unknown):Review|null{
  if(!object(value)||!validSelection(m,value.selected)||!Number.isInteger(value.choice)||
    typeof value.choice!=='number'||value.choice<0||value.choice>=m.options.length)return null;
  return {selected:[...value.selected],choice:value.choice};
}
export function evidenceCorrect(m:Mission,selected:string[]){
  const relevant=m.clues.filter(c=>c.relevant).map(c=>c.id);
  return selected.length===relevant.length&&new Set(selected).size===selected.length&&relevant.every(id=>selected.includes(id));
}
export function canComplete(m:Mission,a:Attempt){
  const option=a.choice===null?undefined:m.options[a.choice];
  return a.checked&&evidenceCorrect(m,a.selected)&&!!option?.protected&&a.turn===option.timeline.length-1;
}
/** Formative rubric, never a percentage estimate of legal compliance or real-world risk. */
export function missionReview(m:Mission,value:Review|null|undefined):MissionReview|null{
  const review=restoreReview(m,value);if(!review)return null;
  const assessment=m.options[review.choice].assessment;
  if(!assessment||![assessment.decision,assessment.followUp].every(n=>Number.isInteger(n)&&n>=0&&n<=2))return null;
  const relevant=review.selected.filter(id=>m.clues.find(clue=>clue.id===id)!.relevant).length;
  const evidence=Math.min(2,Math.max(0,relevant-(review.selected.length-relevant)));
  return {evidence,decision:assessment.decision,followUp:assessment.followUp,
    total:evidence+assessment.decision+assessment.followUp,max:6};
}
/** Only a fully viewed branch can update the latest review. Repetition never adds points. */
export function recordReview(m:Mission,a:Attempt):boolean{
  const review=restoreReview(m,{selected:a.selected,choice:a.choice});
  if(!review||!a.checked||!evidenceCorrect(m,a.selected)||a.turn!==m.options[review.choice].timeline.length-1)return false;
  if(!a.firstReview&&validSelection(m,a.firstEvidence))a.firstReview={selected:[...a.firstEvidence],choice:review.choice};
  a.latestReview=review;
  return true;
}
export function learningSummary(missions:Mission[],state:JourneyState){
  let assessed=0,current=0,first=0,firstCount=0;
  for(const m of missions){
    const a=state.attempts[m.id];
    const latest=missionReview(m,a?.latestReview),initial=missionReview(m,a?.firstReview);
    if(latest){assessed++;current+=latest.total;}
    if(initial){firstCount++;first+=initial.total;}
  }
  return {assessed,current,max:missions.length*6,assessedMax:assessed*6,first,firstCount,firstMax:firstCount*6};
}
export function restoreJourney(raw:string|null,missions:Mission[]):JourneyState{
  const state=emptyJourney();
  try{
    if(!raw||raw.length>64000)return state;
    const value=JSON.parse(raw);if(!object(value)||(value.version!==1&&value.version!==2))return state;
    const attempts=object(value.attempts)?value.attempts:{},plan=object(value.plan)?value.plan:{};
    for(const m of missions){
      const a=attempts[m.id];
      if(object(a)){
        const next=emptyAttempt();
        next.selected=Array.isArray(a.selected)?[...new Set<string>(a.selected.filter((id:unknown):id is string=>typeof id==='string'&&m.clues.some(c=>c.id===id)))]:[];
        next.checked=a.checked===true&&evidenceCorrect(m,next.selected);
        next.choice=next.checked&&Number.isInteger(a.choice)&&typeof a.choice==='number'&&a.choice>=0&&a.choice<m.options.length?a.choice:null;
        const last=next.choice===null?0:m.options[next.choice].timeline.length-1;
        next.turn=Number.isInteger(a.turn)&&typeof a.turn==='number'?Math.max(0,Math.min(last,a.turn)):0;
        if(value.version===1){
          // Old saves establish earned completion, but cannot establish the first attempt or a rubric review.
          if(a.completed===true&&canComplete(m,next))next.completedReview={selected:[...next.selected],choice:next.choice!};
        }else{
          next.firstEvidence=validSelection(m,a.firstEvidence)?[...a.firstEvidence]:null;
          const first=restoreReview(m,a.firstReview),latest=restoreReview(m,a.latestReview),completed=restoreReview(m,a.completedReview);
          if(first&&next.firstEvidence&&first.selected.length===next.firstEvidence.length&&
            first.selected.every(id=>next.firstEvidence!.includes(id))&&missionReview(m,first))next.firstReview=first;
          if(latest&&evidenceCorrect(m,latest.selected)&&missionReview(m,latest))next.latestReview=latest;
          if(completed&&evidenceCorrect(m,completed.selected)&&m.options[completed.choice].protected)next.completedReview=completed;
        }
        next.completed=next.completedReview!==null;
        next.replaying=next.completed&&a.replaying===true;
        state.attempts[m.id]=next;
      }
      const p=plan[m.id];
      if(object(p))state.plan[m.id]={selected:p.selected===true,owner:typeof p.owner==='string'?p.owner.slice(0,100):'',due:typeof p.due==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.due)?p.due:''};
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
