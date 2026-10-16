"""Browser integration and screenshots. Test harness is injected into responses only.
Install: pip install playwright==1.57.0 && python -m playwright install chromium
Run from fjordsprint/: python tests/browser-smoke.py
"""
from pathlib import Path
import json
import subprocess
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'qa'
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:4173'
HARNESS = r'''
// Test-only instrumentation. This text is not part of the published main.js.
globalThis.__rallyTest = {
  status:()=>({mode,course:track.config.id,time:car.time,s:car.s,speed:car.speed,finished:car.finished,demo:raceDemo,countdown,fps:1/frameAverage}),
  start(index=0, demo=false, quiz=true){ toMenu(); settings.cup=false; settings.quiz=quiz; settings.assist=true; selectCourse(index); startRace(demo); mode='race'; $('#countdown').textContent=''; },
  advance(ticks=1200){ const drive=createDemoDriver(); for(let n=0;n<ticks&&['race','quiz'].includes(mode);n++){ if(mode==='quiz'){answerQuiz(quizState.q.correct);closeQuiz();} step(fixedStep,drive(car,track,raceSettings.assist)); } updateHUD(); resetInterpolation(); },
  complete(index=0, demo=false, quiz=true){ this.start(index,demo,quiz);this.advance(60000);if(!car.finished)throw new Error('Testdriver failed to finish '+track.config.id);finishAge=3;setMode('results');return this.status(); },
  freeze(){world.cameraInitialized=false;director.update(car,track,'race',1,true);mode='paused';updateHUD();},
  menu:toMenu
};
'''

def exercise(page, mobile, errors):
    prefix = ('mobile-landscape' if page.viewport_size['width'] > page.viewport_size['height'] else 'mobile') if mobile else 'desktop'
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_selector('#menu:not(.hidden)', timeout=60000)
    page.screenshot(path=str(OUT / f'{prefix}-menu.png'), full_page=True)
    assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2'), 'Horizontal overflow on menu'
    page.locator('#leaderboard-btn').click()
    assert page.locator('#leaderboard-rows').inner_text().startswith('Ingen resultater'), 'Board must start empty'
    assert 'Ikke delt' in page.locator('#board-state').inner_text()
    page.locator('#close-modal').click()
    page.locator('#play-btn').click()
    print(prefix, 'after start:', page.evaluate('__rallyTest.status()'), flush=True)
    page.wait_for_function("['race','paused'].includes(__rallyTest.status().mode)", timeout=30000)
    assert page.evaluate('__rallyTest.status().mode') == 'race', 'Unexpected automatic pause at race start'
    if mobile:
        assert page.locator('#touch-controls button').evaluate_all('(buttons)=>buttons.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})'), 'Touch control outside viewport'
        gas = page.locator('[data-drive=throttle]')
        box = gas.bounding_box()
        page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
        page.mouse.down()
    else:
        page.keyboard.down('w')
    page.wait_for_timeout(400)
    assert page.evaluate('__rallyTest.status().speed') > 0, 'Keyboard/touch throttle did not move car'
    if mobile:
        page.mouse.up()
    else:
        page.keyboard.up('w')
    page.locator('#pause-btn').click()
    assert page.evaluate('__rallyTest.status().mode') == 'paused'
    page.locator('#resume').click()
    page.evaluate('__rallyTest.advance(1000);__rallyTest.freeze()')
    page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / f'{prefix}-race.png'))
    completed = page.evaluate('__rallyTest.complete(0,false,true)')
    assert completed['finished'] and completed['mode'] == 'results'
    page.locator('#driver-name').fill('')
    page.locator('#driver-name').press_sequentially('Rolf', delay=40)
    assert page.evaluate('__rallyTest.status().mode') == 'results', 'Typing R restarted race'
    assert page.locator('#driver-name').input_value() == 'Rolf'
    page.screenshot(path=str(OUT / f'{prefix}-results.png'), full_page=True)
    page.locator('#score-form button[type=submit]').click()
    assert 'lagret' in page.locator('#score-feedback').inner_text().lower()
    count = page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-scores-v2')).length")
    assert count == 1, 'Exactly one local result should be saved'
    page.evaluate('__rallyTest.complete(0,true,true)')
    assert not page.locator('#driver-name').is_visible(), 'Demo must not offer score entry'
    assert page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-scores-v2')).length") == count
    rows = []
    if not mobile:
        for index in [1,2]:
            run = page.evaluate(f'__rallyTest.complete({index},false,true)')
            assert run['finished'], f'Course {index} failed in browser'
            rows.append({'course':run['course'], 'time':run['time'], 'completed':True})
    page.reload(wait_until='networkidle')
    page.wait_for_selector('#menu:not(.hidden)', timeout=60000)
    page.locator('#leaderboard-btn').click()
    assert 'Rolf' in page.locator('#leaderboard-rows').inner_text(), 'Result lost on reload'
    page.screenshot(path=str(OUT / f'{prefix}-leaderboard.png'), full_page=True)
    page.evaluate("let rows=JSON.parse(localStorage.getItem('fjordsprint-scores-v2'));rows[0].createdAt=Date.now()-259200001;rows[0].expiresAt=rows[0].createdAt+259200000;localStorage.setItem('fjordsprint-scores-v2',JSON.stringify(rows));")
    page.locator('#board-refresh').click()
    assert 'Ingen resultater' in page.locator('#leaderboard-rows').inner_text(), 'Expired result remained visible'
    assert not errors, json.dumps(errors)
    rows.append({'viewport':prefix,'nameEntry':True,'reloadPersistence':True,'expiredRowRemoved':True,'demoExcluded':True,'pageErrors':errors})
    return rows

server = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
try:
    for _ in range(100):
        try:
            if urlopen(BASE, timeout=1).status == 200:
                break
        except Exception:
            time.sleep(.1)
    else:
        raise RuntimeError('Local test server failed to start')
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for mobile, width, height in [(False, 1440, 960), (True, 390, 844), (True, 844, 390)]:
            context = browser.new_context(viewport={'width':width,'height':height}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1, reduced_motion='reduce')
            page = context.new_page()
            errors = []
            def on_error(error):
                errors.append(str(error))
                print('PAGE ERROR:',str(error),flush=True)
            page.on('pageerror',on_error)
            def intercept(route):
                response = route.fetch()
                route.fulfill(response=response,body=response.text()+HARNESS)
            page.route('**/main.js',intercept)
            context.add_init_script("if(!localStorage.getItem('fjordsprint-v1'))localStorage.setItem('fjordsprint-v1',JSON.stringify({seenHelp:true,settings:{quality:'low',motion:false,volume:0,music:false}}));")
            try:
                results.extend(exercise(page,mobile,errors))
            except Exception as error:
                prefix = ('mobile-landscape' if page.viewport_size['width'] > page.viewport_size['height'] else 'mobile') if mobile else 'desktop'
                diagnostic = {'error':str(error),'pageErrors':errors,'status':page.evaluate('globalThis.__rallyTest?.status()'),'body':page.locator('body').inner_text()}
                print(json.dumps(diagnostic,ensure_ascii=False,indent=2),flush=True)
                (OUT/f'{prefix}-failure.json').write_text(json.dumps(diagnostic,ensure_ascii=False,indent=2))
                page.screenshot(path=str(OUT/f'{prefix}-failure.png'),full_page=True)
                raise
            finally:
                context.close()
        browser.close()
    (OUT/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
