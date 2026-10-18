"""Touch-event regression and visual captures; all QA hooks stay in this server."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/screenshots';OUT.mkdir(exist_ok=True)
HOOKS="""
window.__mobileQA={get car(){return car;},get input(){return mobile;},get mode(){return mode;},get settings(){return settings;},get quiz(){return quizState;},get world(){return world;},get game(){return challenge;},step,toMenu,openQuiz,answerQuiz,
boostPreview(index){toMenu();settings.cup=false;selectCourse(index);car=initialState();car.s=track.pads[0]-31;challenge=createChallenge(track,trackIndex);challenge.trolls.forEach(t=>t.phase='passed');encounters=[];raceSettings={...settings,mobileHelp:false};setMode('race');world.cameraInitialized=false;resetInterpolation();},
resetForTouch(){car=initialState();car.s=80;challenge=createChallenge(track,trackIndex);challenge.trolls.forEach(t=>t.phase='passed');encounters=[];raceSettings={...settings};mode='race';world.cameraInitialized=false;resetInterpolation();}
};
"""
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));Thread(target=server.serve_forever,daemon=True).start()
reports=[]
def screenshot(page,name):page.screenshot(path=str(OUT/(name+'.png')))
def center(page,selector):
 box=page.locator(selector).bounding_box();assert box,selector
 return {'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
def controls_fit(page):
 for selector in ['#thumb-steer','#mobile-fire','#mobile-brake','#mobile-boost','#mobile-recover','#pause-btn']:
  box=page.locator(selector).bounding_box();assert box,selector
  assert box['width']>=44 and box['height']>=44,(selector,box)
  assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=page.viewport_size['width']+.5 and box['y']+box['height']<=page.viewport_size['height']+.5,(selector,box,page.viewport_size)
  assert page.locator(selector).evaluate('(el)=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),selector+' is obscured'
try:
 with sync_playwright() as p:
  launch={'headless':True,'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
  if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  browser=p.chromium.launch(**launch)
  label=os.environ.get('FJORDSPRINT_VIEWPORT','mobile-portrait');touch=label!='desktop';size={'desktop':(1280,800),'mobile-portrait':(390,844),'mobile-landscape':(844,390)}[label]
  ctx=browser.new_context(viewport={'width':size[0],'height':size[1]},has_touch=touch,device_scale_factor=1);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/main.js*',lambda route:route.fulfill(content_type='text/javascript',body=(ROOT/'dist/main.js').read_text()+HOOKS))
  page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)',timeout=60000)
  page.evaluate("__mobileQA.world.setQuality('low')")
  screenshot(page,label+'-32-menu')
  if touch:
   assert page.evaluate('__mobileQA.settings.mobileHelp')
   page.click('#play-btn');page.click('#mobile-help-start');page.fill('#driver-name','Mobiltest');page.click('#driver-form button')
   page.wait_for_function("__mobileQA.mode==='race'",timeout=20000);page.wait_for_function('__mobileQA.car.speed>3')
   controls_fit(page);page.evaluate('__mobileQA.resetForTouch()');page.wait_for_timeout(200)
   client=ctx.new_cdp_session(page);left=center(page,'#thumb-steer');right=center(page,'#mobile-brake');left['x']+=25
   client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{**left,'id':1},{**right,'id':2}]})
   page.wait_for_function('__mobileQA.input.steering>.15')
   assert page.evaluate('__mobileQA.input.sample({}).brake')
   screenshot(page,label+'-32-two-thumbs')
   client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});page.wait_for_timeout(100)
   assert page.evaluate('__mobileQA.input.steering')==0
   assert not page.evaluate('!!__mobileQA.input.sample({}).brake')
   # The normal quiz cannot time out in the comfort class, even after 24 seconds.
   page.evaluate('__mobileQA.openQuiz(1)');page.wait_for_selector('#quiz:not(.hidden)')
   panel=page.locator('#quiz').bounding_box();assert panel
   assert panel['x']>=10 and panel['y']>=10 and panel['x']+panel['width']<=page.viewport_size['width']-10 and panel['y']+panel['height']<=page.viewport_size['height']-10,panel
   for button in page.locator('#quiz-answers button').all():
    button.scroll_into_view_if_needed()
    assert button.evaluate('(el)=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),'Answer is clipped or covered'
   page.locator('#quiz').evaluate('(el)=>el.scrollTop=0')
   page.evaluate('()=>{for(let i=0;i<2881;i++)__mobileQA.step(1/120,{});}');assert not page.evaluate('__mobileQA.quiz.answered');assert page.evaluate('__mobileQA.quiz.left')==20
   page.wait_for_selector('#mobile-controls',state='hidden');assert not page.locator('#mobile-controls').is_visible()
   page.evaluate('__mobileQA.answerQuiz(__mobileQA.quiz.q.correct)');page.evaluate('()=>{for(let i=0;i<1201;i++)__mobileQA.step(1/120,{});}');assert page.evaluate('__mobileQA.mode')=='quiz'
   screenshot(page,label+'-32-reading');page.click('#skip-quiz');page.wait_for_function("__mobileQA.mode==='race'")
   # Pause interrupts held input; resuming requires a new touch.
   page.wait_for_selector('#mobile-fire');fire=center(page,'#mobile-fire');client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{**fire,'id':3}]});page.keyboard.press('Escape');page.wait_for_selector('#modal-backdrop:not(.hidden)');page.wait_for_timeout(100)
   assert not page.evaluate('!!__mobileQA.input.sample({}).fire')
   client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});page.click('#resume');page.wait_for_function("__mobileQA.mode==='race'")
   page.evaluate('__mobileQA.resetForTouch()')
   sizes=[(320,568),(390,844),(844,390)] if label=='mobile-portrait' else [(844,390)]
   for w,h in sizes:
    page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(220);page.wait_for_selector('#thumb-steer');controls_fit(page);screenshot(page,f'{label}-32-controls-{w}x{h}')
  else:assert not page.locator('#mobile-controls').is_visible()
  for i in range(3):
   page.evaluate(f'__mobileQA.boostPreview({i})');page.wait_for_timeout(300)
   assert page.evaluate('__mobileQA.world.boostPads.length')==3
   assert page.evaluate("__mobileQA.world.boostPads.every(p=>p.name==='road-conforming-boost'&&p.geometry.attributes.position.count>30)")
   screenshot(page,f'{label}-32-boost-{i+1}')
  assert not errors,errors
  reports.append({'viewport':label,'passed':True,'errors':errors,'touch':touch})
  browser.close()
finally:
 server.shutdown();(OUT/f'mobile-polish-{os.environ.get("FJORDSPRINT_VIEWPORT","mobile-portrait")}.json').write_text(json.dumps(reports,indent=2))
print(json.dumps(reports,indent=2))
