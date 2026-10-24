"""Phone UI regression checks. Game-state hooks are injected by this test only."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import json, os, traceback
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/screenshots';OUT.mkdir(exist_ok=True)
HOOKS="""
window.__phoneQA={get mode(){return mode;},get quiz(){return quizState;},get car(){return car;},get mobile(){return mobile;},get settings(){return settings;},toMenu,openQuiz,answerQuiz,
stop(){raceSettings.mobileHelp=false;raceSettings.autogas=false;car.speed=0;keys={};touch={};},
openReading(){raceSettings.mobileHelp=true;openQuiz(1);},
finish(){Object.assign(challenge,{juice:140,correct:5,cleared:8,hits:16,fired:24});Object.assign(car,{time:95,s:track.length-.01,speed:30,checkpoint:3});resetInterpolation();},
skipFlight(){finishAge=13.2;setMode('results');},speedUp(){countdown=0;}};
"""
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
reports=[];errors=[];passed=False;failure=None
url=f'http://127.0.0.1:{server.server_port}'
def shot(page,name):page.screenshot(path=str(OUT/f'phone-{name}.png'))
def fits(page,selector,minimum=44):
 e=page.locator(selector);b=e.bounding_box();assert b,selector
 s=page.viewport_size
 assert b['width']>=minimum and b['height']>=minimum,(selector,b)
 assert b['x']>=-.5 and b['y']>=-.5 and b['x']+b['width']<=s['width']+.5 and b['y']+b['height']<=s['height']+.5,(selector,b,s)
 assert e.evaluate('(e)=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),selector+' obscured'
def no_overflow(page,selector):assert page.locator(selector).evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),selector+' horizontal overflow'
def open_action(page,selector):
 if not page.locator(selector).is_visible():page.click('#phone-menu-toggle')
 page.click(selector)
try:
 with sync_playwright() as p:
  options={'headless':True,'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
  if os.environ.get('CHROMIUM_EXECUTABLE'):options['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
  browser=p.chromium.launch(**options)
  context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,device_scale_factor=1)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/main.js*',lambda route:route.fulfill(content_type='text/javascript',body=(ROOT/'dist/main.js').read_text()+HOOKS))
  try:
   page.goto(url,wait_until='networkidle');page.wait_for_selector('body.phone-ui-ready #menu:not(.hidden)',timeout=60000)
   for w,h in [(320,568),(390,844),(430,932),(568,320),(844,390),(768,1024)]:
    page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(150)
    page.locator('#menu').evaluate('(e)=>e.scrollTop=0');no_overflow(page,'#menu');fits(page,'#play-btn')
    shot(page,f'menu-{w}x{h}');reports.append({'screen':f'{w}x{h}','menu':True})
   page.set_viewport_size({'width':390,'height':844})
   open_action(page,'#leaderboard-btn');page.wait_for_selector('#modal-backdrop:not(.hidden)');no_overflow(page,'#modal');page.click('#close-modal')
   page.click('#play-btn');page.click('#mobile-help-start');page.wait_for_selector('#driver-name')
   page.set_viewport_size({'width':320,'height':330});page.wait_for_timeout(180)
   page.fill('#driver-name','Telefonpilot');page.locator('#driver-form button').scroll_into_view_if_needed()
   fits(page,'#driver-form button');no_overflow(page,'#modal');shot(page,'nickname-keyboard')
   page.set_viewport_size({'width':390,'height':844});page.click('#driver-form button');page.evaluate('__phoneQA.speedUp()')
   page.wait_for_function("__phoneQA.mode==='race'",timeout=30000);page.evaluate('__phoneQA.stop()')
   for w,h in [(320,568),(390,844),(430,932),(568,320),(844,390)]:
    page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(200)
    for selector in ['#thumb-steer','#mobile-fire','#mobile-brake','#mobile-boost','#mobile-recover','#pause-btn']:fits(page,selector)
    shot(page,f'race-{w}x{h}')
   page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(160)
   pad=page.locator('#thumb-steer').bounding_box();brake=page.locator('#mobile-brake').bounding_box();client=context.new_cdp_session(page)
   points=[{'x':pad['x']+pad['width']*.7,'y':pad['y']+pad['height']/2,'id':1},{'x':brake['x']+brake['width']/2,'y':brake['y']+brake['height']/2,'id':2}]
   client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points})
   page.wait_for_function('__phoneQA.mobile.steering>.1 && __phoneQA.mobile.sample({}).brake')
   client.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
   page.wait_for_function('__phoneQA.mobile.steering===0 && !__phoneQA.mobile.sample({}).brake')
   for w,h in [(320,568),(390,844),(568,320),(844,390)]:
    page.set_viewport_size({'width':w,'height':h});page.evaluate('__phoneQA.openReading()');page.wait_for_timeout(160)
    no_overflow(page,'#quiz');assert not page.locator('#mobile-controls').is_visible()
    for answer in page.locator('[data-answer]').all():
     answer.scroll_into_view_if_needed()
     assert answer.evaluate('(e)=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}'),'answer covered'
    page.locator('#quiz').evaluate('(e)=>e.scrollTop=0');shot(page,f'question-{w}x{h}')
    page.evaluate('__phoneQA.answerQuiz(__phoneQA.quiz.q.correct)')
    page.wait_for_function("document.querySelector('#phone-answer-feedback').textContent.startsWith('Riktig svar:')",timeout=10000)
    page.locator('#skip-quiz').scroll_into_view_if_needed();fits(page,'#skip-quiz')
    shot(page,f'answer-{w}x{h}');page.click('#skip-quiz');page.wait_for_function("__phoneQA.mode==='race'")
   page.set_viewport_size({'width':390,'height':844});page.evaluate('__phoneQA.finish()')
   page.wait_for_function("__phoneQA.mode==='finish'");page.evaluate('__phoneQA.skipFlight()');page.wait_for_timeout(200)
   for w,h in [(320,568),(390,844),(844,390)]:
    page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(160)
    page.locator('#results').evaluate('(e)=>e.scrollTop=0');no_overflow(page,'#results');shot(page,f'results-{w}x{h}')
   page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);page.locator('#results').evaluate('(e)=>e.scrollTop=0');fits(page,'#retry-btn')
   assert not page.locator('#phone-run-details').evaluate('(e)=>e.open')
   assert page.locator('.phone-board-details').count()==1
   page.click('.phone-board-details > summary');assert 'Telefonpilot' in page.locator('#result-score-rows').inner_text()
   page.click('#phone-run-details > summary');assert page.locator('#sector-results').is_visible()
   rows=page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-career-scores-v3'))")
   assert len(rows)==1 and rows[0]['expiresAt']-rows[0]['createdAt']==172800000
   assert not errors,errors
   desktop=browser.new_context(viewport={'width':1280,'height':800},has_touch=False);other=desktop.new_page()
   other.goto(url,wait_until='networkidle');other.wait_for_selector('#menu:not(.hidden)',timeout=60000)
   assert not other.locator('body').evaluate("e=>e.classList.contains('phone-ui-ready')")
   assert other.locator('#hospitals-btn').is_visible() and not other.locator('#mobile-controls').is_visible()
   shot(other,'desktop-regression');passed=True
  except Exception:
   failure=traceback.format_exc()
   try:
    shot(page,'failure')
    state=page.evaluate("({mode:__phoneQA.mode,quiz:__phoneQA.quiz,feedback:document.querySelector('#phone-answer-feedback')?.textContent})")
    (OUT/'phone-failure.json').write_text(json.dumps(state,ensure_ascii=False,indent=2))
   except Exception:pass
   raise
  finally:browser.close()
finally:
 server.shutdown();(OUT/'phone-ui-report.json').write_text(json.dumps({'viewports':reports,'errors':errors,'passed':passed,'failure':failure},indent=2))
print('Phone UI passed: six viewports, touch cancellation, reading, keyboard viewport, results, 48-hour storage and desktop.')
