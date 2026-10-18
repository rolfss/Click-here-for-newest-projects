import {steeringCurve} from './mobile-drive.js';
export function touchDevice(){return typeof matchMedia==='function'&&(matchMedia('(pointer: coarse)').matches||(navigator.maxTouchPoints>0&&matchMedia('(max-width: 1100px)').matches));}
/** Independent pointer IDs allow the two thumbs to steer, brake and shoot.
 * Pointer capture is released on interruption; a hidden button never keeps firing. */
export function mountMobileControls({settings,onSettings,onRecover,openModal}){
 const active=touchDevice(),held=new Map();let pointer=null,steer=0,currentMode='menu',autoWater=true,lastHelp;
 document.body.classList.toggle('mobile-ui',active);
 const root=document.createElement('section');root.id='mobile-controls';root.setAttribute('aria-label','Mobilstyring');
 root.innerHTML='<div id="thumb-steer" role="slider" tabindex="0" aria-label="Styr med venstre tommel. Dra til venstre eller høyre." aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><span class="steer-track"></span><span class="steer-arrow left">‹</span><span class="steer-arrow right">›</span><span id="steer-knob"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="4"/><path d="M7 18h9m8 0h9M20 24v9"/></svg></span><small>DRA FOR Å STYRE</small></div><div class="mobile-pedals"><button id="mobile-fire" data-mobile-action="fire" aria-label="Hold for å skyte vann">VANN<small id="auto-water-label">AUTOMATISK</small></button><button id="mobile-boost" data-mobile-action="boost">BOOST<small>HOLD</small></button><button id="mobile-brake" data-mobile-action="brake">BREMS<small>HOLD + SVING = SLADD</small></button><button id="mobile-gas" data-mobile-action="throttle">GASS</button></div>';
 document.body.append(root);
 const recover=document.createElement('button');recover.id='mobile-recover';recover.textContent='Til port ↶';recover.setAttribute('aria-label','Tilbake til siste arkivport, tre sekunders tillegg');recover.onclick=()=>{if(currentMode==='race'){reset();onRecover();}};document.body.append(recover);
 const status=document.createElement('button');status.id='mobile-water-toggle';status.setAttribute('aria-label','Automatisk vannkanon');status.setAttribute('aria-pressed','true');status.onclick=()=>{autoWater=!autoWater;updateStatus();};document.body.append(status);
 const guide=document.createElement('div');guide.id='mobile-guide';guide.innerHTML='<button id="mobile-help-toggle" class="secondary" aria-pressed="true">Mobilhjelp: på</button><p id="mobile-guide-text"></p>';
 document.querySelector('.menu-primary').after(guide);
 document.getElementById('mobile-help-toggle').onclick=()=>{settings.mobileHelp=!settings.mobileHelp;onSettings();updateStatus();};
 const pad=root.querySelector('#thumb-steer'),knob=root.querySelector('#steer-knob');
 function move(e){const rect=pad.getBoundingClientRect(),radius=rect.width*.36;steer=steeringCurve(e.clientX-(rect.left+rect.width/2),radius);knob.style.transform=`translateX(${Math.max(-radius,Math.min(radius,e.clientX-rect.left-rect.width/2))}px)`;pad.setAttribute('aria-valuenow',String(Math.round(steer*100)));}
 function releaseSteer(){const id=pointer;pointer=null;steer=0;knob.style.transform='';pad.setAttribute('aria-valuenow','0');pad.classList.remove('holding');if(id!==null&&pad.hasPointerCapture?.(id))pad.releasePointerCapture(id);}
 pad.addEventListener('pointerdown',e=>{if(currentMode!=='race'||pointer!==null)return;e.preventDefault();pointer=e.pointerId;pad.setPointerCapture(pointer);pad.classList.add('holding');move(e);});
 pad.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();move(e);}});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,e=>{if(e.pointerId===pointer)releaseSteer();});
 for(const button of root.querySelectorAll('[data-mobile-action]')){
  const name=button.dataset.mobileAction;
  button.addEventListener('pointerdown',e=>{if(currentMode!=='race')return;e.preventDefault();held.set(e.pointerId,{name,button});button.setPointerCapture(e.pointerId);button.classList.add('down');});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{held.delete(e.pointerId);if(![...held.values()].some(v=>v.button===button))button.classList.remove('down');});
  button.addEventListener('contextmenu',e=>e.preventDefault());
 }
 function reset(){releaseSteer();for(const [id,v] of [...held]){held.delete(id);v.button.classList.remove('down');if(v.button.hasPointerCapture?.(id))v.button.releasePointerCapture(id);}}
 function updateStatus(){const help=!!settings.mobileHelp;document.body.classList.toggle('mobile-help-on',active&&help);status.textContent=autoWater?'Vann auto: på':'Vann auto: av';status.setAttribute('aria-pressed',String(autoWater));document.getElementById('auto-water-label').textContent=help&&autoWater?'AUTOMATISK':'HOLD';document.getElementById('mobile-help-toggle').textContent='Mobilhjelp: '+(help?'på':'av');document.getElementById('mobile-help-toggle').setAttribute('aria-pressed',String(help));document.getElementById('mobile-guide-text').textContent=help?'Du styrer. Bilen gir gass og demper farten før svingene. Vannkanonen hjelper til.':'Manuell kjøring: styr med tommelen og bruk gass, brems og vann. Fire kontroller på høyre side.';lastHelp=help;}
 for(const event of ['blur','pagehide','resize'])addEventListener(event,reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 function update(mode,opts=settings){
  // Modals may open outside the animation loop (keyboard, assistive tech,
  // page lifecycle). Release held pointers before the next graphics frame.
  if(!document.getElementById('modal-backdrop').classList.contains('hidden'))mode='paused';
  else if(!document.getElementById('quiz').classList.contains('hidden'))mode='quiz';
  if(mode!==currentMode){reset();currentMode=mode;}
  document.body.dataset.gameMode=mode;
  if(lastHelp!==!!settings.mobileHelp)updateStatus();
  root.classList.toggle('hidden',!active||mode!=='race'||!!opts.sightseeing);
  recover.classList.toggle('hidden',!active||mode!=='race'||!!opts.sightseeing);
  status.classList.toggle('hidden',!active||mode!=='race'||!opts.mobileHelp||!!opts.sightseeing);
 }
 const overlays=new MutationObserver(()=>update(currentMode));
 for(const id of ['quiz','modal-backdrop'])overlays.observe(document.getElementById(id),{attributes:true,attributeFilter:['class']});
 updateStatus();update('menu');
 return {active,reset,get autoWater(){return autoWater;},get steering(){return steer;},
  update,
  sample(input){if(!active||currentMode!=='race')return input;const v={...input};if(pointer!==null)v.steer=steer;for(const {name} of held.values())v[name]=true;return v;},
  help(start){openModal('To tomler. Klar for fjellet.',`<p><strong>Venstre tommel:</strong> dra på rattet for å styre. Små bevegelser gir små svinger.</p><p><strong>Høyre tommel:</strong> brems før skarpe svinger. Hold BOOST på rette partier. VANN lar deg skyte selv.</p><p>Med <strong>mobilhjelp</strong> går gassen av seg selv, farten dempes før svinger, og kanonen skyter når et troll er i siktet. Du må fortsatt styre bilen.</p><p>Les spørsmålene i ditt eget tempo. Trykk <strong>Fortsett</strong> når du er ferdig. Mobilhjelp har en egen poengtavle med 48 timers lagring.</p><button id="mobile-help-start" class="primary">SKRIV NAVN OG KJØR →</button><p class="note">Begge skjermretninger fungerer. Liggende skjerm gir større utsikt. Mobilhjelp kan slås av i startmenyen.</p>`);document.getElementById('mobile-help-start').onclick=start;}
 };
}
