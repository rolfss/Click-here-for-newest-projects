import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {emptyAttempt,emptyJourney,evidenceCorrect,canComplete,restoreJourney,planText,recordReview,missionReview,learningSummary} from '../src/journey-state.ts';
const missions=JSON.parse(readFileSync(new URL('../cases/missions.json',import.meta.url)));
const cases=JSON.parse(readFileSync(new URL('../cases/cases.json',import.meta.url)));

test('Every real case has one playable mission with distinct, complete branches',()=>{
  assert.deepEqual(missions.map(m=>m.id),cases.map(c=>c.id));
  for(const m of missions){assert.equal(m.clues.length,4);assert.equal(m.clues.filter(c=>c.relevant).length,2);assert.equal(new Set(m.clues.map(c=>c.id)).size,4);assert.equal(m.options.length,3);assert.equal(m.options.filter(o=>o.protected).length,1);for(const o of m.options){assert.equal(o.timeline.length,3);assert.ok(o.timeline.every(e=>e.when&&e.title&&e.text));}assert.ok(m.action&&m.proof);}
});
test('Every subset of evidence is evaluated exactly; selecting everything never wins',()=>{
  for(const m of missions)for(let mask=0;mask<16;mask++){
    const selected=m.clues.filter((_,i)=>mask&(1<<i)).map(c=>c.id);
    const expected=m.clues.every(c=>selected.includes(c.id)===c.relevant);
    assert.equal(evidenceCorrect(m,selected),expected,`${m.id} subset ${mask}`);
  }
  assert.equal(evidenceCorrect(missions[0],['status','status']),false);
});
test('All 15 branches require checked evidence and the full protective consequence chain',()=>{
  for(const m of missions)for(let choice=0;choice<3;choice++)for(let turn=0;turn<3;turn++){
    const a={...emptyAttempt(),selected:m.clues.filter(c=>c.relevant).map(c=>c.id),checked:true,choice,turn};
    assert.equal(canComplete(m,a),m.options[choice].protected&&turn===2);
    assert.equal(canComplete(m,{...a,checked:false}),false);
  }
});
test('Reviewed progress survives reload; a bare completed flag cannot award a badge',()=>{
  const state=emptyJourney();for(const m of missions){
    const selected=m.clues.filter(c=>c.relevant).map(c=>c.id),choice=m.options.findIndex(o=>o.protected);
    const a={...emptyAttempt(),selected,firstEvidence:[...selected],checked:true,choice,turn:2,completed:true,completedReview:{selected:[...selected],choice}};
    recordReview(m,a);state.attempts[m.id]=a;
  }
  assert.deepEqual(restoreJourney(JSON.stringify(state),missions),state);
  state.attempts.osen.completedReview=null;assert.equal(restoreJourney(JSON.stringify(state),missions).attempts.osen.completed,false);
  assert.deepEqual(restoreJourney('invalid',missions),emptyJourney());
  assert.deepEqual(restoreJourney('{"version":42}',missions),emptyJourney());
  assert.deepEqual(restoreJourney('x'.repeat(65000),missions),emptyJourney());
});

test('All branches carry transparent bounded assessments and distinguish leadership quality from historical fact',()=>{
  for(const m of missions){
    assert.ok(m.learningGoal?.length>15,m.id);assert.ok(m.historicalBoundary?.length>30,m.id);
    for(const option of m.options){
      assert.ok(option.assessment?.reason.length>20);assert.ok(option.assessment?.nextStep.length>15);
      for(const value of [option.assessment.decision,option.assessment.followUp])assert.ok([0,1,2].includes(value));
      if(option.protected)assert.equal(option.assessment.decision+option.assessment.followUp,4);
      else assert.ok(option.assessment.decision+option.assessment.followUp<4,'Unsafe branch cannot equal complete decision and follow-up credit');
    }
  }
});

