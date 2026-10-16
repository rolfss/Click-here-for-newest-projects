# One-shot, hash-checked materialization of reviewed Fjordsprint edits.
# Creates Git blobs only. It does not update a branch or publish a site.
from pathlib import Path
import os, json, hashlib, base64, urllib.request
p=Path('fjordsprint/dist')
def patch(file,old,new):
 s=(p/file).read_text();assert old in s,(file,old[:60]);(p/file).write_text(s.replace(old,new))
patch('rally-world.js',"import {World as BaseWorld} from './world.js';","import {World as BaseWorld} from './world.js';\nimport {HospitalWorld} from './hso-world.js';")
patch('rally-world.js','this.rally=new RallyScene(this);','this.rally=new RallyScene(this);this.hospitals=new HospitalWorld(this);')
patch('rally-world.js','this.rally.update(state,dt,mode,options.challenge,options);','this.rally.update(state,dt,mode,options.challenge,options);this.hospitals.update(state,mode);')
patch('rally-world.js',"else{desired=this.car.position.clone().addScaledVector(f.t,-14-speed*.05).addScaledVector(f.r,-state.heading*3);desired.y+=6+speed*.015;target=this.track.position(Math.min(state.s+25+speed*.18,this.track.roadLength),state.x*.6,2);}","else{const heading=state.travelHeading??state.heading,velocity=f.t.clone().multiplyScalar(Math.cos(heading)).addScaledVector(f.r,Math.sin(heading));desired=this.car.position.clone().addScaledVector(velocity,-13-speed*.035);desired.y+=5.8+speed*.008;target=this.car.position.clone().addScaledVector(velocity,23+speed*.12);target.y+=1.5;target.lerp(this.track.position(Math.min(state.s+36+speed*.15,this.track.roadLength),state.x*.35,2),.28);}")
patch('rally-world.js','menu?2:flight?13:9','menu?2:flight?13:15')
patch('smoothing.js',"out.heading=previous.heading+angle(current.heading-previous.heading)*t;","out.heading=previous.heading+angle(current.heading-previous.heading)*t;\n for(const key of ['roll','pitch','suspension','slip','yawRate'])if(Number.isFinite(previous[key])&&Number.isFinite(current[key]))out[key]=previous[key]+(current[key]-previous[key])*t;\n if(Number.isFinite(previous.travelHeading)&&Number.isFinite(current.travelHeading))out.travelHeading=previous.travelHeading+angle(current.travelHeading-previous.travelHeading)*t;\n if(Number.isFinite(previous.flightPitch)&&Number.isFinite(current.flightPitch))out.flightPitch=previous.flightPitch+(current.flightPitch-previous.flightPitch)*t;")
patch('main.js',"import {RaceAudio} from './rally-audio.js';","import {RaceAudio} from './rally-audio.js';\nimport {prepareHospitalWorld} from './hso-world.js';\nimport {mountHospitalUI} from './hso-ui.js';\nimport {REGION_ROUTES} from './hso-data.js';")
patch('main.js','...course,...THEMES[i]','...course,...THEMES[i],region:REGION_ROUTES[i]')
patch('main.js',"livery:'#82eee0'","livery:'#e6edf3'")
patch('main.js',"opts.quiz?'archive3':'time3'","opts.quiz?'archive31':'time31'")
patch('main.js',"async function init(){try{archive=","async function init(){try{await prepareHospitalWorld();archive=")
patch('main.js',"bind();show('#loading',false);","mountHospitalUI({openModal,tour:index=>{const cup=settings.cup;settings.cup=false;selectCourse(index);settings.cup=cup;startRace(true);raceSettings.sightseeing=true;raceSettings.quiz=false;raceSettings.ghost=false;ghostFrames=null;challenge.trolls.forEach(t=>t.phase='passed');$('#hud-mode').textContent='UTSIKTSTUR · INGEN POENGLAGRING';}});bind();show('#loading',false);")
patch('main.js',"if(raceDemo&&mode==='race')input=demoDriver(car,track,raceSettings.assist);","if(raceDemo&&mode==='race'){input=demoDriver(car,track,raceSettings.assist);if(raceSettings.sightseeing){input.fire=false;input.boost=false;input.throttle=car.speed<30;input.brake=car.speed>32;}}")
patch('main.js','<option value="#82eee0">Fjordgrønn</option>','<option value="#e6edf3">Sykehuspartner – hvit/blå</option><option value="#82eee0">Fjordgrønn</option>')
patch('main.js','Brems før svingen, styr jevnt og gi gass ut. Bilen har treghet, begrenset veigrep og fjæring.','Styr presist med korte trykk. Slipp gassen eller brems før trange svinger. Et kort bremsetrykk mens du styrer i fart starter en kontrollerbar sladd; Mellomrom gjør det samme. Slipp bremsen og rett opp for å hente inn grepet. I lufta bremser S rotasjonen uten å stoppe fremdriften. Bilen retter seg ikke automatisk mot veien.')
patch('main.js',"'DRIFT · LADER BOOST'","'DRIFT · RETT OPP FOR GREP'")
patch('rally-rules.js','(archive3|time3)','(archive3|time3|archive31|time31)')
patch('rally-ui.js',"board.includes('archive3')","board.includes('archive')")
patch('rally-ui.js','Beste aktive poengsum per navn. Ved lik poengsum vinner kortest tid.','Beste aktive poengsum per navn. Ved lik poengsum vinner kortest tid. Nye kjøreegenskaper i v3.1 har egne lister; tidligere resultater beholder sitt opprinnelige 48-timersutløp.')
patch('rally-ui.js',"from './rally-rules.js'","from './rally-rules.js?v=3.1.0'")
patch('index.html','<link rel="stylesheet" href="rally.css?v=3.0.0">','<link rel="stylesheet" href="rally.css?v=3.1.0"><link rel="stylesheet" href="hso.css?v=3.1.0">')
patch('index.html','FJELLCUPEN · v3.0','FJELLCUPEN · v3.1')
patch('index.html','v3.0 / 2026','v3.1 / 2026')
patch('index.html','Inspirert av Norge · banene er fiktive','Uoffisielt læringsspill · fiktive fjellbaner')
patch('index.html','main.js?v=3.0.0','main.js?v=3.1.0')
for file in ['main.js','rally-world.js']:
 s=(p/file).read_text()
 for name in ['rally-world','rally-physics','smoothing','rally-rules','rally-ui','hso-world','hso-ui','hso-data']:
  s=s.replace("'./"+name+".js'","'./"+name+".js?v=3.1.0'")
 (p/file).write_text(s)
