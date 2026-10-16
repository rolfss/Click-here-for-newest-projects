# Exact reviewed panoramic-tour refinement; creates blobs, never refs.
from pathlib import Path
import json,hashlib,base64,os,urllib.request
root=Path('fjordsprint')
def patch(file,old,new):
 p=root/file;s=p.read_text();assert old in s,(file,old[:80]);p.write_text(s.replace(old,new))
patch('dist/main.js','raceSettings.sightseeing=true;','raceSettings.sightseeing=true;car.sightseeing=true;')
patch('dist/rally-world.js',"else if(options.camera==='hood'){", "else if(state.sightseeing&&this.hospitals.items.some(h=>h.s>state.s+10&&h.s-state.s<300)){const h=this.hospitals.items.find(h=>h.s>state.s+10&&h.s-state.s<300);desired=this.car.position.clone().addScaledVector(f.t,-18).addScaledVector(f.r,-h.side*6);desired.y+=8;const focus=h.p.clone();focus.y=h.y+12;target=this.car.position.clone().addScaledVector(f.t,23);target.y+=1.5;target.lerp(focus,.86);}\n  else if(options.camera==='hood'){")
patch('dist/rally-world.js','dt*(flight?16:12)','dt*(flight?16:state.sightseeing?2.5:12)')
patch('tests/browser-smoke.py','car.s=Math.max(0,h.s-145);','car.s=Math.max(0,h.s-145);car.sightseeing=true;')
patch('tests/browser-smoke.py','s:Math.max(0,hospital.s-distance)}','s:Math.max(0,hospital.s-distance),sightseeing:world.camera.aspect<.8}')
patch('tests/browser-smoke.py','findings.push({name:hospital.data.name,visible,clearance:',"findings.push({name:hospital.data.name,visible,camera:world.camera.aspect<.8?'guided-tour':'race',clearance:")
patch('tests/browser-smoke.py',"assert page.evaluate('__qa.raceSettings.sightseeing')","assert page.evaluate('__qa.raceSettings.sightseeing')\n assert page.evaluate('__qa.car.sightseeing')")
expected={'fjordsprint/dist/main.js':'d9cb175b9d0ef480070572dd4b1ce161664faba4','fjordsprint/dist/rally-world.js':'9de6f514cc872d46decc056090111763d8989350','fjordsprint/tests/browser-smoke.py':'36489a553026d21755dc331827214d8420728af4'}
for name,sha in expected.items():
 b=Path(name).read_bytes();actual=hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest();assert actual==sha,(name,actual,sha)
for name,sha in expected.items():
 data=json.dumps({'encoding':'base64','content':base64.b64encode(Path(name).read_bytes()).decode()}).encode()
 req=urllib.request.Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+'/git/blobs',data=data,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as r:response=json.load(r)
 assert response['sha']==sha
 print(name,sha,flush=True)
