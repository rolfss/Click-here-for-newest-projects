/* Pocket Blast: original bomb-maze arcade game. No external dependencies. */
'use strict';
const COLS=13, ROWS=11, DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
const key=(x,y)=>x+','+y;
function random(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
class PocketGame {
 constructor(seed=Date.now()){this.seed=seed>>>0;this.mode='menu';this.level=1;this.lives=3;this.score=0;this.stats={bombs:1,range:2,speed:0,shield:0};this.events=[];this.checkpoint=null;this.time=0;this.load();this.mode='menu';}
 event(type,data={}){this.events.push({type,...data});}
 start(){this.level=1;this.lives=3;this.score=0;this.stats={bombs:1,range:2,speed:0,shield:0};this.checkpoint=null;this.load();this.event('start');}
 load(){
  this.rng=random(this.seed+this.level*9173);this.map=[];this.bombs=[];this.flames=[];this.items={};this.hidden={};this.enemies=[];this.particles=[];this.time=0;this.remaining=180;this.nextId=0;this.input=-1;this.mode='play';this.banner=4;
  if(!this.checkpoint)this.checkpoint={score:this.score,stats:{...this.stats}};
  const safe=new Set(['1,1','2,1','3,1','1,2','3,2','1,3','2,3']);
  for(let y=0;y<ROWS;y++){this.map[y]=[];for(let x=0;x<COLS;x++)this.map[y][x]=(x===0||y===0||x===COLS-1||y===ROWS-1||(x%2===0&&y%2===0))?1:(!safe.has(key(x,y))&&this.rng()<.38+.015*this.level?2:0);}
  this.player=this.actor(1,1);this.player.inv=1.6;this.exit={x:11,y:9};this.map[9][11]=2;
  const spawns=[[11,1],[9,7],[5,9],[7,3],[11,7],[5,5],[9,1]];
  for(let i=0;i<Math.min(7,2+this.level);i++){
   const [x,y]=spawns[i];this.map[y][x]=0;
   const near=DIRS.map(([dx,dy])=>[x+dx,y+dy]).filter(([xx,yy])=>this.tile(xx,yy)!==1&&key(xx,yy)!=='11,9');
   if(near.length){const [xx,yy]=near[Math.floor(this.rng()*near.length)];this.map[yy][xx]=0;}
   const e=this.actor(x,y);e.kind=i===0?0:Math.min(2,Math.floor((this.level+i-1)/3));e.dir=Math.floor(this.rng()*4);e.wait=.5+this.rng();this.enemies.push(e);
  }
  // These two early crates always contain useful upgrades.
  this.map[1][4]=2;this.hidden['4,1']='range';this.map[3][3]=2;this.hidden['3,3']='bomb';
  const boxes=[];for(let y=1;y<ROWS-1;y++)for(let x=1;x<COLS-1;x++)if(this.tile(x,y)===2&&key(x,y)!=='11,9'&&!this.hidden[key(x,y)])boxes.push([x,y]);
  for(const type of ['speed','shield','range','bomb','speed'])if(boxes.length){const i=Math.floor(this.rng()*boxes.length),[x,y]=boxes.splice(i,1)[0];this.hidden[key(x,y)]=type;}
 }
 actor(x,y){return{x,y,ox:x,oy:y,tx:x,ty:y,p:1,moving:false,dir:2,inv:0,wait:0};}
 tile(x,y){return this.map[y]?.[x]??1;}
 pos(a){return a.moving?{x:a.ox+(a.tx-a.ox)*a.p,y:a.oy+(a.ty-a.oy)*a.p}:{x:a.x,y:a.y};}
 cell(a){const p=this.pos(a);return{x:Math.round(p.x),y:Math.round(p.y)};}
 bombAt(x,y){return this.bombs.find(b=>b.x===x&&b.y===y);}
 fireAt(x,y){return this.flames.some(f=>f.x===x&&f.y===y&&f.end>this.time);}
 canStep(x,y){return this.tile(x,y)===0&&!this.bombAt(x,y);}
 move(a,d){if(a.moving||d<0)return false;const [dx,dy]=DIRS[d];a.dir=d;if(!this.canStep(a.x+dx,a.y+dy))return false;a.ox=a.x;a.oy=a.y;a.tx=a.x+dx;a.ty=a.y+dy;a.p=0;a.moving=true;return true;}
 walk(a,dt,duration){if(!a.moving)return;a.p=Math.min(1,a.p+dt/duration);if(a.p>=1){a.x=a.tx;a.y=a.ty;a.moving=false;}}
 aim(d){this.input=d;if(this.mode==='play')this.move(this.player,d);}
 plant(){
  if(this.mode!=='play'||this.bombs.length>=this.stats.bombs)return false;
  const {x,y}=this.cell(this.player);if(this.tile(x,y)!==0||this.bombAt(x,y))return false;
  this.bombs.push({id:++this.nextId,x,y,fuse:2.25,range:this.stats.range});this.event('bomb');return true;
 }
 blastCells(b){const cells=[{x:b.x,y:b.y}];for(const [dx,dy] of DIRS)for(let i=1;i<=b.range;i++){const x=b.x+dx*i,y=b.y+dy*i,t=this.tile(x,y);if(t===1)break;cells.push({x,y});if(t===2||this.bombAt(x,y))break;}return cells;}
 explode(b){
  if(!this.bombs.includes(b))return;const cells=this.blastCells(b);this.bombs=this.bombs.filter(v=>v!==b);this.event('boom',{x:b.x,y:b.y});
  for(const {x,y} of cells){const k=key(x,y);this.flames.push({x,y,end:this.time+.55});
   if(this.tile(x,y)===2){this.map[y][x]=0;this.score+=10;this.debris(x,y);if(this.hidden[k]){this.items[k]={type:this.hidden[k],safe:this.time+.62};delete this.hidden[k];}}
   else if(this.items[k]&&this.items[k].safe<this.time)delete this.items[k];
   const next=this.bombAt(x,y);if(next)this.explode(next);
  }
 }
 debris(x,y){for(let i=0;i<6;i++)this.particles.push({x:x+.5,y:y+.5,vx:(this.rng()-.5)*5,vy:-1-this.rng()*3,life:.5});}
 danger(x,y){return this.fireAt(x,y)||this.bombs.some(b=>b.fuse<1.5&&this.blastCells(b).some(c=>c.x===x&&c.y===y));}
 choose(e){
  let choices=[0,1,2,3].filter(d=>this.canStep(e.x+DIRS[d][0],e.y+DIRS[d][1]));if(!choices.length)return -1;
  if(e.kind===2){const safe=choices.filter(d=>!this.danger(e.x+DIRS[d][0],e.y+DIRS[d][1]));if(safe.length)choices=safe;}
  const p=this.cell(this.player);
  if(e.kind>0&&Math.abs(e.x-p.x)+Math.abs(e.y-p.y)<7&&this.rng()<.7){const dist=this.distances(p.x,p.y);choices.sort((a,b)=>(dist[key(e.x+DIRS[a][0],e.y+DIRS[a][1])]??999)-(dist[key(e.x+DIRS[b][0],e.y+DIRS[b][1])]??999));return choices[0];}
  if(choices.includes(e.dir)&&this.rng()<.72)return e.dir;
  const forward=choices.filter(d=>d!==(e.dir+2)%4);if(forward.length)choices=forward;return choices[Math.floor(this.rng()*choices.length)];
 }
 distances(x,y){const out={[key(x,y)]:0},q=[[x,y]];for(let i=0;i<q.length;i++){const [cx,cy]=q[i];for(const [dx,dy]of DIRS){const nx=cx+dx,ny=cy+dy,k=key(nx,ny);if(out[k]===undefined&&this.canStep(nx,ny)){out[k]=out[key(cx,cy)]+1;q.push([nx,ny]);}}}return out;}
 hurt(reason){if(this.mode!=='play'||this.player.inv>0)return;if(this.stats.shield&&reason!=='time'){this.stats.shield=0;this.player.inv=2.2;this.event('shield');return;}this.lives--;this.reason=reason;this.mode=this.lives>0?'dead':'gameover';this.input=-1;this.event('death',{reason});}
 retry(){if(this.mode==='dead'){this.score=this.checkpoint.score;this.stats={...this.checkpoint.stats};this.load();this.event('start');}else this.start();}
 next(){if(this.mode!=='clear')return;this.level++;this.checkpoint=null;this.load();this.event('start');}
 pause(){if(this.mode==='play'){this.mode='pause';this.input=-1;this.event('pause');}}
 resume(){if(this.mode==='pause'){this.mode='play';this.input=-1;}}
 update(dt){
  if(this.mode!=='play')return;dt=Math.min(.05,Math.max(0,dt));this.time+=dt;this.remaining-=dt;this.banner=Math.max(0,this.banner-dt);this.player.inv=Math.max(0,this.player.inv-dt);
  this.walk(this.player,dt,.19-this.stats.speed*.022);if(!this.player.moving&&this.input>=0)this.move(this.player,this.input);
  for(const b of [...this.bombs]){b.fuse-=dt;if(b.fuse<=0)this.explode(b);}
  this.flames=this.flames.filter(f=>f.end>this.time);
  for(const e of this.enemies){e.wait=Math.max(0,e.wait-dt);this.walk(e,dt,.48-e.kind*.07-Math.min(4,this.level-1)*.018);if(!e.moving&&e.wait===0)this.move(e,this.choose(e));}
  this.enemies=this.enemies.filter(e=>{const c=this.cell(e);if(this.fireAt(c.x,c.y)){this.score+=100*(e.kind+1);this.debris(c.x,c.y);this.event('enemy',{x:c.x,y:c.y,points:100*(e.kind+1)});return false;}return true;});
  const pc=this.cell(this.player),pp=this.pos(this.player);
  if(this.fireAt(pc.x,pc.y))this.hurt('blast');
  if(this.enemies.some(e=>{const ep=this.pos(e);return Math.abs(ep.x-pp.x)<.64&&Math.abs(ep.y-pp.y)<.64;}))this.hurt('enemy');
  if(this.remaining<=0){this.player.inv=0;this.hurt('time');}
  if(this.mode!=='play')return;
  const k=key(pc.x,pc.y),item=this.items[k];if(item){delete this.items[k];if(item.type==='bomb')this.stats.bombs=Math.min(5,this.stats.bombs+1);if(item.type==='range')this.stats.range=Math.min(6,this.stats.range+1);if(item.type==='speed')this.stats.speed=Math.min(3,this.stats.speed+1);if(item.type==='shield')this.stats.shield=1;this.score+=50;this.event('pickup',{item:item.type});}
  if(pc.x===this.exit.x&&pc.y===this.exit.y&&this.tile(pc.x,pc.py)===0&&this.enemies.length===0){const bonus=Math.max(0,Math.ceil(this.remaining))*5;this.score+=bonus;this.bonus=bonus;this.mode=this.level===5?'won':'clear';this.input=-1;this.event('clear');}
  for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=7*dt;p.life-=dt;}this.particles=this.particles.filter(p=>p.life>0);
 }
}
if(typeof module!=='undefined'&&module.exports)module.exports={PocketGame,COLS,ROWS,DIRS,key,random};
