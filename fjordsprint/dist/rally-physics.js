import {initialState as baseState,recoverCar as baseRecover} from './physics.js';
import {angle} from './tracks.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const follow=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
export const PHYSICS_VERSION='grip-3.1';
export function initialState(){return {...baseState(),yawRate:0,travelHeading:0,lateralVelocity:0,roll:0,pitch:0,suspension:0,suspensionVelocity:0,grip:1,slip:0,driftHold:0,flightPitch:undefined,flightSpin:0,wasBrake:false};}
/** Original arcade handling, inspired by precision time-trial racers. Not
 * Trackmania physics. Body orientation and velocity direction are independent.
 * All integration uses metres, seconds and radians at a fixed 120 Hz. */
export function gripLimit(speed){return 32+.006*Math.max(0,speed)**2;}
export function turnLimit(speed){return Math.min(Math.max(0,speed)*.135,gripLimit(speed)*.82/Math.max(12,speed));}
export function steeringLock(speed){return Math.atan(turnLimit(speed)*2.8/Math.max(1,speed));}
export function stepCar(car,input,dt,track,settings={}){
 if(car.finished||!Number.isFinite(dt)||dt<=0)return [];
 // Fixed substeps keep this public API stable even in a coarse caller.
 if(dt>1/120+.000001){const events=[];let remaining=Math.min(dt,.25);while(remaining>1e-9){const h=Math.min(1/120,remaining);events.push(...stepCar(car,input,h,track,settings));remaining-=h;}return events;}
 const events=[],oldS=car.s,frame=track.at(oldS),grounded=car.air<=0;
 const throttle=clamp(Number(input.throttle)||0,0,1),brake=clamp(Number(input.brake)||0,0,1),rawSteer=clamp(Number(input.steer)||0,-1,1);
 const travel=Number.isFinite(car.travelHeading)?car.travelHeading:car.heading;
 car.time+=dt;car.roadWidth=track.config.width;
 for(const k of ['turbo','stagger','padCooldown','crashCooldown','driftHold'])car[k]=Math.max(0,(car[k]||0)-dt);
 car.steer=follow(car.steer,rawSteer,Math.sign(rawSteer)!==Math.sign(car.steer)?30:23,dt);
 // Tap the normal brake while steering to initiate a drift. SPACE is a
 // convenient dedicated drift input; neither gives free boost by itself.
 const brakeTap=brake>.22&&!car.wasBrake&&!input.autoBrake;car.wasBrake=brake>.22;car.braking=brake>.08||!!input.drift;
 if(grounded&&car.speed>23&&Math.abs(car.steer)>.18&&(brakeTap||input.drift))car.driftHold=.32;
 const driftRequested=!!(grounded&&car.speed>19&&Math.abs(car.steer)>.12&&(car.driftHold>0||(((brake>.12&&!input.autoBrake)||input.drift)&&car.drift>.12)));
 car.drift=follow(car.drift,Number(driftRequested),driftRequested?11:settings.assist?10:7,dt);
 const manual=!!input.boost&&car.boost>0&&car.speed>4;car.boosting=grounded&&(manual||car.turbo>0);
 if(manual&&car.turbo===0&&grounded)car.boost=Math.max(0,car.boost-20*dt);
 const limit=turnLimit(car.speed),targetYaw=car.steer*limit*(1+car.drift*.32);
 car.yawRate=follow(car.yawRate,grounded?targetYaw:rawSteer*.34,grounded?(car.drift>.2?13:22):4,dt);
 let heading=angle(car.heading+car.yawRate*dt),velocityHeading=travel;
 if(grounded){
  const slipTarget=car.steer*car.drift*.30,desired=angle(heading-slipTarget),error=angle(desired-travel);
  const grip=gripLimit(car.speed)*(1-car.drift*.24)*(settings.assist===false?.95:1);
  const gripTurn=grip/Math.max(8,car.speed);
  velocityHeading=angle(travel+clamp(error*(1-Math.exp(-(car.drift>.2?8:26)*dt)),-gripTurn*dt,gripTurn*dt));
  car.grip=clamp(1-Math.abs(error)*1.2,.15,1);
 }
 car.slip=angle(heading-velocityHeading);
 let accel=throttle*Math.max(5,24-car.speed*.17)-.9-.0012*car.speed**2-13*frame.t.y;
 accel-=brake*(car.drift>.2&&throttle>.2?12:32)+car.drift*3.8+Math.abs(car.slip)*1.8;
 if(input.drift&&brake<.1)accel-=2.2;
 if(car.boosting)accel+=car.turbo>0?25:18;
 if(car.stagger>0)accel=Math.min(accel,3);
 if(!grounded)accel=-.0002*car.speed**2;
 car.speed=clamp(car.speed+accel*dt,0,112); // one safety ceiling, no turbo-expiry snap
 // Offset curves have a different arc length. Correcting that metric avoids
 // gaining distance by simply taking the outer lane through a bend.
 const metric=clamp(1-track.curvature(oldS)*car.x,.6,1.4);
 const ds=car.speed*Math.cos(velocityHeading)*dt/metric;
 car.s=clamp(oldS+ds,0,track.length);
 car.x+=car.speed*Math.sin(velocityHeading)*dt;
 const next=track.at(car.s),roadTurn=angle(next.yaw-frame.yaw);
 car.heading=angle(heading-roadTurn);car.travelHeading=angle(velocityHeading-roadTurn);
 car.lateralVelocity=car.speed*Math.sin(car.travelHeading);
 // Only the impact normal is reflected; a glancing touch is not a full stop.
 const edge=track.config.width/2-1.55;
 if(Math.abs(car.x)>edge){const side=Math.sign(car.x),normal=Math.max(0,side*car.lateralVelocity),forward=car.speed*Math.cos(car.travelHeading);car.x=side*edge;
  if(normal>0){const tangent=forward*Math.max(.56,1-normal*.008),bounce=-side*normal*.10;car.speed=Math.hypot(tangent,bounce);car.travelHeading=Math.atan2(bounce,tangent);car.lateralVelocity=bounce;car.heading=angle(car.travelHeading+clamp(car.slip,-.15,.15));car.yawRate*=.25;car.driftHold=0;
   if(car.crashCooldown===0){car.crashes++;car.crashCooldown=.7;events.push('crash');}}
 }
 for(const pad of track.pads)if(oldS<pad&&car.s>=pad&&Math.abs(car.x)<5&&car.padCooldown===0){car.boost=Math.min(100,car.boost+25);car.padCooldown=1;events.push('pad');}
 let tookOff=false;
 for(let j=car.jumpIndex;j<track.jumps.length;j++)if(oldS<track.jumps[j]&&car.s>=track.jumps[j]&&grounded){car.vy=car.speed*(.114+frame.t.y);car.air=3.2;car.jumpIndex=j+1;car.flightPitch=Math.asin(frame.t.y)+.114;car.flightSpin=0;tookOff=true;events.push('jump');break;}
 if(car.air>0){
  // Vertical world momentum minus changing road elevation, not a hover above
  // an imaginary moving road. Airbrake stops rotation, not forward speed.
  if(!tookOff){car.air-=next.p.y-frame.p.y;car.vy-=15*dt;car.air+=car.vy*dt;}
  car.airtime+=dt;car.flightSpin=follow(car.flightSpin,brake>.1?0:-.16,brake>.1?45:2,dt);
  car.flightPitch=clamp((car.flightPitch||0)+car.flightSpin*dt,-.7,.7);
  if(car.air<=0){const impact=Math.abs(car.vy-car.speed*next.t.y);car.air=0;car.vy=0;car.flightPitch=undefined;car.suspensionVelocity=Math.min(4,impact*.12);car.yawRate*=.65;events.push('land');}
 }
 car.suspensionVelocity=(car.suspensionVelocity||0)+(-90*(car.suspension||0)-15*(car.suspensionVelocity||0))*dt;
 car.suspension=clamp((car.suspension||0)+car.suspensionVelocity*dt,-.10,.24);
 car.roll=follow(car.roll||0,-car.yawRate*car.speed*.0018,13,dt);car.pitch=follow(car.pitch||0,-accel*.002,11,dt);
 while(car.checkpoint<track.checkpoints.length&&car.s>=track.checkpoints[car.checkpoint]){car.checkpointS=track.checkpoints[car.checkpoint]+3;car.checkpoint++;events.push('checkpoint');}
 car.maxSpeed=Math.max(car.maxSpeed,car.speed);
 if(car.s>=track.length){car.finished=true;events.push('finish');}return events;
}
export function recoverCar(car,track){baseRecover(car,track);Object.assign(car,{yawRate:0,travelHeading:0,lateralVelocity:0,roll:0,pitch:0,suspension:0,suspensionVelocity:0,slip:0,driftHold:0,drift:0,flightPitch:undefined,flightSpin:0,wasBrake:false});}
export function createDemoDriver(){return (car,track,assist=true)=>{
 const look=12+car.speed*.34,k=track.curvature(car.s+look);
 const targetYaw=k*car.speed-car.heading*3.6-car.x*.14-(car.travelHeading-car.heading)*.8;
 const steer=clamp(targetYaw/Math.max(.1,turnLimit(car.speed)),-1,1);
 let curvature=0;for(let d=0;d<170;d+=12)curvature=Math.max(curvature,Math.abs(track.curvature(car.s+d)));
 const target=Math.min(70,Math.sqrt(18/Math.max(.001,curvature)));
 return {steer,throttle:car.speed<target+1,brake:car.speed>target+3?.75:0,boost:Math.abs(k)<.001&&car.speed<target-8,drift:false,fire:true};
};}
