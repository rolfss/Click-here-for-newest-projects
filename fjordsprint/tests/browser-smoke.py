"""Real Chromium/WebGL smoke tests. Only the test server receives QA hooks.
Run from fjordsprint: python3 tests/browser-smoke.py (Playwright installed).
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
import json
import os

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'screenshots'
OUT.mkdir(exist_ok=True)
HOOKS = """
window.__qa={get car(){return car;},get game(){return challenge;},get mode(){return mode;},get quiz(){return quizState;},get track(){return track;},get world(){return world;},get settings(){return settings;},setCar(v){Object.assign(car,v);resetInterpolation();},setAge(v){finishAge=v;},selectCourse,toMenu,openQuiz,answerQuiz};
"""
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
reports=[]
try:
    with sync_playwright() as p:
        args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']
        launch={'headless':True,'args':args}
        if os.environ.get('CHROMIUM_EXECUTABLE'):launch['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
        browser=p.chromium.launch(**launch)
        for label,w,h,touch in [('desktop',1440,900,False),('mobile-portrait',390,844,True),('mobile-landscape',844,390,True)]:
            ctx=browser.new_context(viewport={'width':w,'height':h},has_touch=touch,device_scale_factor=1)
            page=ctx.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.route('**/main.js*',lambda route:route.fulfill(content_type='application/javascript',body=(ROOT/'dist/main.js').read_text()+HOOKS))
            page.goto(url,wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)',timeout=60000)
            assert page.evaluate('__qa.world.renderer.info.render.calls')>0
            page.screenshot(path=str(OUT/f'{label}-menu.png'))
            # SwiftShader can render much slower than real hardware. Test input
            # against simulation state, not a short wall-clock sleep.
            page.evaluate("__qa.world.setQuality('low')")
            page.click('#play-btn');page.click('#help-start');page.wait_for_selector('#driver-name')
            assert page.evaluate('__qa.mode')=='menu'
            page.fill('#driver-name','<img>');page.click('#driver-form button');assert page.locator('#driver-error').inner_text()
            page.fill('#driver-name','Rolf Test');page.click('#driver-form button')
            page.wait_for_function("__qa.mode==='race'",timeout=15000)
            page.keyboard.down('KeyW');page.wait_for_timeout(900);page.keyboard.up('KeyW');assert page.evaluate('__qa.car.speed')>0
            page.evaluate("()=>{let t=__qa.game.trolls[0];__qa.setCar({s:t.s-65,x:0,heading:0,speed:0});t.phase='active';t.x=0;t.targetX=0;t.age=2;__qa.world.cameraInitialized=false;}")
            page.wait_for_timeout(500);page.screenshot(path=str(OUT/f'{label}-troll.png'))
            if touch:
                box=page.locator('[data-drive=fire]').bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.wait_for_function('__qa.game.cleared>=1',timeout=45000);page.mouse.up()
            else:
                page.keyboard.down('KeyE');page.wait_for_function('__qa.game.cleared>=1',timeout=45000);page.keyboard.up('KeyE')
            assert page.evaluate('__qa.game.cleared')>=1
            page.evaluate('__qa.openQuiz(1)');before=page.evaluate('__qa.car.time');page.wait_for_timeout(400);assert page.evaluate('__qa.car.time')==before
            page.screenshot(path=str(OUT/f'{label}-quiz.png'))
            page.evaluate('__qa.answerQuiz(__qa.quiz.q.correct)');page.click('#skip-quiz');page.wait_for_timeout(300)
            assert page.evaluate('__qa.game.correct')==1
            page.evaluate("()=>{Object.assign(__qa.game,{juice:140,correct:5,cleared:8,hits:16,fired:24});__qa.setCar({time:95,s:__qa.track.length-.01,speed:30,checkpoint:3});}")
            page.wait_for_function("__qa.mode==='finish'")
            page.wait_for_timeout(550);page.screenshot(path=str(OUT/f'{label}-rocket-dock.png'))
            page.evaluate('__qa.setAge(6);__qa.world.cameraInitialized=false');page.wait_for_timeout(350);page.screenshot(path=str(OUT/f'{label}-rocket.png'))
            page.evaluate('__qa.setAge(11.8);__qa.world.cameraInitialized=false')
            page.wait_for_function("document.querySelectorAll('.career-rung.reached').length===6")
            page.wait_for_timeout(600);page.screenshot(path=str(OUT/f'{label}-rocket-top.png'))
            page.click('#skip-rocket');page.wait_for_timeout(200)
            assert 'Toppleder' in page.locator('#score-entry').inner_text()
            assert 'Rolf Test' in page.locator('#result-score-rows').inner_text()
            page.screenshot(path=str(OUT/f'{label}-results.png'))
            rows=page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-career-scores-v3'))")
            assert len(rows)==1 and rows[0]['expiresAt']-rows[0]['createdAt']==172800000
            for i in [1,2]:
                page.evaluate(f'()=>{{__qa.toMenu();__qa.settings.cup=false;__qa.selectCourse({i});}}');page.wait_for_timeout(100)
                assert page.evaluate('__qa.world.renderer.info.render.calls')>0
            page.reload(wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)')
            page.click('#leaderboard-btn');assert 'Rolf Test' in page.locator('#leaderboard-rows').inner_text()
            ctx.add_init_script('const originalNow=Date.now;Date.now=()=>originalNow()+172800001;')
            page.reload(wait_until='networkidle');page.wait_for_selector('#menu:not(.hidden)');page.click('#leaderboard-btn')
            assert 'Ingen aktive resultater' in page.locator('#leaderboard-rows').inner_text()
            assert page.evaluate("localStorage.getItem('fjordsprint-career-scores-v3')")=='[]'
            assert not errors,errors
            reports.append({'viewport':label,'errors':errors,'passed':True})
            ctx.close()
        browser.close()
finally:
    server.shutdown()
    (OUT/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
print(json.dumps(reports,ensure_ascii=False,indent=2))