f=Path('fjordsprint/tests/verify.mjs');f.write_text(f.read_text().replace("path.join(root,'dist',match[1])","path.join(root,'dist',match[1].split(/[?#]/)[0])"))
f=Path('fjordsprint/package.json');data=json.loads(f.read_text());data['version']='3.1.0';data['scripts']['test']+=' tests/handling.test.mjs';f.write_text(json.dumps(data,indent=2)+'\n')
expected={
 'fjordsprint/dist/main.js':'6caedfc45f6363d4b327d23eb3cfbf1e596fdda2',
 'fjordsprint/dist/rally-world.js':'0854729bbe87b747b4d15ba616da6105739932eb',
 'fjordsprint/dist/smoothing.js':'ca608d1c34a01984a334c5570a0437d7edb4c8ba',
 'fjordsprint/dist/rally-rules.js':'b2e2b1a9bc28c74af25a6da7012b9a4ac91f51bf',
 'fjordsprint/dist/rally-ui.js':'8991e3c9cb53987333d91ae6d854787f3babd062',
 'fjordsprint/dist/index.html':'8684b278752b95adaaef3349bc1a678ede51920a',
 'fjordsprint/tests/verify.mjs':'7f8f39570db9a5f62d6839651cabff5d056ac833',
 'fjordsprint/package.json':'9a3d560c90920c59986bafda2f882aab3756636e',
 'fjordsprint/dist/assets/sykehuspartner.png':'328a8b8d13ab0b77df74f427ef6abfea58d9cac8'
}
# Check every payload before creating any blobs. No Git references are written.
for name,sha in expected.items():
 b=Path(name).read_bytes();actual=hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest();assert actual==sha,(name,actual,sha)
for name,sha in expected.items():
 payload=json.dumps({'content':base64.b64encode(Path(name).read_bytes()).decode(),'encoding':'base64'}).encode()
 req=urllib.request.Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+'/git/blobs',data=payload,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=40) as response:created=json.load(response)
 assert created['sha']==sha,(name,created)
 print(name,sha,flush=True)
Path('assets').mkdir(exist_ok=True);Path('assets/manifest.json').write_text(json.dumps(expected,indent=2))
