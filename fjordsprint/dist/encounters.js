export const mascotNames={riks:'Riksrevisjonen',arkiv:'Arkivverket'};
export function createEncounters(track){
 return (track.config.birds??[]).map((fraction,i)=>({id:i,kind:i%2?'arkiv':'riks',s:fraction*track.length,x:0,phase:'waiting',age:0}));
}
export function stepEncounters(encounters,car,previous,dt,track){
 const events=[];
 for(const e of encounters){
  if(e.phase==='resolved')continue;
  // Recovery is a teleport, never a sweep through an entire stretch of road.
  if(car.s<previous.s||car.s-previous.s>25)continue;
  if(e.phase==='waiting'&&car.s>=e.s-Math.max(190,car.speed*3.4)){
   e.phase='warning';e.x=Math.max(-track.config.width/2+5,Math.min(track.config.width/2-5,car.x));e.age=0;
   events.push({type:'warning',encounter:e});
  }
  if(e.phase==='warning'){
   e.age+=dt;
   if(previous.s<=e.s&&car.s>=e.s){
    const t=(e.s-previous.s)/(car.s-previous.s||1),x=previous.x+(car.x-previous.x)*t,air=previous.air+(car.air-previous.air)*t;
    e.phase='resolved';e.outcome=Math.abs(x-e.x)<3.5&&air<3?'hit':'dodge';
    events.push({type:e.outcome,encounter:e});
   }
  }
 }
 return events;
}
