# Materialize exact reviewed fixes as content-addressed objects. No ref updates.
from pathlib import Path
import json,hashlib,base64,os,urllib.request
root=Path('fjordsprint')
def patch(file,old,new):
 p=root/file;s=p.read_text();assert old in s,(file,old[:80]);p.write_text(s.replace(old,new))
patch('dist/main.js',"if(raw>3&&['race','quiz'].includes(mode))pause();",'/* Background pauses are handled by blur/visibility; slow GPU frames must not lock the controls. */')
patch('dist/hso-world.js','this.cube=new T.BoxGeometry(1,1,1);this.brand=','this.cube=new T.BoxGeometry(1,1,1);this.planeGeometry=new T.PlaneGeometry(1,1);this.brand=')
patch('dist/hso-world.js','const p=new T.Mesh(new T.PlaneGeometry(w,h),material);p.position.set(x,y,z);','const p=new T.Mesh(this.planeGeometry,material);p.scale.set(w,h,1);p.position.set(x,y,z);')
patch('dist/hso-world.js',' addCar(){', ''' compact(root){
  // Static campus parts with matching geometry/material share a draw call.
  const buckets=new Map();for(const mesh of [...root.children])if(mesh.isMesh&&!mesh.isInstancedMesh){const key=mesh.geometry.uuid+mesh.material.uuid;const bucket=buckets.get(key)||[];bucket.push(mesh);buckets.set(key,bucket);}
  for(const meshes of buckets.values()){if(meshes.length<2)continue;const batch=new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);batch.castShadow=meshes.some(m=>m.castShadow);batch.receiveShadow=meshes.some(m=>m.receiveShadow);meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);root.remove(mesh);});batch.computeBoundingSphere();root.add(batch);}
 }
 addCar(){''')
patch('dist/hso-world.js','this.items.push({data:h,root,sign,roadSign,...site});','this.compact(root);this.items.push({data:h,root,sign,roadSign,...site});')
patch('dist/hso-world.js',"h.root.visible=h.roadSign.visible=mode==='menu'||(driving&&d>-130&&d<720);h.sign.visible=driving&&d>-25&&d<290;", "h.root.visible=h.roadSign.visible=(mode==='menu'||driving)&&d>-130&&d<720;h.sign.visible=driving&&d>60&&d<290;const signScale=clamp(d/220,.45,1);h.sign.scale.set(44*signScale,11*signScale,1);")
patch('tests/browser-smoke.py','inspectCampuses(){const findings=[];', 'inspectCampuses(){const findings=[],render=world.renderer.render;world.renderer.render=()=>{};try{')
patch('tests/browser-smoke.py','}return findings;},','}return findings;}finally{world.renderer.render=render;}},')
patch('tests/handling.test.mjs',"assert.equal(b.readUInt32BE(20),231);", "assert.equal(b.readUInt32BE(20),231);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),'5b00b00e9d911e532a9bcc94290dbff36489331c5264f30fa3a8e220a862bc96');")
expected={
 'fjordsprint/dist/main.js':'7201bf6bd8f2ed51e8190b5809c1782d549e87fd',
 'fjordsprint/dist/hso-world.js':'6488688604b8400d362f2f8f129c6f1fa0d267fd',
 'fjordsprint/tests/browser-smoke.py':'f39769d96db76eb938d2b8a7c63ebcec2f2873a0',
 'fjordsprint/tests/handling.test.mjs':'1cb5446478a3082cd41df52ea54ae990c3a75e5a'}
for name,sha in expected.items():
 b=Path(name).read_bytes();actual=hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest();assert actual==sha,(name,actual,sha)
for name,sha in expected.items():
 data=json.dumps({'encoding':'base64','content':base64.b64encode(Path(name).read_bytes()).decode()}).encode()
 req=urllib.request.Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+'/git/blobs',data=data,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as r:response=json.load(r)
 assert response['sha']==sha
 print(name,sha,flush=True)
