import {angle} from './tracks.js';
// Render between completed physics ticks. Lift includes the ramp, whose end
// transfers height to the airborne state in a single simulation tick.
export function interpolateState(previous,current,alpha,track){
 const t=Math.max(0,Math.min(1,alpha)),out={...current};
 for(const key of ['s','x','speed','steer','air','drift','time','turbo','stagger'])out[key]=(previous[key]||0)+((current[key]||0)-(previous[key]||0))*t;
 out.heading=previous.heading+angle(current.heading-previous.heading)*t;
 for(const key of ['roll','pitch','suspension','slip','yawRate'])if(Number.isFinite(previous[key])&&Number.isFinite(current[key]))out[key]=previous[key]+(current[key]-previous[key])*t;
 if(Number.isFinite(previous.travelHeading)&&Number.isFinite(current.travelHeading))out.travelHeading=previous.travelHeading+angle(current.travelHeading-previous.travelHeading)*t;
 if(Number.isFinite(previous.flightPitch)&&Number.isFinite(current.flightPitch))out.flightPitch=previous.flightPitch+(current.flightPitch-previous.flightPitch)*t;
 out.rideHeight=previous.air+track.rampHeight(previous.s)+(current.air+track.rampHeight(current.s)-previous.air-track.rampHeight(previous.s))*t;
 out.rampPitch=(track.rampHeight(previous.s)>0?.114:0)*(1-t)+(track.rampHeight(current.s)>0?.114:0)*t;
 return out;
}
