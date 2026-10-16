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
  status:()=>({mode,course:track.config.id,time:car.time,s:car.s,speed:car.speed,finished:car.finished,demo:raceDemo}),
  start(index=0, demo=false, quiz=true){ toMenu(); settings.cup=false; settings.quiz=quiz; settings.assist=true; selectCourse(index); startRace(demo); mode='race'; $('#countdown').textContent=''; },
  advance(ticks=1200){ const drive=createDemoDriver(); for(let n=0;n<ticks&&['race','quiz'].includes(mode);n++){ if(mode==='quiz'){answerQuiz(quizState.q.correct);closeQuiz();} step(fixedStep,drive(car,track,raceSettings.assist)); } updateHUD(); resetInterpolation(); },
  complete(index=0, demo=false, quiz=true){ this.start(index,demo,quiz);this.advance(60000);if(!car.finished)throw new Error('Testdriver failed to finish '+track.config.id);finishAge=3;setMode('results');return this.status(); },
  freeze(){director.update(car,track,'race',1,true);mode='paused';updateHUD();},
  menu:toMenu
};
'''

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
        for mobile in [False, True]:
            context = browser.new_context(viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 960}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1, reduced_motion='reduce')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            def intercept(route):
                response = route.fetch()
                route.fulfill(response=response, body=response.text() + HARNESS)
            page.route('**/main.js', intercept)
            context.add_init_script("if(!localStorage.getItem('fjordsprint-v1'))localStorage.setItem('fjordsprint-v1',JSON.stringify({seenHelp:true,settings:{quality:'low',motion:false,volume:0,music:false}}));")
            page.goto(BASE, wait_until='networkidle')
            page.wait_for_selector('#menu:not(.hidden)', timeout=60000)
            prefix = 'mobile' if mobile else 'desktop'
            page.screenshot(path=str(OUT / f'{prefix}-menu.png'), full_page=True)
            assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2'), 'Horizontal overflow on menu'
            page.locator('#leaderboard-btn').click()
            assert page.locator('#leaderboard-rows').inner_text().startswith('Ingen resultater'), 'Board must start empty'
            assert 'Ikke delt' in page.locator('#board-state').inner_text()
            page.locator('#close-modal').click()
            page.locator('#play-btn').click()
            page.wait_for_function("__rallyTest.status().mode === 'race'", timeout=30000)
            if mobile:
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
            # A repeated completed demo must never offer or add a score.
            page.evaluate('__rallyTest.complete(0,true,true)')
            assert page.locator('#driver-name').count() == 0, 'Demo must not offer score entry'
            assert page.evaluate("JSON.parse(localStorage.getItem('fjordsprint-scores-v2')).length") == count
            if not mobile:
                for index in [1,2]:
                    run = page.evaluate(f'__rallyTest.complete({index},false,true)')
                    assert run['finished'], f'Course {index} failed in browser'
                    results.append({'course':run['course'], 'time':run['time'], 'completed':True})
            page.reload(wait_until='networkidle')
            page.wait_for_selector('#menu:not(.hidden)', timeout=60000)
            page.locator('#leaderboard-btn').click()
            assert 'Rolf' in page.locator('#leaderboard-rows').inner_text(), 'Result lost on reload'
            page.screenshot(path=str(OUT / f'{prefix}-leaderboard.png'), full_page=True)
            # Expiry is checked on next access; force an expired persisted row and reopen.
            page.evaluate("let rows=JSON.parse(localStorage.getItem('fjordsprint-scores-v2'));rows[0].createdAt=Date.now()-259200001;rows[0].expiresAt=rows[0].createdAt+259200000;localStorage.setItem('fjordsprint-scores-v2',JSON.stringify(rows));")
            page.locator('#board-refresh').click()
            assert 'Ingen resultater' in page.locator('#leaderboard-rows').inner_text(), 'Expired result remained visible'
            assert not errors, json.dumps(errors)
            results.append({'viewport':prefix,'nameEntry':True,'reloadPersistence':True,'expiredRowRemoved':True,'demoExcluded':True,'pageErrors':errors})
            context.close()
        browser.close()
    (OUT/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results, ensure_ascii=False, indent=2))
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
