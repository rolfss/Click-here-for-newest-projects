import * as T from './vendor/three.module.js';
import {groundHeight,carveRoadClearance} from './terrain.js?v=3.3.0';
import {hospitalsForCourse,PROVIDERS} from './hso-data.js?v=3.1.0';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function tex(canvas){const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t;}
export async function loadBrandImage(){const image=new Image();image.src=new URL('./assets/sykehuspartner.png',import.meta.url).href;await image.decode();return image;}
// One source image; aspect ratio and the official five-dot mark are untouched.
function brandTexture(image){const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,1024,256);const w=900,h=w*image.height/image.width;x.drawImage(image,(1024-w)/2,(256-h)/2,w,h);return tex(c);}
function signTexture(name,sub){const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d');x.fillStyle='#102d4e';x.fillRect(0,0,1024,256);x.fillStyle='#70c4ec';x.fillRect(0,0,13,256);x.textAlign='center';x.fillStyle='#ffffff';x.font='bold 52px Arial';const lines=[''];for(const word of name.split(' ')){const n=lines.length-1,line=(lines[n]+' '+word).trim();if(x.measureText(line).width>954)lines.push(word);else lines[n]=line;}lines.forEach((s,i)=>x.fillText(s,512,80+i*58));x.fillStyle='#a5d4e6';x.font='26px Arial';x.fillText(sub,512,230,954);return tex(c);}
const facadeProfiles={
 stone:{wall:'#c7d1cf',seam:'#a0afae',frame:'#69868d',lintel:'#f0e7d7',columns:4,rows:4},
 brick:{wall:'#ae7766',seam:'#805a51',frame:'#613f38',lintel:'#dcc3a6',columns:5,rows:4},
 glass:{wall:'#6c8795',seam:'#385d73',frame:'#344d64',lintel:'#a9bec5',columns:6,rows:4},
};

function facadeTexture(profile,night){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;
 const ctx=canvas.getContext('2d');
 const {wall,seam,frame,lintel,columns,rows}=facadeProfiles[profile];
 const facade=ctx.createLinearGradient(0,0,0,384);
 facade.addColorStop(0,wall);facade.addColorStop(1,seam);
 ctx.fillStyle=facade;ctx.fillRect(0,0,512,384);
 if(profile==='brick'){
  ctx.fillStyle='#e6bb961f';
  for(let y=8;y<384;y+=12){
   ctx.fillRect(0,y,512,1);
   for(let x=y%24;x<512;x+=28)ctx.fillRect(x,y-11,1,11);
  }
 }
 const bay=512/columns,floor=384/rows;
 for(let row=0;row<rows;row++){
  const y=row*floor;
  ctx.fillStyle=seam;ctx.fillRect(0,y,512,3);
  ctx.fillStyle=lintel;ctx.fillRect(0,y+floor-9,512,4);
  for(let col=0;col<columns;col++){
   const inset=profile==='glass'?5:10;
   const x=col*bay+inset,w=bay-inset*2,h=floor-34,top=y+16;
   ctx.fillStyle=frame;ctx.fillRect(x-2,top-3,w+4,h+7);
   const lit=(row*5+col*7)%(night?5:9)<2;
   const reflection=ctx.createLinearGradient(x,top,x+w,top+h);
   reflection.addColorStop(0,lit?'#fff0c3':night?'#6085a4':'#97b9c2');
   reflection.addColorStop(.47,lit?'#d4ab77':night?'#30475f':'#536f84');
   reflection.addColorStop(1,lit?'#a87959':'#203f54');
   ctx.fillStyle=reflection;ctx.fillRect(x,top,w,h);
   if(lit){ctx.fillStyle='#f7ddaa55';ctx.fillRect(x+w*.14,top+2,w*.16,h-4);}
   ctx.fillStyle=frame;ctx.fillRect(x+w*.55,top,2,h);
   ctx.fillStyle=lintel;ctx.fillRect(x-2,top+h+2,w+4,3);
  }
 }
 return tex(canvas);
}
let preparedLogo;
export async function prepareHospitalWorld(){preparedLogo=await loadBrandImage();}
export class HospitalWorld{
 constructor(world,image=preparedLogo){this.world=world;this.items=[];this.ticks=0;this.visited=new Set();this.lastS=Infinity;this.uiLast='';this.disposed=false;
  this.root=new T.Group();this.root.name='Helse Sør-Øst – sykehusløypa';world.scene.add(this.root);
  const material=(c,extra={})=>new T.MeshStandardMaterial({color:c,roughness:.73,...extra});
  this.m={white:material(0xe9ece5),navy:material(0x17436a),glass:material(0x527f92,{metalness:.45,roughness:.25}),stone:material(0x778887),road:material(0x455868),roof:material(0x556971),brick:material(0xa9715b),warm:material(0xd3c09c),steel:material(0xbacdd0),pine:material(0x527369),light:material(0xffd69a,{emissive:0xffb35d,emissiveIntensity:.42})};
  this.cube=new T.BoxGeometry(1,1,1);this.planeGeometry=new T.PlaneGeometry(1,1);this.pineGeometry=new T.ConeGeometry(1,1,7);this.brand=brandTexture(image);this.brandMat=new T.MeshBasicMaterial({map:this.brand,toneMapped:false});
  this.facades=Object.fromEntries(Object.keys(facadeProfiles).map(profile=>[profile,material(0xffffff,{map:facadeTexture(profile,world.track.config.id==='aurora'),roughness:profile==='glass'?.34:.8})]));
  this.addCar();
  const slots=hospitalsForCourse(world.track.config.id);
  for(const [i,h] of slots.entries())this.buildHospital(h,i);
  this.clearScenery();this.addPit();this.addBanners();
  carveRoadClearance(world.terrainGeometry,world.track);world.terrainGeometry.attributes.position.needsUpdate=true;world.terrainGeometry.computeVertexNormals();
  this.stats={hospitalCount:this.items.length,names:this.items.map(x=>x.data.name),logoDecals:4,minimumRoadClearance:Math.min(...this.items.map(x=>x.clearance)),version:'3.1'};
 }
 box(root,w,h,d,material,x=0,y=0,z=0){const m=new T.Mesh(this.cube,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
 plane(root,w,h,material,x,y,z,rx=0,ry=0){const p=new T.Mesh(this.planeGeometry,material);p.scale.set(w,h,1);p.position.set(x,y,z);p.rotation.set(rx,ry,0);root.add(p);return p;}
 compact(root){
  // Static campus parts with matching geometry/material share a draw call.
  const buckets=new Map();for(const mesh of [...root.children])if(mesh.isMesh&&!mesh.isInstancedMesh){const key=mesh.geometry.uuid+mesh.material.uuid;const bucket=buckets.get(key)||[];bucket.push(mesh);buckets.set(key,bucket);}
  for(const meshes of buckets.values()){if(meshes.length<2)continue;const batch=new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);batch.castShadow=meshes.some(m=>m.castShadow);batch.receiveShadow=meshes.some(m=>m.receiveShadow);meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);root.remove(mesh);});batch.computeBoundingSphere();root.add(batch);}
 }
 addCar(){const car=this.world.car,mat=this.brandMat;
  // Bonnet, both doors, and the rear wing remain legible from chase/side views.
  this.plane(car,2.5,.625,mat,0,1.223,-1.65,-Math.PI/2);
  for(const side of [-1,1])this.plane(car,2.8,.7,mat,side*1.409,.84,.05,0,side*Math.PI/2);
  this.plane(car,3.03,.758,mat,0,1.645,2.05,-Math.PI/2);
  for(const x of [-1.14,1.14])this.box(car,.18,.02,4.3,this.m.navy,x,1.211,0);
  car.userData.brandDecals=4;
 }
 placement(h,i){const t=this.world.track,s=h.q*t.length;let best=null;
  for(const side of [i%2?1:-1,i%2?-1:1])for(const offset of [47,60,76]){const f=t.at(s),p=t.position(s,side*offset),clearance=t.distanceToRoad(p.x,p.z);if(clearance<39)continue;const ground=groundHeight(this.world.terrainGeometry,p.x,p.z),cost=Math.abs(ground-(f.p.y-2))+(offset-47)*.35+(side===(i%2?1:-1)?0:3);if(!best||cost<best.cost)best={s,p,side,clearance,cost,y:f.p.y-2,yaw:f.yaw};}
  if(!best)throw new Error('Ingen trygg sykehusplassering: '+h.name);return best;
 }
 terrace(site){const geo=this.world.terrainGeometry,a=geo.attributes.position,t=this.world.track;
  for(let j=0;j<a.count;j++){const x=a.getX(j),z=a.getZ(j),distance=Math.hypot(x-site.p.x,z-site.p.z);if(distance>53)continue;if(t.distanceToRoad(x,z)<t.config.width/2+5)continue;const u=clamp((distance-30)/23,0,1),mix=u*u*(3-2*u);a.setY(j,site.y*(1-mix)+a.getY(j)*mix);}
 }
 wing(root,w,h,d,x,z,profile='stone'){
  const walls=profile==='brick'?this.m.brick:profile==='glass'?this.m.glass:this.m.white;
  this.box(root,w,h,d,walls,x,h/2+1,z);
  this.box(root,w+.55,.20,d+.55,this.m.steel,x,h+.98,z);
  this.box(root,w+.82,.36,d+.82,this.m.roof,x,h+1.2,z);
  const facade=this.facades[profile];
  for(const side of [-1,1]){
   this.plane(root,w-.65,h-.60,facade,x,h/2+1,z+side*(d/2+.035),0,side>0?0:Math.PI);
   this.plane(root,d-.65,h-.60,facade,x+side*(w/2+.035),h/2+1,z,0,side*Math.PI/2);
  }
 }
 buildHospital(h,i){const site=this.placement(h,i);this.terrace(site);const root=new T.Group();root.name=h.name;root.position.copy(site.p);root.position.y=site.y;root.rotation.y=-site.yaw;this.root.add(root);
  this.box(root,43,1,34,this.m.stone,0,0,0);this.box(root,40,.12,31,this.m.road,0,.58,0);
  for(const x of [-18,18])for(const z of [-13,0,13]){
   const point=root.localToWorld(new T.Vector3(x,0,z));
   if(this.world.track.distanceToRoad(point.x,point.z)<this.world.track.config.width/2+4)continue;
   const ground=groundHeight(this.world.terrainGeometry,point.x,point.z)-site.y;
   if(ground<-.5)this.box(root,1.45,-ground,1.45,this.m.stone,x,ground/2-.4,z);
  }
  if(h.style==='tower'){this.wing(root,22,5,15,0,-1);this.wing(root,11,19,10,-4,-4,'glass');this.wing(root,7,9,13,13,-3);}
  else if(h.style==='modern'){this.wing(root,29,10,12,0,-5,'glass');this.wing(root,8,7,10,-10,5);this.wing(root,8,7,10,10,5);this.wing(root,9,8,10,0,1,'glass');}
  else if(h.style==='heritage'){this.wing(root,26,8,12,0,-3,'brick');this.wing(root,7,12,11,0,-3,'brick');const roof=new T.Mesh(new T.ConeGeometry(5.6,4,4),this.m.roof);roof.position.set(0,15,-3);roof.rotation.y=Math.PI/4;roof.scale.z=1.16;root.add(roof);this.box(root,2,1.5,.15,this.m.warm,0,11.7,2.56);}
  else if(h.style==='coastal'){this.wing(root,25,6,12,-1,-2);this.wing(root,9,4,10,12,3,'glass');this.box(root,8,.3,6,this.m.warm,-7,1,9);}
  else{this.wing(root,27,10,12,0,-4,'brick');this.wing(root,9,6,8,9,6,'brick');}

  // The entrance walk and warm canopy sit between planted beds and parking.
  this.box(root,7.7,.11,11,this.m.warm,0,.69,10.3);
  this.box(root,7,3,.3,this.m.glass,0,2.2,6);
  for(const x of [-2.24,0,2.24])this.box(root,.08,2.97,.35,this.m.steel,x,2.2,6.02);
  this.box(root,10,.30,5,this.m.navy,0,4.1,8);
  this.box(root,9.55,.12,.18,this.m.light,0,3.92,10.46);
  for(const x of [-4.3,4.3]){
   this.box(root,.22,3.7,.22,this.m.steel,x,2.2,9.6);
   this.box(root,3.5,.48,2.5,this.m.stone,x*1.75,.86,12.7);
   for(const offset of [-.88,.88]){
    const tree=new T.Mesh(this.pineGeometry,this.m.pine);
    tree.position.set(x*1.75+offset,2.14,12.7);tree.scale.set(.61,2.4,.61);tree.castShadow=true;root.add(tree);
   }
  }
  const nameMat=new T.MeshBasicMaterial({map:signTexture(h.name,PROVIDERS[h.provider].name),toneMapped:false});
  const sign=new T.Sprite(new T.SpriteMaterial({map:nameMat.map,depthWrite:false,toneMapped:false}));sign.position.set(0,h.style==='tower'?25:21,0);sign.scale.set(44,11,1);root.add(sign);
  this.plane(root,17,4.25,nameMat,0,8.5,6.07);
  const marker=new T.MeshBasicMaterial({map:signTexture('H','SYKEHUSLØYPA'),toneMapped:false});this.box(root,.25,7,.25,this.m.steel,-18,4,11);this.plane(root,5.2,1.3,marker,-18,7.5,11);
  for(let j=0;j<3;j++){
   this.box(root,.085,.018,4.8,this.m.steel,9+j*3,.65,10.9);
   this.box(root,1.9,.8,3.5,j===0?this.m.white:this.m.navy,10.5+j*3,.98,11);
   this.box(root,1.6,.55,1.5,this.m.glass,10.5+j*3,1.6,10.8);
  }
  // Roadside sign is closer than the actual campus; it does not obstruct road.
  const roadSign=new T.Group();roadSign.position.copy(this.world.track.position(site.s,site.side*19));roadSign.rotation.y=-site.yaw;
  this.box(roadSign,.18,5,.18,this.m.steel,0,2.2,0);this.plane(roadSign,8,2,nameMat,0,5,0);this.root.add(roadSign);
  this.compact(root);this.items.push({data:h,root,sign,roadSign,...site});
 }
 clearScenery(){const dummy=new T.Matrix4(),position=new T.Vector3();this.world.scene.updateMatrixWorld(true);
  // Remove existing trees/rocks that would grow through the new hospital pads.
  for(const object of this.world.scene.children){if(!object.isInstancedMesh||object===this.world.skids)continue;let changed=false;for(let i=0;i<object.count;i++){object.getMatrixAt(i,dummy);position.setFromMatrixPosition(dummy).applyMatrix4(object.matrixWorld);if(this.items.some(h=>Math.hypot(position.x-h.p.x,position.z-h.p.z)<29)){dummy.makeScale(0,0,0);object.setMatrixAt(i,dummy);changed=true;}}if(changed)object.instanceMatrix.needsUpdate=true;}
 }
 addPit(){const t=this.world.track,root=new T.Group(),f=t.at(35);root.position.copy(t.position(35,24));root.position.y=groundHeight(this.world.terrainGeometry,root.position.x,root.position.z)+.4;root.rotation.y=-f.yaw;this.root.add(root);
  this.box(root,10,3.4,5,this.m.white,0,1.7,0);this.box(root,11,.4,6,this.m.navy,0,3.6,0);this.plane(root,9,2.25,this.brandMat,0,2.4,2.52);this.box(root,3,2.5,.1,this.m.glass,-2,1.3,2.55);
  const van=new T.Group();van.position.set(9,0,0);root.add(van);this.box(van,2.8,2.5,5.5,this.m.white,0,1.9,0);this.box(van,2.55,1.2,1.5,this.m.glass,0,2.2,-2.2);this.plane(van,3.3,.825,this.brandMat,-1.41,2,.35,0,-Math.PI/2);for(const x of [-1.4,1.4])for(const z of [-1.8,1.8]){const wheel=new T.Mesh(new T.CylinderGeometry(.65,.65,.28,10),this.m.road);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.65,z);van.add(wheel);}
 }
 addBanners(){const t=this.world.track;for(const q of [.02,.25,.5,.80,.985])for(const side of [-1,1]){const s=q*t.length,root=new T.Group();root.position.copy(t.position(s,side*(t.config.width/2+3)));root.rotation.y=-t.at(s).yaw;this.root.add(root);this.box(root,.15,8,.15,this.m.steel,0,4,0);this.plane(root,10,2.5,this.brandMat,side*4.4,6.5,0);}}
 update(car,mode){
  if(mode==='countdown'&&this.lastS>car.s+10)this.visited.clear();this.lastS=car.s;
  const driving=['race','quiz','paused','countdown'].includes(mode);
  for(const h of this.items){const d=h.s-car.s;h.root.visible=h.roadSign.visible=(mode==='menu'||driving)&&d>-130&&d<720;h.sign.visible=driving&&d>60&&d<290;const signScale=clamp(d/220,.45,1);h.sign.scale.set(44*signScale,11*signScale,1);if(driving&&d<25&&d>-45)this.visited.add(h.data.id);}
  if((this.ticks++%6)!==0)return;
  const el=document.getElementById('hospital-readout');if(!el)return;
  const next=this.items.find(h=>h.s>=car.s-30&&h.s-car.s<260);el.classList.toggle('hidden',!driving||mode==='paused'||!next);
  const key=next?.data.id+mode;if(key!==this.uiLast&&next){this.uiLast=key;el.querySelector('strong').textContent=next.data.name;el.querySelector('small').textContent=PROVIDERS[next.data.provider].name;}
  if(next)el.querySelector('span').textContent=`SYKEHUSLØYPA · ${this.visited.size}/${this.items.length} · ${next.side<0?'VENSTRE':'HØYRE'}`;
 }
}