test('Evidence rubric rewards relevant discrimination and never rewards selecting all clues',()=>{
  for(const m of missions){
    const right=m.clues.filter(c=>c.relevant).map(c=>c.id),wrong=m.clues.filter(c=>!c.relevant).map(c=>c.id);
    for(let choice=0;choice<m.options.length;choice++){
      for(const [selected,evidence] of [[[],0],[[right[0]],1],[right,2],[wrong,0],[[right[0],wrong[0]],0],[m.clues.map(c=>c.id),0]]){
        const review=missionReview(m,{selected,choice});assert.equal(review.evidence,evidence);
        assert.equal(review.decision,m.options[choice].assessment.decision);assert.equal(review.followUp,m.options[choice].assessment.followUp);
        assert.ok(review.total>=0&&review.total<=6);assert.equal(review.max,6);
      }
    }
    for(const review of [null,{selected:[right[0],right[0]],choice:0},{selected:['unknown'],choice:0},{selected:right,choice:-1},{selected:right,choice:99},{selected:right,choice:.5}])assert.equal(missionReview(m,review),null);
  }
});

test('Reviews are recorded only after the whole chosen branch, never by opening or skipping unchecked evidence',()=>{
  for(const m of missions)for(let choice=0;choice<m.options.length;choice++){
    const selected=m.clues.filter(c=>c.relevant).map(c=>c.id);
    for(let turn=0;turn<3;turn++){
      const a={...emptyAttempt(),selected,firstEvidence:[...selected],checked:true,choice,turn};
      assert.equal(recordReview(m,a),turn===2);
      assert.equal(a.firstReview!==null,turn===2);assert.equal(a.latestReview!==null,turn===2);assert.equal(a.completed,false);
    }
    for(const changes of [{checked:false},{selected:m.clues.map(c=>c.id)},{choice:99},{turn:99}]){
      const a={...emptyAttempt(),selected,firstEvidence:[...selected],checked:true,choice,turn:2,...changes};
      assert.equal(recordReview(m,a),false);assert.equal(a.latestReview,null);
    }
  }
});

test('First evidence and first reviewed decision remain visible after improvement without cumulative point farming',()=>{
  const m=missions[0],right=m.clues.filter(c=>c.relevant).map(c=>c.id),all=m.clues.map(c=>c.id);
  const firstChoice=m.options.findIndex(o=>!o.protected),bestChoice=m.options.findIndex(o=>o.protected);
  const a={...emptyAttempt(),selected:[...right],firstEvidence:[...all],checked:true,choice:firstChoice,turn:2};
  assert.equal(recordReview(m,a),true);const first=structuredClone(a.firstReview);
  assert.equal(missionReview(m,first).evidence,0);
  a.choice=bestChoice;assert.equal(recordReview(m,a),true);
  assert.deepEqual(a.firstReview,first);assert.equal(missionReview(m,a.latestReview).total,6);
  const state=emptyJourney();state.attempts[m.id]=a;
  for(let i=0;i<25;i++)recordReview(m,a);
  const summary=learningSummary(missions,state);
  assert.equal(summary.current,6);assert.equal(summary.assessed,1);assert.equal(summary.assessedMax,6);assert.equal(summary.max,30);
  assert.equal(summary.firstCount,1);assert.equal(summary.firstMax,6);assert.equal(summary.first,missionReview(m,first).total);
  a.selected.length=0;assert.deepEqual(a.firstReview,first);assert.deepEqual(a.latestReview.selected,right,'Snapshots do not share mutable selection arrays');
});

test('Replaying a worse branch retains an earned badge but reports the actual latest judgment',()=>{
  const m=missions[0],selected=m.clues.filter(c=>c.relevant).map(c=>c.id),choice=m.options.findIndex(o=>o.protected);
  const a={...emptyAttempt(),selected,firstEvidence:[...selected],checked:true,choice,turn:2,completed:true,completedReview:{selected:[...selected],choice}};
  recordReview(m,a);a.replaying=true;a.choice=m.options.findIndex(o=>!o.protected);recordReview(m,a);
  const state=emptyJourney();state.attempts[m.id]=a;state.plan[m.id]={selected:true,owner:'Systemeier',due:'2026-10-01'};
  const restored=restoreJourney(JSON.stringify(state),missions);
  assert.equal(restored.attempts[m.id].completed,true);assert.equal(restored.attempts[m.id].replaying,true);
  assert.equal(learningSummary(missions,restored).first,6);assert.ok(learningSummary(missions,restored).current<6);
  assert.deepEqual(restored.plan,state.plan);
});

