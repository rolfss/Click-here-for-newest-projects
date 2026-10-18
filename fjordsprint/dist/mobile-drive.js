/** Input assistance only. Manual/desktop racing retains the 3.1 handling.
 * Assisted races have their own score class; neither reading nor aiming
 * changes the archive rules or the score's 48-hour expiry. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function steeringCurve(distance,radius=58){
 const v=clamp(Number(distance)/(Number(radius)||58),-1,1),a=Math.abs(v);
 return a<.04?0:Math.sign(v)*Math.pow((a-.04)/.96,1.35);
}
export function comfortSpeed(car,track){
 let target=50; // 180 km/h on a straight. Brake early rather than steer for the player.
 for(let d=0;d<=150;d+=10){
  const corner=Math.min(50,Math.sqrt(17/Math.max(.001,Math.abs(track.curvature(car.s+d)))));
  target=Math.min(target,Math.sqrt(corner*corner+2*12*Math.max(0,d-24)));
 }
 return target;
}
export function mobileAssist(input,car,track,challenge,{enabled=false,autoWater=true}={}){
 if(!enabled)return {...input};
 const result={...input},manualBrake=Number(input.brake)||0;
 const target=comfortSpeed(car,track);
 result.throttle=manualBrake>.05?0:clamp((target-car.speed)*.5,0,1);
 if(car.air<=0&&car.speed>target+1.5&&manualBrake<.05&&!input.drift){
  result.brake=clamp((car.speed-target-1.5)/10,0,.75);result.autoBrake=true;
 }
 if(autoWater&&!input.fire&&challenge?.pressure>=18&&car.air<2){
  result.fire=challenge.trolls.some(t=>['active','entering'].includes(t.phase)&&t.s-car.s>5&&t.s-car.s<90&&Math.abs(Math.atan2(t.x-car.x,t.s-car.s)-car.heading)<.14);
 }
 return result;
}
export function scoreClass(quiz,help){return (quiz?'archive':'time')+(help?'32touch':'31');}
