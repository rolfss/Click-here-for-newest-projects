import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FAGDAG_PLAYWRIGHT);
const dir = new URL('../fagdagen-web-2026/asset-pack/', import.meta.url);
const parts = (await readdir(dir)).filter(name => /^\d{3}\.b64$/.test(name)).sort();
const packed = (await Promise.all(parts.map(name => readFile(new URL(name, dir), 'utf8')))).join('');
const files = JSON.parse(gunzipSync(Buffer.from(packed, 'base64')).toString('utf8'));
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(path.endsWith('/status') ? { state: 'open', active: true } : { rows: [] }));
    return;
  }
  const name = path === '/' ? 'index.html' : path.slice(1);
  const file = files[name];
  response.writeHead(file ? 200 : 404, { 'Content-Type': types[name.split('.').at(-1)] ?? 'application/octet-stream' });
  response.end(file ? Buffer.from(file, 'base64') : '');
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAGklEQVR4nGNk2L2KgRTARJJqhlENxAGSgxUAdOEBd60s2vAAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type=file]').setInputFiles(['first', 'second'].map(name => ({ name: name + '.png', mimeType: 'image/png', buffer: pixel })));
  const slide = page.locator('.presentation-content > img');
  await slide.waitFor({ state: 'visible' });
  const visible = ['.screen-head', '#quiz-test', '.presentation-controls', '.presentation-toggle'];
  for (const selector of visible) assert(await page.locator(selector).isVisible(), `${selector} should be visible before fullscreen`);
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
  for (const selector of visible) assert.equal(await page.locator(selector).isVisible(), false, `${selector} in fullscreen`);
  for (const selector of ['#fjord', '#quiz', '#quiz-qr', '#presentation', '.presentation-content > img']) {
    assert(await page.locator(selector).isVisible(), `${selector} missing in fullscreen`);
  }
  const [game, quiz, deck] = await Promise.all(['#fjord', '#quiz', '#presentation'].map(selector => page.locator(selector).boundingBox()));
  assert(game.x === quiz.x && game.y < quiz.y && deck.x > game.x, 'Scores should stack to the left of the presentation');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => document.fullscreenElement === null);
  for (const selector of visible) assert(await page.locator(selector).isVisible(), `${selector} should return`);
  assert(await slide.isVisible(), 'The loaded slide should remain visible after exiting');
  console.log('Chromium: audience fullscreen hides controls, preserves both boards and slides, and restores the controls on exit.');
} finally {
  await browser.close();
  server.close();
}