test('Version-one saves preserve only supported earned work and the leader order, without fabricated scores',()=>{
  const old={version:1,attempts:{},plan:{osen:{selected:true,owner:'Arkivleder',due:'2026-10-01'}}};
  for(const m of missions)old.attempts[m.id]={selected:m.clues.filter(c=>c.relevant).map(c=>c.id),checked:true,choice:m.options.findIndex(o=>o.protected),turn:2,completed:true};
  const restored=restoreJourney(JSON.stringify(old),missions);
  assert.equal(restored.version,2);assert.deepEqual(restored.plan,old.plan);
  for(const m of missions){const a=restored.attempts[m.id];assert.equal(a.completed,true);assert.ok(a.completedReview);assert.equal(a.firstEvidence,null);assert.equal(a.firstReview,null);assert.equal(a.latestReview,null);}
  assert.deepEqual(learningSummary(missions,restored),{assessed:0,current:0,max:30,assessedMax:0,first:0,firstCount:0,firstMax:0});
  const m=missions[0],a=restored.attempts[m.id];recordReview(m,a);
  assert.equal(learningSummary(missions,restored).assessed,1);assert.equal(learningSummary(missions,restored).firstCount,0);
  old.attempts.osen.turn=0;assert.equal(restoreJourney(JSON.stringify(old),missions).attempts.osen.completed,false);
});

test('Invalid saved reviews cannot earn a badge or increase a rubric score',()=>{
  const m=missions[0],selected=m.clues.filter(c=>c.relevant).map(c=>c.id),all=m.clues.map(c=>c.id),choice=m.options.findIndex(o=>o.protected);
  const base={...emptyAttempt(),selected,checked:true,choice,turn:2,completed:true,replaying:true,firstEvidence:all,
    firstReview:{selected:all,choice},latestReview:{selected:all,choice},completedReview:{selected,choice:m.options.findIndex(o=>!o.protected)}};
  const state=restoreJourney(JSON.stringify({version:2,attempts:{[m.id]:base}}),missions),a=state.attempts[m.id];
  assert.equal(a.completed,false);assert.equal(a.replaying,false);assert.equal(a.latestReview,null);
  assert.equal(missionReview(m,a.firstReview).evidence,0);assert.equal(learningSummary(missions,state).current,0);
  for(const changes of [{firstEvidence:['unknown']},{firstReview:{selected,choice}},{firstReview:{selected:all,choice:99}}]){
    const restored=restoreJourney(JSON.stringify({version:2,attempts:{[m.id]:{...base,...changes}}}),missions);
    assert.equal(restored.attempts[m.id].firstReview,null);
  }
});
test('Malformed stored input is bounded and cannot select nonexistent options',()=>{
  const data={version:1,attempts:{osen:{selected:['status','type','type','unknown'],checked:true,choice:999,turn:99,completed:true}},plan:{osen:{selected:true,owner:'x'.repeat(200),due:'garbage'}}};
  const s=restoreJourney(JSON.stringify(data),missions);assert.deepEqual(s.attempts.osen.selected,['status','type']);assert.equal(s.attempts.osen.choice,null);assert.equal(s.attempts.osen.completed,false);assert.equal(s.plan.osen.owner.length,100);assert.equal(s.plan.osen.due,'');
});
test('Leader order exports only selected actions and preserves responsibility and follow-up',()=>{
  const state=emptyJourney();state.plan.tokke={selected:true,owner:'Systemeier',due:'2026-10-01'};state.plan.osen={selected:false,owner:'',due:''};
  const text=planText(missions,state);assert.ok(text.includes(missions[1].action));assert.ok(text.includes(missions[1].proof));assert.ok(text.includes('Systemeier'));assert.ok(text.includes('2026-10-01'));assert.ok(!text.includes(missions[0].action));
});
test('Real images are bundled, attributed and distinguished from the simulated case',()=>{
  const illustrated=cases.filter(c=>c.image);assert.equal(illustrated.length,4);
  for(const c of illustrated){const i=c.image;assert.ok(existsSync(new URL('../public/'+i.src,import.meta.url)));for(const key of ['sourceUrl','licenseUrl'])assert.ok(i[key].startsWith('https://'));assert.ok(i.alt&&i.credit&&i.caption&&i.width>0&&i.height>0);}
  assert.match(cases.find(c=>c.id==='hanekleiv').image.caption,/2010/);
  assert.match(cases.find(c=>c.id==='tokke').image.caption,/Stedsbilde/);
});
