import * as T from './vendor/three.module.js';
import {World as RallyWorld} from './rally-world.js?v=3.1.0';
export const PALETTE=Object.freeze({asphalt:0x354951,edge:0xe8ebe1,steel:0x667f86,mint:0x79cdbb,cream:0xf1e7c9,grass:0x7a987f,rock:0x819496,snow:0xe3ece8});
/** Samples a surface decal along the road, not a flat box on its tangent.
 * Longitudinal seams coincide with the road mesh's seams, including curves. */
export function padGeometry(track,s,width=10,length=18){
 const begin=s-length/2,end=s+length/2,steps=new Set([begin,end]);
 for(const f of track.roadSamples)if(f.s>begin&&f.s<end)steps.add(f.s);
 // Existing track samples do not necessarily carry s, so also include their
 // known evenly spaced centreline distances and a fine interior subdivision.
 for(let i=0;i<track.roadSamples.length;i++){const at=i*track.length/track.count;if(at>begin&&at<end)steps.add(at);}
 for(let at=begin+.6;at<end;at+=.6)steps.add(at);
 const positions=[],uv=[],indices=[],distances=[...steps].sort((a,b)=>a-b);
 distances.forEach((at,i)=>{for(const x of [-width/2,width/2]){const p=track.position(at,x,.055);positions.push(p.x,p.y,p.z);uv.push(x<0?0:1,(at-begin)/length);}if(i){const a=(i-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}});
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.userData={s,width,length,distances};return g;
}
function padTexture(renderer){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,512,1024);ctx.fillStyle='#173f46';ctx.beginPath();ctx.roundRect(12,12,488,1000,60);ctx.fill();
 ctx.strokeStyle='#96d4c3';ctx.lineWidth=7;ctx.stroke();
 const gradient=ctx.createLinearGradient(0,0,0,1024);gradient.addColorStop(0,'#86cdbb');gradient.addColorStop(1,'#518e84');ctx.fillStyle=gradient;ctx.beginPath();ctx.roundRect(32,32,448,960,46);ctx.fill();
 ctx.strokeStyle='#edf3da';ctx.lineWidth=22;ctx.lineCap='round';ctx.lineJoin='round';
 for(const y of [235,470,705]){ctx.beginPath();ctx.moveTo(137,y+69);ctx.lineTo(256,y-35);ctx.lineTo(375,y+69);ctx.stroke();}
 ctx.font='700 32px Arial,sans-serif';ctx.textAlign='center';ctx.fillStyle='#eaf3df';ctx.fillText('BOOST',256,909);
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tex;
}
function softShadow(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,10,64,64,64);g.addColorStop(0,'rgba(14,30,35,.8)');g.addColorStop(.45,'rgba(14,30,35,.44)');g.addColorStop(1,'rgba(14,30,35,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);}
function bevelBox(w,h,d){const r=Math.min(.12,w*.13,h*.22,d*.13),shape=new T.Shape(),x=w/2-r,y=h/2-r;shape.moveTo(-x,-y);shape.lineTo(x,-y);shape.lineTo(x,y);shape.lineTo(-x,y);shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:d-2*r,steps:1,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:3,curveSegments:3});g.translate(0,0,-d/2+r);return g;}
export class World extends RallyWorld{
 addRoad(){
  const before=new Set(this.scene.children);super.addRoad();const added=this.scene.children.filter(o=>!before.has(o));
  for(const obj of added){
   // Replace only the legacy boost groups, identified by their exact base slab.
   if(obj.isGroup&&obj.children.some(c=>c.geometry?.parameters?.width===9&&c.geometry?.parameters?.depth===16&&c.geometry?.parameters?.height===.035)){
    this.scene.remove(obj);obj.traverse(c=>{c.geometry?.dispose();c.material?.dispose();});continue;
   }
   if(obj.material?.color){const color=obj.material.color.getHex();const mapped=new Map([[0x273943,PALETTE.asphalt],[0xea7258,0xb99480],[0xe7e9dc,PALETTE.edge],[0x769298,PALETTE.steel],[0xebf2e9,PALETTE.edge]]).get(color);if(mapped!==undefined){obj.material.color.set(mapped);obj.material.roughness=.85;obj.material.metalness=.08;}}
   if(obj.geometry?.getAttribute('color')){const colors=obj.geometry.getAttribute('color'),dark=new T.Color(0x475d65),warm=new T.Color(0xd7bc8c);for(let i=0;i<colors.count;i++){const col=colors.getX(i)>.3?warm:dark;colors.setXYZ(i,col.r,col.g,col.b);}colors.needsUpdate=true;}
  }
  const texture=padTexture(this.renderer);this.boostPads=this.track.pads.map(s=>{const m=new T.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.06,roughness:.88,metalness:0,emissive:PALETTE.mint,emissiveIntensity:.05,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:T.DoubleSide});const mesh=new T.Mesh(padGeometry(this.track,s),m);mesh.name='road-conforming-boost';mesh.receiveShadow=true;mesh.userData={s,pulse:0};this.scene.add(mesh);return mesh;});
 }
 makeCar(ghost){const car=super.makeCar(ghost);car.traverse(obj=>{const p=obj.geometry?.parameters;if(obj.geometry?.type==='BoxGeometry'&&p.width>=.5&&p.height>=.12){const old=obj.geometry;obj.geometry=bevelBox(p.width,p.height,p.depth);old.dispose();}});return car;}
 build(track){
  super.build(track);this.renderer.toneMappingExposure=1.06;this.sun.intensity=2.5;this.sun.shadow.normalBias=.035;
  for(const light of this.scene.children)if(light.isHemisphereLight){light.intensity=2.25;light.color.set(0xd9e9ed);light.groundColor.set(0x667761);}
  const terrain=this.scene.children.find(o=>o.geometry===this.terrainGeometry);if(terrain){terrain.material.flatShading=false;terrain.material.needsUpdate=true;const p=terrain.geometry.attributes.position,colors=terrain.geometry.attributes.color,base=new T.Color(track.config.id==='aurora'?0x72858a:PALETTE.grass),rock=new T.Color(PALETTE.rock),snow=new T.Color(PALETTE.snow);for(let i=0;i<p.count;i++){const y=p.getY(i),col=base.clone().lerp(rock,T.MathUtils.smoothstep(y,230,450)).lerp(snow,T.MathUtils.smoothstep(y,400,560));col.multiplyScalar(.97+Math.sin(p.getX(i)*.003+p.getZ(i)*.002)*.025);colors.setXYZ(i,col.r,col.g,col.b);}colors.needsUpdate=true;}
  this.water.material.roughness=.55;this.water.material.metalness=.12;
  this.carShadow.geometry.dispose();this.carShadow.geometry=new T.PlaneGeometry(6.7,9);this.carShadow.material.map=softShadow();this.carShadow.material.color.set(0xffffff);this.carShadow.material.needsUpdate=true;
  for(const obj of [this.car,this.ghost])if(obj.userData.paint){obj.userData.paint.roughness=.46;obj.userData.paint.metalness=.2;}
  this._padLastS=null;
 }
 render(state,dt,mode,options={}){
  const running=mode==='race';
  for(const pad of this.boostPads){const hit=running&&this._padLastS!==null&&this._padLastS<pad.userData.s&&state.s>=pad.userData.s&&state.s-this._padLastS<20&&Math.abs(state.x)<5;if(hit)pad.userData.pulse=.6;pad.userData.pulse=Math.max(0,pad.userData.pulse-dt);pad.material.emissiveIntensity=.05+(options.motion===false?0:pad.userData.pulse*.32);}
  this._padLastS=running?state.s:null;
  super.render(state,dt,mode,options);
 }
}
