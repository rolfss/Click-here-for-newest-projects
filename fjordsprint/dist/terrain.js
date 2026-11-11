// Call after assigning the terrain's vertex heights and before computing normals.
// It only lowers triangles whose road-clearance samples fail; other vertices stay untouched.
export function carveRoadClearance(geometry,track){
 const a=geometry.attributes.position,indices=geometry.index.array;
 const nx=geometry.parameters.widthSegments,nz=geometry.parameters.heightSegments;
 const minX=a.getX(0),minZ=a.getZ(0),dx=geometry.parameters.width/nx,dz=geometry.parameters.height/nz;
 const half=track.config.width/2+1.3,clearance=.8;
 // A terrain triangle can peak between the centre line and the road edge.
 const roadOffsets=Array.from({length:13},(_,index)=>(index-6)*half/6);
 const plazaHalf=track.config.width/2+26;
 const plazaOffsets=[-plazaHalf,...roadOffsets,plazaHalf];
 let adjustments=0;
 const triangle=(x,z)=>{
  const fx=(x-minX)/dx,fz=(z-minZ)/dz,ix=Math.floor(fx),iz=Math.floor(fz);
  if(ix<0||iz<0||ix>=nx||iz>=nz)return null;
  const base=(iz*nx+ix)*6+(fx-ix+fz-iz<=1?0:3),ids=[indices[base],indices[base+1],indices[base+2]];
  const [A,B,C]=ids.map(i=>({x:a.getX(i),y:a.getY(i),z:a.getZ(i)}));
  const den=(B.z-C.z)*(A.x-C.x)+(C.x-B.x)*(A.z-C.z);
  const u=((B.z-C.z)*(x-C.x)+(C.x-B.x)*(z-C.z))/den,v=((C.z-A.z)*(x-C.x)+(A.x-C.x)*(z-C.z))/den;
  return {ids,height:u*A.y+v*B.y+(1-u-v)*C.y};
 };
 const length=track.roadLength||track.length,steps=Math.ceil(length/2);
 for(let pass=0;pass<2;pass++)for(let i=0;i<=steps;i++){
  const s=i*length/steps,f=track.at(s),plaza=s>=track.length-45&&s<=track.length+195;
  for(const offset of plaza?plazaOffsets:roadOffsets){
   const hit=triangle(f.p.x+f.r.x*offset,f.p.z+f.r.z*offset);if(!hit)continue;
   const excess=hit.height-(f.p.y-clearance);
   if(excess>.001){for(const id of hit.ids)a.setY(id,a.getY(id)-excess-.002);adjustments++;}
  }
 }
 a.needsUpdate=true;
 return adjustments;
}

// Place scenery on the exact rendered triangles, including the carved roadside.
export function groundHeight(geometry,x,z){
 const a=geometry.attributes.position,idx=geometry.index.array,nx=geometry.parameters.widthSegments,nz=geometry.parameters.heightSegments;
 const fx=(x-a.getX(0))/(geometry.parameters.width/nx),fz=(z-a.getZ(0))/(geometry.parameters.height/nz),ix=Math.floor(fx),iz=Math.floor(fz);
 if(ix<0||iz<0||ix>=nx||iz>=nz)return 0;
 const tx=fx-ix,tz=fz-iz,base=(iz*nx+ix)*6+(tx+tz<=1?0:3),A=idx[base],B=idx[base+1],C=idx[base+2];
 if(tx+tz<=1)return a.getY(A)*(1-tx-tz)+a.getY(B)*tz+a.getY(C)*tx;
 return a.getY(A)*(1-tx)+a.getY(B)*(tx+tz-1)+a.getY(C)*(1-tz);
}
