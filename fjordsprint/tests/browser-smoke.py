"""Real Chromium/WebGL smoke tests; QA hooks never ship in the game."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
import json
import os
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests'/'screenshots'
OUT.mkdir(exist_ok=True)
HOOKS="""
import {groundHeight as qaGroundHeight} from './terrain.js';
window.__qa={get car(){return car;},get game(){return challenge;},get mode(){return mode;},get quiz(){return quizState;},get track(){return track;},get world(){return world;},get settings(){return settings;},get raceSettings(){return raceSettings;},get debug(){return {mode,car,keys,touch,active:document.activeElement?.outerHTML,challenge,frameAverage,drawCalls:world.renderer.info.render.calls};},setCar(v){Object.assign(car,v);resetInterpolation();},setAge(v){finishAge=v;},selectCourse,toMenu,openQuiz,answerQuiz,
 previewCampus(index){const h=world.hospitals.items[index];setMode('race');raceSettings={...settings,quiz:false};raceDemo=false;encounters=[];keys={};touch={};car=initialState();car.s=Math.max(0,h.s-145);car.sightseeing=true;car.checkpoint=track.checkpoints.filter(s=>s<=car.s).length;car.jumpIndex=track.jumps.filter(s=>s<=car.s).length;challenge=createChallenge(track,trackIndex);resetInterpolation();world.cameraInitialized=false;world.render(car,1/60,mode,{challenge,camera:'chase',motion:false});},
 inspectCampuses(){const findings=[],render=world.renderer.render;world.renderer.render=()=>{};try{for(const hospital of world.hospitals.items){let visible=false;for(const distance of [120,180,250]){const c={...initialState(),s:Math.max(0,hospital.s-distance),sightseeing:world.camera.aspect<.8};world.cameraInitialized=false;world.render(c,1/60,'race',{challenge:null,camera:'chase',motion:false});world.camera.updateMatrixWorld(true);const point=hospital.sign.position.clone();hospital.root.localToWorld(point);point.project(world.camera);if(hospital.sign.visible&&Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z<1)visible=true;}findings.push({name:hospital.data.name,visible,camera:world.camera.aspect<.8?'guided-tour':'race',clearance:hospital.clearance});}return findings;}finally{world.renderer.render=render;}},
 checkTerrain(){let min=Infinity;for(let s=0;s<track.length;s+=7)for(const x of [-track.config.width/2,0,track.config.width/2]){const p=track.position(s,x);min=Math.min(min,p.y-qaGroundHeight(world.terrainGeometry,p.x,p.z));}return min;}
};
"""
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
reports=[]
def shot(page,name):page.screenshot(path=str(OUT/f'{name}.png'))
def wait(page,condition):page.wait_for_function(condition,timeout=45000)
def exercise(page,label,touch):
 page.goto(url,wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)',timeout=60000)
 assert page.evaluate('__qa.world.renderer.info.render.calls')>0
 assert page.evaluate('__qa.world.car.userData.brandDecals')==4
 assert page.locator('#partner-badge img').evaluate('(img)=>img.complete&&img.naturalWidth===1246')
 page.click('#hospitals-btn');assert page.locator('.hospital-directory li').count()==44
 assert page.locator('[data-tour]').count()==3
 shot(page,label+'-directory');page.click('#close-modal');shot(page,label+'-menu')
 page.evaluate("__qa.world.setQuality('low')")
 page.click('#play-btn');page.click('#mobile-help-start' if touch else '#help-start');page.wait_for_selector('#driver-name')
 assert page.evaluate('__qa.mode')=='menu'
 page.fill('#driver-name','<img>');page.click('#driver-form button');assert page.locator('#driver-error').inner_text()
 page.fill('#driver-name','Rolf Test');page.click('#driver-form button');wait(page,"__qa.mode==='race'")
 page.keyboard.down('KeyW');page.wait_for_timeout(900);page.keyboard.up('KeyW');assert page.evaluate('__qa.car.speed')>0
 page.evaluate("()=>{__qa.raceSettings.mobileHelp=false;let t=__qa.game.trolls[0];__qa.setCar({s:t.s-65,x:0,heading:0,speed:0});t.phase='active';t.x=0;t.targetX=0;t.age=2;__qa.world.cameraInitialized=false;}")
 page.wait_for_timeout(500);shot(page,label+'-troll')
 if touch:
  box=page.locator('#mobile-fire').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();wait(page,'__qa.game.cleared>=1');page.mouse.up()
 else:
  page.keyboard.down('KeyE');wait(page,'__qa.game.cleared>=1');page.keyboard.up('KeyE')
 assert page.evaluate('__qa.game.cleared')>=1
 page.evaluate('__qa.raceSettings.mobileHelp=__qa.settings.mobileHelp;__qa.openQuiz(1)');before=page.evaluate('__qa.car.time');page.wait_for_timeout(400);assert page.evaluate('__qa.car.time')==before
 shot(page,label+'-quiz');page.evaluate('__qa.answerQuiz(__qa.quiz.q.correct)');page.click('#skip-quiz');page.wait_for_timeout(300)
 assert page.evaluate('__qa.game.correct')==1
 page.evaluate("()=>{Object.assign(__qa.game,{juice:140,correct:5,cleared:8,hits:16,fired:24});__qa.setCar({time:95,s:__qa.track.length-.01,speed:30,checkpoint:3});}")
 wait(page,"__qa.mode==='finish'");page.wait_for_timeout(550);shot(page,label+'-rocket-dock')
 page.evaluate('__qa.setAge(6);__qa.world.cameraInitialized=false');page.wait_for_timeout(350);shot(page,label+'-rocket')
 page.evaluate('__qa.setAge(11.8);__qa.world.cameraInitialized=false');wait(page,"document.querySelectorAll('.career-rung.reached').length===6")
 page.wait_for_timeout(600);shot(page,label+'-rocket-top');page.click('#skip-rocket');page.wait_for_timeout(200)
 assert 'Toppleder' in page.locator('#score-entry').inner_text()
 assert 'Rolf Test' in page.locator('#result-score-rows').inner_text()
 shot(page,label+'-results')
 rows=page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-career-scores-v3'))")
 assert len(rows)==1 and rows[0]['expiresAt']-rows[0]['createdAt']==172800000
 campuses=[]
 for i in [0,1,2]:
  page.evaluate(f'()=>{{__qa.toMenu();__qa.settings.cup=false;__qa.selectCourse({i});}}')
  assert page.evaluate('__qa.world.car.userData.brandDecals')==4
  assert page.evaluate('__qa.checkTerrain()')>0
  campuses.extend(page.evaluate('__qa.inspectCampuses()'))
  page.evaluate('__qa.previewCampus(3)');page.wait_for_timeout(250);shot(page,f'{label}-hospitals-{i+1}')
 assert len(campuses)==44
 assert all(h['visible'] for h in campuses),[h for h in campuses if not h['visible']]
 page.evaluate('__qa.toMenu()');page.click('#hospitals-btn');page.click('[data-tour="0"]');wait(page,"__qa.mode==='race'")
 assert page.evaluate('__qa.raceSettings.sightseeing')
 assert page.evaluate('__qa.car.sightseeing')
 assert not page.evaluate('__qa.raceSettings.quiz')
 wait(page,'__qa.car.speed>5');assert page.evaluate('__qa.game.fired')==0
 assert len(page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-career-scores-v3'))"))==1
 page.evaluate('__qa.toMenu()');page.reload(wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)')
 page.click('#leaderboard-btn');assert 'Rolf Test' in page.locator('#leaderboard-rows').inner_text()
 page.context.add_init_script('const originalNow=Date.now;Date.now=()=>originalNow()+172800001;')
 page.reload(wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)');page.click('#leaderboard-btn')
 assert 'Ingen aktive resultater' in page.locator('#leaderboard-rows').inner_text()
 assert page.evaluate("localStorage.getItem('fjordsprint-career-scores-v3')")=='[]'
 return campuses
try:
 with sync_playwright() as p:
  launch={'headless':True,'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
  if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  browser=p.chromium.launch(**launch)
  for label,w,h,touch in [('desktop',1440,900,False),('mobile-portrait',390,844,True),('mobile-landscape',844,390,True)]:
   if os.environ.get('FJORDSPRINT_VIEWPORT') and os.environ['FJORDSPRINT_VIEWPORT']!=label:continue
   ctx=browser.new_context(viewport={'width':w,'height':h},has_touch=touch,device_scale_factor=1)
   page=ctx.new_page();errors=[]
   page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',str(e),flush=True)))
   page.route('**/main.js*',lambda route:route.fulfill(content_type='application/javascript',body=(ROOT/'dist/main.js').read_text()+HOOKS))
   try:
    campuses=exercise(page,label,touch);assert not errors,errors
    reports.append({'viewport':label,'errors':errors,'hospitals':campuses,'passed':True})
   except Exception:
    debug=page.evaluate('__qa.debug');print('FAILURE STATE',json.dumps(debug,ensure_ascii=False),flush=True)
    (OUT/f'{label}-failure.json').write_text(json.dumps(debug,ensure_ascii=False,indent=2))
    shot(page,label+'-failure');raise
   finally:ctx.close()
  browser.close()
finally:
 server.shutdown();(OUT/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
print(json.dumps(reports,ensure_ascii=False,indent=2))
