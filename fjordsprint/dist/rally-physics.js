import {initialState as originalState,recoverCar as originalRecover} from './physics.js';
import {angle} from './tracks.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function initialState(){return {...originalState(),yawRate:0,lateralVelocity:0,roll:0,pitch:0,suspension:0,grip:1};}
export function steeringLock(speed){return .48/(1+Math.max(0,speed)*.052);}
/** Road-relative bicycle model with limited grip, yaw inertia and sprung body.
 * Metres, seconds, radians. This is a forgiving racing model, not a simulator. */
export function stepCar(car,input,dt,track,settings={}){
 if(car.finished||!(dt>0)||!Number.isFinite(dt))return [];dt=Math.min(dt,.05);
 const events=[],oldS=car.s,f=track.at(car.s),grounded=car.air<.1,throttle=clamp(Number(input.throttle)||0,0,1),brake=clamp(Number(input.brake)||0,0,1);
 car.time+=dt;car.roadWidth=track.config.width;for(const key of ['turbo','stagger','padCooldown','crashCooldown'])car[key]=Math.max(0,car[key]-dt);
 car.steer+=(clamp(Number(input.steer)||0,-1,1)-car.steer)*(1-Math.exp(-dt*7));
 const drifting=!!input.drift&&car.speed>15&&Math.abs(car.steer)>.15&&grounded;
 car.drift+=(Number(drifting)-car.drift)*(1-Math.exp(-dt*5));car.braking=brake>.08;
 const manual=!!input.boost&&car.boost>0&&car.speed>4;car.boosting=(manual||car.turbo>0)&&grounded;
 if(manual&&car.turbo<=0&&grounded)car.boost=Math.max(0,car.boost-20*dt);
 const grip=(settings.assist?1.35:1.17)*9.81*(1+car.speed*car.speed*.00016)*(drifting?.7:1);
 const steerAngle=car.steer*steeringLock(car.speed),kinematic=car.speed/2.8*Math.tan(steerAngle),maxYaw=grip/Math.max(8,car.speed);
 const desiredYaw=clamp(kinematic,-maxYaw,maxYaw)*(grounded?1:.16);
 car.yawRate+=(desiredYaw-car.yawRate)*(1-Math.exp(-dt*(drifting?3:6)));
 const cornerUse=Math.min(.95,Math.abs(car.yawRate*car.speed)/grip),traction=Math.sqrt(1-cornerUse*cornerUse);
 let engine=throttle*Math.max(3.7,12-car.speed*.095),accel=(engine+(car.boosting?(car.turbo>0?15:10):0))*Math.max(.55,traction)-.45-.0016*car.speed*car.speed-brake*15*Math.max(.65,traction)-9.81*f.t.y;
 if(drifting){accel-=1.3;car.boost=Math.min(100,car.boost+dt*3);}if(!grounded)accel=-.0005*car.speed*car.speed;if(car.stagger>0)accel=Math.min(accel,2);
 car.speed=clamp(car.speed+accel*dt,0,car.turbo>0?98:92);
 const progress=Math.max(0,car.speed*Math.cos(car.heading))*dt,next=track.at(car.s+progress);
 car.heading=angle(car.heading+car.yawRate*dt-angle(next.yaw-f.yaw));
 if(settings.assist&&Math.abs(input.steer||0)<.08)car.heading*=Math.exp(-dt*.65);
 car.heading=clamp(car.heading,-1.25,1.25);
 const desiredLateral=Math.sin(car.heading)*car.speed,relax=1-Math.exp(-dt*(drifting?3.5:11));
 car.lateralVelocity+=(desiredLateral-car.lateralVelocity)*relax;
 car.x+=car.lateralVelocity*dt;car.s=Math.min(track.length,car.s+progress);
 const limit=track.config.width/2-1.55;
 if(Math.abs(car.x)>limit){const impact=Math.abs(car.lateralVelocity);car.x=clamp(car.x,-limit,limit);car.lateralVelocity=-Math.sign(car.x)*impact*.18;car.heading=-Math.sign(car.x)*.055;car.yawRate*=.4;car.speed*=Math.exp(-dt*1.8);if(car.crashCooldown===0){car.speed*=clamp(1-impact*.012,.55,.97);car.crashes++;car.crashCooldown=1.1;events.push('crash');}}
 for(const pad of track.pads)if(oldS<pad&&car.s>=pad&&Math.abs(car.x)<5&&car.padCooldown===0){car.boost=Math.min(100,car.boost+25);car.padCooldown=1;events.push('pad');}
 for(let j=car.jumpIndex;j<track.jumps.length;j++)if(oldS<track.jumps[j]&&car.s>=track.jumps[j]&&grounded){car.vy=car.speed*.115;car.air=3.2;car.jumpIndex=j+1;events.push('jump');}
 if(car.air>0){car.vy-=9.81*dt;car.air+=car.vy*dt;car.airtime+=dt;if(car.air<=0){car.suspension=Math.min(.4,Math.abs(car.vy)*.025);car.air=0;car.vy=0;events.push('land');}}
 car.suspension*=Math.exp(-dt*9);car.roll+=(-car.yawRate*car.speed*.007-car.roll)*(1-Math.exp(-dt*6));car.pitch+=(-accel*.003-car.pitch)*(1-Math.exp(-dt*6));car.grip=traction;
 while(car.checkpoint<track.checkpoints.length&&car.s>=track.checkpoints[car.checkpoint]){car.checkpointS=track.checkpoints[car.checkpoint]+3;car.checkpoint++;events.push('checkpoint');}
 car.maxSpeed=Math.max(car.maxSpeed,car.speed);if(car.s>=track.length){car.finished=true;events.push('finish');}return events;
}
export function recoverCar(car,track){originalRecover(car,track);Object.assign(car,{yawRate:0,lateralVelocity:0,roll:0,pitch:0,suspension:0});}
export function createDemoDriver(){return(car,track,assist=true)=>{
 const look=18+car.speed*.7,k=track.curvature(car.s+look),desiredYaw=k*car.speed-car.heading*2.4-car.x*.08;
 const steer=clamp(Math.atan(desiredYaw*2.8/Math.max(car.speed,5))/steeringLock(car.speed),-1,1);
 let curvature=0;for(let d=0;d<140;d+=12)curvature=Math.max(curvature,Math.abs(track.curvature(car.s+d)));
 const target=Math.min(58,Math.sqrt(10.5/Math.max(.001,curvature)));
 return {steer,throttle:car.speed<target+1,brake:car.speed>target+2,boost:Math.abs(k)<.0015&&car.speed<target-4,drift:false,fire:true};
};}
