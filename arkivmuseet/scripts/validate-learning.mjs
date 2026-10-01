/** Publishing guard for learning data; editorial accuracy still requires source review. */
export function validateLearning(missions, scenarios, investigation, cases) {
  const caseIds=new Set(cases.map(c=>c.id));
  const text=value=>typeof value==='string'&&value.trim().length>0;
  if(missions.length!==cases.length||new Set(missions.map(m=>m.id)).size!==missions.length)throw Error('Oppdragene må dekke hver utstilling én gang');
  for(const m of missions){
    if(!caseIds.has(m.id)||!text(m.learningGoal)||!text(m.historicalBoundary))throw Error('Oppdrag mangler læringsmål eller kildeavgrensning');
    if(m.clues.length!==4||new Set(m.clues.map(c=>c.id)).size!==4||m.clues.filter(c=>c.relevant).length!==2)throw Error('Oppdraget må ha fire unike spor og to avgjørende spor');
    if(m.options.length!==3||m.options.filter(o=>o.protected).length!==1)throw Error('Oppdraget må ha tre alternativer og ett gjennomarbeidet ledergrep');
    for(const o of m.options){
      const a=o.assessment;
      if(!a||![a.decision,a.followUp].every(n=>Number.isInteger(n)&&n>=0&&n<=2)||!text(a.reason)||!text(a.nextStep))throw Error('Ufullstendig vurderingsgrunnlag');
      if(o.protected&&(a.decision!==2||a.followUp!==2))throw Error('Læringsmerket må bygge på begge lederkriteriene');
      if(!o.protected&&a.decision===2&&a.followUp===2)throw Error('Full skår og læringsmerke må samsvare');
      if(o.timeline.length!==3||o.timeline.some(e=>![e.when,e.title,e.text].every(text)))throw Error('Konsekvensrekken må ha tre tydelige tidspunkt');
    }
  }
  for(const s of scenarios)if(!caseIds.has(s.sourceCaseId)||!text(s.historicalBoundary)||s.choices.length!==s.effects.length)throw Error('Lederscenario mangler kildebro eller samsvarende følger');
  const order=investigation.evidence.map(e=>e.chronologicalOrder).sort((a,b)=>a-b);
  if(order.length!==10||order.some((n,i)=>n!==i+1))throw Error('Aurora må ha ti unike kronologiske plasseringer');
  return true;
}
