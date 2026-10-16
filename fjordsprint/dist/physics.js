import {angle} from './tracks.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function initialState(){return {s:0,x:0,speed:0,braking:false,heading:0,steer:0,time:0,boost:40,boosting:false,turbo:0,stagger:0,air:0,vy:0,checkpoint:0,checkpointS:0,crashes:0,drift:0,airtime:0,maxSpeed:0,padCooldown:0,crashCooldown:0,jumpIndex:0,finished:false};}
export function stepCar(car,input,dt,track,settings={}){
 if(car.finished)return [];
 const events=[],f=track.at(car.s),oldS=car.s;
 car.time+=dt;car.turbo=Math.max(0,car.turbo-dt);car.stagger=Math.max(0,car.stagger-dt);car.padCooldown=Math.max(0,car.padCooldown-dt);car.crashCooldown=Math.max(0,car.crashCooldown-dt);
 car.steer+=(clamp(input.steer||0,-1,1)-car.steer)*Math.min(1,dt*8);
 const drifting=!!input.drift&&car.speed>20&&Math.abs(car.steer)>.15&&car.air<.1;
 car.drift=drifting?Math.min(1,car.drift+dt*3):Math.max(0,car.drift-dt*4);
 const manual=!!input.boost&&car.boost>0&&car.speed>4;car.boosting=manual||car.turbo>0;
 if(manual&&car.turbo<=0)car.boost=Math.max(0,car.boost-dt*20);
 const throttle=input.throttle?1:0,brake=input.brake?1:0;car.braking=!!brake;
 let acceleration=throttle*(21-Math.min(car.speed,85)*.12)-2.4-car.speed*car.speed*.0016-brake*32-f.t.y*22;
 if(car.boosting)acceleration+=car.turbo>0?34:25;
 if(car.stagger>0)acceleration=Math.min(acceleration,4);
 if(drifting){acceleration-=3.0;car.boost=Math.min(100,car.boost+dt*4);}
 if(car.air>.1)acceleration=throttle*2-1+(car.boosting?9:0);
 car.speed=clamp(car.speed+acceleration*dt,0,car.turbo>0||car.speed>100?112:100);
 let turnRate=car.steer*(.72+Math.min(car.speed,60)*.006)*(drifting?1.5:1)*(car.air>.1?.35:1);
 const progress=car.speed*Math.max(.25,Math.cos(car.heading))*dt;
 const nextFrame=track.at(car.s+progress);
 car.heading=angle(car.heading+turnRate*dt-angle(nextFrame.yaw-f.yaw));
 // Gentle self-centering makes arcade steering readable without steering through corners for the player.
 car.heading*=Math.exp(-dt*(settings.assist?2.1:.55));
 car.heading=clamp(car.heading,-1.15,1.15);
 car.x+=Math.sin(car.heading)*car.speed*dt;
 car.s=Math.min(track.length,car.s+progress);
 const limit=track.config.width/2-1.3;
 if(Math.abs(car.x)>limit){car.x=clamp(car.x,-limit,limit);car.heading=-Math.sign(car.x)*Math.min(.24,Math.abs(car.heading)*.5);car.speed*=Math.exp(-dt*7);if(car.crashCooldown===0){car.crashes++;car.crashCooldown=1.2;events.push('crash');}}
 for(const pad of track.pads){if(oldS<pad&&car.s>=pad&&Math.abs(car.x)<5&&car.padCooldown===0){car.boost=Math.min(100,car.boost+25);car.speed=Math.min(car.speed>100?112:100,car.speed+9);car.padCooldown=1;events.push('pad');}}
 for(let j=car.jumpIndex;j<track.jumps.length;j++){if(oldS<track.jumps[j]&&car.s>=track.jumps[j]&&car.air<.1){car.vy=5+car.speed*.1;car.air=3.2;car.jumpIndex=j+1;events.push('jump');}}
 if(car.air>0){car.vy-=22*dt;car.air+=car.vy*dt;car.airtime+=dt;if(car.air<=0){car.air=0;car.vy=0;events.push('land');}}
 while(car.checkpoint<track.checkpoints.length&&car.s>=track.checkpoints[car.checkpoint]){car.checkpointS=track.checkpoints[car.checkpoint]+3;car.checkpoint++;events.push('checkpoint');}
 car.maxSpeed=Math.max(car.maxSpeed,car.speed);
 if(car.s>=track.length){car.finished=true;events.push('finish');}
 return events;
}
export function recoverCar(car,track){car.s=car.checkpointS;car.x=0;car.speed=12;car.heading=0;car.steer=0;car.air=0;car.vy=0;car.boosting=false;car.turbo=0;car.stagger=0;car.jumpIndex=track.jumps.filter(s=>s<=car.s).length;car.time+=3;car.crashes++;}
