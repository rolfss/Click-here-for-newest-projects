/** Saksrally 3: deterministic game rules, independent of rendering and DOM. */
export const VERSION = '3.0.0';
export const SCORE_TTL = 48 * 60 * 60 * 1000;
export const SCORE_KEY = 'fjordsprint-career-scores-v3';
export const CAREERS = Object.freeze([
  {name:'Rådgiver',juice:0,height:80,stars:1,motto:'Et lite steg for bilen. Et stort steg for dokumentasjonen.'},
  {name:'Seniorrådgiver',juice:20,height:220,stars:2,motto:'Du har nå nok erfaring til å vite hvor vedlegget ligger.'},
  {name:'TU/TA',juice:45,height:420,stars:3,motto:'Tjenesten er oppe. Det er du også.'},
  {name:'Produkteier',juice:70,height:680,stars:4,motto:'Oppdrift er prioritert. Tyngdekraft er lagt i kø.'},
  {name:'Produktområdeleder',juice:95,height:980,stars:5,motto:'Porteføljen har forlatt troposfæren.'},
  {name:'Toppleder',juice:120,height:1400,stars:6,motto:'Strategisk høyde nådd. Husk å arkivere landingen.'}
]);
export const EXCUSES = Object.freeze([
  'Jeg har ikke tid til å arkivere', 'Arkivering er ikke saksbehandling',
  'Arkiv er vanskelig', 'Sjefen min arkiverer ikke', 'Det ligger jo i e-posten',
  'Jeg gjør det senere', 'Vi har jo sikkerhetskopi', 'Det er bare en Teams-chat',
  'Ingen spør etter dette', 'Arkivet får ordne det', 'Det er bare et utkast',
  'Alle har jo tilgang', 'Jeg husker hva vi avtalte', 'Det er ikke mitt ansvar',
  'Det er bare et vedlegg', 'Vi bytter system snart', 'Det finnes på min PC',
  'Det er for lite viktig'
]);
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function careerIndex(juice){let i=0;for(let n=1;n<CAREERS.length;n++)if(juice>=CAREERS[n].juice)i=n;return i;}
export function rocketHeight(juice){const i=careerIndex(juice),a=CAREERS[i],b=CAREERS[i+1];return b?a.height+(b.height-a.height)*clamp((juice-a.juice)/(b.juice-a.juice),0,1):a.height+Math.min(juice-120,40)*6;}
export function createChallenge(track,index=0){
  // Keep trolls clear of quiz gates and ramp landings. Exactly twelve per stage.
  const available=[];
  for(let q=.055;q<.965;q+=.026){if(track.config.quiz.every(p=>Math.abs(p-q)>.042)&&track.config.jumps.every(p=>q<p-.026||q>p+.07))available.push(q);}
  const spots=Array.from({length:12},(_,i)=>available[Math.round(i*(available.length-1)/11)]);
  return {time:0,pressure:100,cooldown:0,shots:[],effects:[],nextShot:0,juice:0,correct:0,attempted:0,cleared:0,hits:0,fired:0,bumps:0,combo:0,bestCombo:0,
    trolls:spots.map((q,i)=>({id:i,s:q*track.length,targetX:[0,-5,5,1.5,-3.5,4][(i+index)%6],x:(i%2?1:-1)*(track.config.width/2+5),side:i%2?1:-1,age:0,hp:2,phase:'sleep',flash:0,excuse:EXCUSES[(i+index*5)%EXCUSES.length]}))};
}
export function awardAnswer(game,correct){game.attempted++;if(correct){game.correct++;game.juice+=18;}}
export function aimTarget(game,car){return game.trolls.filter(t=>['entering','active'].includes(t.phase)&&t.s>car.s+3&&t.s-car.s<150).sort((a,b)=>a.s-b.s).find(t=>Math.abs(Math.atan2(t.x-car.x,t.s-car.s)-car.heading)<.16)||null;}
export function stepChallenge(game,car,before,input,dt,{assist=true}={}){
  const events=[];game.time+=dt;game.pressure=Math.min(100,game.pressure+20*dt);game.cooldown=Math.max(0,game.cooldown-dt);
  for(const t of game.trolls){t.flash=Math.max(0,t.flash-dt);if(t.phase==='sleep'&&t.s-car.s<175){t.phase='entering';t.age=0;events.push({type:'troll-warning',troll:t});}
    if(t.phase==='entering'){t.age+=dt;const u=clamp(t.age/1.35,0,1),ease=u*u*(3-2*u);t.x=t.side*(car.roadWidth/2+5||17)+(t.targetX-t.side*(car.roadWidth/2+5||17))*ease;if(u===1)t.phase='active';}
    else if(['clear','bump','passed'].includes(t.phase))t.age+=dt;
  }
  if(input.fire&&game.cooldown<=0&&game.pressure>=9){let heading=car.heading;const target=assist?aimTarget(game,car):null;if(target)heading=Math.atan2(target.x-car.x,target.s-car.s);
    const velocity=105+car.speed*.6;game.shots.push({id:++game.nextShot,s:car.s+3,x:car.x,y:2.65+car.air,vs:Math.cos(heading)*velocity,vx:Math.sin(heading)*velocity,vy:0,life:1.6});game.pressure-=9;game.cooldown=.18;game.fired++;events.push({type:'water'});
  }
  for(const p of game.shots){if(p.life<=0)continue;const oldS=p.s,oldX=p.x,oldY=p.y;p.s+=p.vs*dt;p.x+=p.vx*dt;p.vy-=2.5*dt;p.y+=p.vy*dt;p.life-=dt;
    for(const t of game.trolls){if(!['entering','active'].includes(t.phase)||t.s<oldS-1.5||t.s>p.s+1.5)continue;const u=clamp((t.s-oldS)/(p.s-oldS||1),0,1),x=oldX+(p.x-oldX)*u,y=oldY+(p.y-oldY)*u;
      if(Math.abs(x-t.x)<2.65&&y>.1&&y<6.2){p.life=0;t.hp--;t.flash=.2;game.hits++;game.effects.push({s:t.s,x:t.x,age:0});events.push({type:'splash',troll:t});if(t.hp<=0){t.phase='clear';t.age=0;game.cleared++;game.combo++;game.bestCombo=Math.max(game.bestCombo,game.combo);const juice=6+Math.min(3,Math.floor(game.combo/3));game.juice+=juice;events.push({type:'troll-cleared',troll:t,juice});}break;}
    }
  }
  game.shots=game.shots.filter(p=>p.life>0&&p.y>0);game.effects=game.effects.filter(p=>(p.age+=dt)<.7);
  for(const t of game.trolls){if(!['entering','active'].includes(t.phase))continue;
    if(before.s<=t.s+2.6&&car.s>=t.s-2.6&&Math.abs(car.x-t.x)<3.25&&car.air<4.2){t.phase='bump';t.age=0;car.speed*=.57;car.stagger=1.1;game.bumps++;game.combo=0;events.push({type:'troll-bump',troll:t});}
    else if(car.s>t.s+4){t.phase='passed';t.age=0;game.combo=0;}
  }
  return events;
}
export function scoreRun(game,car,par=120){
  const knowledge=game.correct*1200,trolls=game.cleared*350,accuracy=game.fired?Math.round(100*game.hits/game.fired):0;
  const precision=game.cleared?Math.round(accuracy*8):0,pace=Math.round(3000*clamp(1-car.time/(par*2),0,1)),control=Math.max(0,600-100*(car.crashes+game.bumps));
  return {score:knowledge+trolls+precision+pace+control,juice:game.juice,rank:careerIndex(game.juice),correct:game.correct,cleared:game.cleared,accuracy,timeMs:Math.round(car.time*1000),breakdown:{knowledge,trolls,precision,pace,control}};
}
export function rocketPose(car,elapsed,track,juice){const age=Math.max(0,elapsed),u=clamp((age-1.7)/10,0,1),height=rocketHeight(juice)*(u*u*(3-2*u));return {...car,s:track.length+Math.min(50,age*25),x:car.x*Math.exp(-age*2),heading:car.heading*Math.exp(-age*2),steer:0,speed:0,air:height,rideHeight:height,flightPitch:Math.min(1.36,Math.max(0,age-1)*1.2),boosting:false,turbo:0,stagger:0,drift:0,rocketAge:age};}
export function cleanName(value){if(typeof value!=='string')throw Error('Skriv et navn eller kallenavn.');const name=value.normalize('NFKC').trim().replace(/ +/g,' ');if([...name].length<2||[...name].length>20||!/^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u.test(name))throw Error('Bruk 2–20 tegn: bokstaver, tall, mellomrom, punktum, bindestrek eller understrek.');return name;}
export function validateScore(r,now=Date.now()){
  try{if(!r||!/^(fjord|pass|aurora)-(archive3|time3)-(assist|sport)$/.test(r.board)||typeof r.id!=='string'||!/^[\w-]{8,90}$/.test(r.id))return null;
    for(const [key,min,max] of [['createdAt',0,now],['timeMs',1000,1800000],['score',0,40000],['juice',0,250],['rank',0,5],['correct',0,10],['cleared',0,12],['accuracy',0,100]])if(!Number.isSafeInteger(r[key])||r[key]<min||r[key]>max)return null;
    if(r.expiresAt!==r.createdAt+SCORE_TTL||r.expiresAt<=now||r.rank!==careerIndex(r.juice))return null;
    return {id:r.id,name:cleanName(r.name),board:r.board,createdAt:r.createdAt,expiresAt:r.expiresAt,timeMs:r.timeMs,score:r.score,juice:r.juice,rank:r.rank,correct:r.correct,cleared:r.cleared,accuracy:r.accuracy};
  }catch{return null;}
}
export function rankScores(rows,board,now=Date.now()){const best=new Map();for(const raw of Array.isArray(rows)?rows:[]){const r=validateScore(raw,now);if(!r||r.board!==board)continue;const key=r.name.toLocaleLowerCase('nb-NO'),old=best.get(key);if(!old||r.score>old.score||(r.score===old.score&&r.timeMs<old.timeMs))best.set(key,r);}return [...best.values()].sort((a,b)=>b.score-a.score||a.timeMs-b.timeMs||a.createdAt-b.createdAt||a.id.localeCompare(b.id)).slice(0,50);}
export class ScoreStore{
  constructor(storage,clock=Date.now){if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}this.storage=storage;this.clock=clock;this.memory=[];this.persistent=!!storage;}
  all(){let rows=this.memory;try{if(this.storage)rows=JSON.parse(this.storage.getItem(SCORE_KEY)||'[]');}catch{this.storage=null;this.persistent=false;}this.memory=(Array.isArray(rows)?rows:[]).map(r=>validateScore(r,this.clock())).filter(Boolean);this.write();return this.memory;}
  write(){try{this.storage?.setItem(SCORE_KEY,JSON.stringify(this.memory));}catch{this.storage=null;this.persistent=false;}}
  add(result){const rows=this.all(),existing=rows.find(r=>r.id===result.id);if(existing)return existing;const now=this.clock(),r=validateScore({...result,createdAt:now,expiresAt:now+SCORE_TTL},now);if(!r)throw Error('Ugyldig resultat. Fullfør et nytt løp.');if(rows.length>=2000)throw Error('Poengtavlen er full. Slett lokale resultater først.');this.memory.push(r);this.write();return r;}
  clear(){this.memory=[];this.write();}
}
