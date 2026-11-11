import * as T from './vendor/three.module.js';
import {World as RallyWorld} from './rally-world.js?v=3.3.0';
export const PALETTE=Object.freeze({asphalt:0x354951,edge:0xe8ebe1,steel:0x667f86,mint:0x79cdbb,cream:0xf1e7c9,grass:0x7a987f,rock:0x819496,snow:0xe3ece8});
const terrainPalette={
 fjord:{low:0x748e74,high:0x91a388,rock:0x778987,snow:0xe4ebe5},
 pass:{low:0x85917e,high:0x9fa58d,rock:0x819296,snow:0xe5ebe6},
 aurora:{low:0x647d80,high:0x8b9d9f,rock:0x6a7c89,snow:0xcadbe0},
};
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

function asphaltTexture(renderer, width) {
 const size=128,canvas=document.createElement('canvas');
 canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);
 let seed=8247;
 for(let i=0;i<pixels.data.length;i+=4){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const tone=239+(seed>>>28);
  pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=tone;
  pixels.data[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);
 const texture=new T.CanvasTexture(canvas);
 texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;
 texture.repeat.set(width/9,1);
 texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 return texture;
}

function addGuardrailReflectors(scene,track){
 const spacing=21,count=Math.floor((track.length-63)/spacing)*2;
 if(count<=0)return;
 const mounts=new T.InstancedMesh(new T.BoxGeometry(.21,.59,.28),new T.MeshStandardMaterial({color:0x435559,roughness:.74}),count);
 const reflectors=new T.InstancedMesh(new T.BoxGeometry(.24,.23,.31),new T.MeshBasicMaterial({color:0xffefd0}),count);
 const dummy=new T.Object3D();
 let index=0;
 for(let s=42;index<count;s+=spacing){
  const frame=track.at(s);
  for(const side of [-1,1]){
   dummy.position.copy(frame.p).addScaledVector(frame.r,side*(track.config.width/2+.21));
   dummy.rotation.y=-frame.yaw;
   dummy.position.y+=1.48;
   dummy.updateMatrix();mounts.setMatrixAt(index,dummy.matrix);
   dummy.position.y+=.22;
   dummy.updateMatrix();reflectors.setMatrixAt(index++,dummy.matrix);
  }
 }
 mounts.name='Guardrail reflector mounts';reflectors.name='Guardrail reflectors';
 scene.add(mounts,reflectors);
}

function colorTerrain(terrain,course){
 const colors=terrain.geometry.attributes.color;
 const {position,normal}=terrain.geometry.attributes;
 const palette=terrainPalette[course]??terrainPalette.fjord;
 const low=new T.Color(palette.low),high=new T.Color(palette.high),rock=new T.Color(palette.rock),snow=new T.Color(palette.snow),color=new T.Color();
 for(let i=0;i<position.count;i++){
  const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
  const grain=Math.sin(x*.004+z*.003)*.3+Math.sin(x*.011-z*.008)*.15;
  const exposed=T.MathUtils.smoothstep(1-normal.getY(i),.05,.46);
  color.copy(low).lerp(high,.5+grain);
  color.lerp(rock,Math.max(exposed*.72,T.MathUtils.smoothstep(y,215,445)));
  color.lerp(snow,T.MathUtils.smoothstep(y+grain*32,397,545)*(1-exposed*.34));
  colors.setXYZ(i,color.r,color.g,color.b);
 }
 colors.needsUpdate=true;
 terrain.material.flatShading=false;
 terrain.material.needsUpdate=true;
}

export class World extends RallyWorld{
 addRoad(){
  const before=new Set(this.scene.children);super.addRoad();const added=this.scene.children.filter(o=>!before.has(o));
  for(const obj of added){
   // Replace only the legacy boost groups, identified by their exact base slab.
   if(obj.isGroup&&obj.children.some(c=>c.geometry?.parameters?.width===9&&c.geometry?.parameters?.depth===16&&c.geometry?.parameters?.height===.035)){
    this.scene.remove(obj);obj.traverse(c=>{c.geometry?.dispose();c.material?.dispose();});continue;
   }
   if(obj.material?.color){const color=obj.material.color.getHex();const mapped=new Map([[0x273943,PALETTE.asphalt],[0xea7258,0xb99480],[0xe7e9dc,PALETTE.edge],[0x769298,PALETTE.steel],[0xebf2e9,PALETTE.edge]]).get(color);if(mapped!==undefined){obj.material.color.set(mapped);obj.material.roughness=.85;obj.material.metalness=.08;if(color===0x273943)obj.material.map=asphaltTexture(this.renderer,this.track.config.width);}}
   if(obj.geometry?.getAttribute('color')){const colors=obj.geometry.getAttribute('color'),dark=new T.Color(0x475d65),warm=new T.Color(0xd7bc8c);for(let i=0;i<colors.count;i++){const col=colors.getX(i)>.3?warm:dark;colors.setXYZ(i,col.r,col.g,col.b);}colors.needsUpdate=true;}
  }
  const texture=padTexture(this.renderer);this.boostPads=this.track.pads.map(s=>{const m=new T.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.06,roughness:.88,metalness:0,emissive:PALETTE.mint,emissiveIntensity:.05,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:T.DoubleSide});const mesh=new T.Mesh(padGeometry(this.track,s),m);mesh.name='road-conforming-boost';mesh.receiveShadow=true;mesh.userData={s,pulse:0};this.scene.add(mesh);return mesh;});
  addGuardrailReflectors(this.scene,this.track);
 }
 makeCar(ghost){const car=super.makeCar(ghost);car.traverse(obj=>{const p=obj.geometry?.parameters;if(obj.geometry?.type==='BoxGeometry'&&p.width>=.5&&p.height>=.12){const old=obj.geometry;obj.geometry=bevelBox(p.width,p.height,p.depth);old.dispose();}});return car;}
 build(track){
  super.build(track);this.renderer.toneMappingExposure=1.06;this.sun.intensity=2.5;this.sun.shadow.normalBias=.035;
  for(const light of this.scene.children)if(light.isHemisphereLight){light.intensity=2.25;light.color.set(0xd9e9ed);light.groundColor.set(0x667761);}
  const terrain=this.scene.children.find(o=>o.geometry===this.terrainGeometry);if(terrain)colorTerrain(terrain,track.config.id);
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
