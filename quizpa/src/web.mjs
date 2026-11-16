import shell from '../public/index.html';
import css from '../public/site.css';
import shared from '../public/shared.js';
import join from '../public/join.js';
import play from '../public/play.js';
import admin from '../public/admin.js';
import { noStore } from './support.mjs';

const assets = {
  '/assets/site.css': [css, 'text/css; charset=utf-8'],
  '/assets/shared.js': [shared, 'text/javascript; charset=utf-8'],
  '/assets/join.js': [join, 'text/javascript; charset=utf-8'],
  '/assets/play.js': [play, 'text/javascript; charset=utf-8'],
  '/assets/admin.js': [admin, 'text/javascript; charset=utf-8'],
};

const pageHeaders = {
  ...noStore,
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
};

const landing = '<section class="hero">' +
  '<div class="hero-copy"><h1>Quiz på<br>din tid<span>.</span></h1>' +
  '<p>Quizpå fungerer omtrent som Kahoot. Du får ett spørsmål om gangen og spiller når det passer for deg.</p>' +
  '<div class="hero-actions"><a class="btn primary" href="/bli-med">Bli med med spillkode <span aria-hidden="true">→</span></a>' +
  '<a class="btn secondary" href="/spill/demo">Prøv demoen</a></div></div>' +
  '<div class="hero-art" aria-hidden="true"><div class="quiz-orbit orbit-one"></div><div class="quiz-orbit orbit-two"></div>' +
  '<div class="art-card art-back"></div><div class="art-card art-mid"></div><div class="art-card art-front">' +
  '<div class="art-top"><span class="art-line"></span><span class="art-clock"></span></div>' +
  '<div class="art-question">?</div><div class="art-answers"><i></i><i></i><i></i><i></i></div>' +
  '</div><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✦</span></div></section>' +
  '<section class="panel start-guide" aria-labelledby="start-guide-title"><h2 id="start-guide-title">Slik spiller du</h2>' +
  '<ol><li>Åpne lenken du fikk i Teams, skann QR-koden med mobilkameraet eller skriv inn spillkoden.</li>' +
  '<li>Velg et kallenavn. Deltakerne ser dette navnet hvis arrangøren viser topplisten.</li>' +
  '<li>Trykk på et svar før tiden går ut. Riktige svar gir poeng. Raske svar gir bonus.</li></ol>' +
  '<p>Skal du lage en quiz? <a href="/arrangor">Gå til arrangørsiden</a>.</p></section>';

const joinPage = '<section class="panel full intro"><h1>Bli med på quiz</h1>' +
  '<p>Skriv inn de åtte sifrene du har fått av arrangøren, og trykk <strong>Finn quizen</strong>. Deretter velger du et kallenavn.</p>' +
  '<form class="form" data-join><label>Spillkode<input class="join-pin" name="code" type="text" ' +
  'inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" maxlength="11" required aria-describedby="join-code-help"></label>' +
  '<div class="actions"><button class="btn primary" type="submit">Finn quizen <span aria-hidden="true">→</span></button></div>' +
  '</form><p class="message" data-message role="status"></p>' +
  '<p class="help" id="join-code-help">Spillkoden byttes hvert andre minutt. Be arrangøren om den nyeste koden hvis din har utløpt. Har du en quizlenke eller QR-kode, kan du åpne den direkte.</p></section>';

export function web(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const body = value => request.method === 'HEAD' ? null : value;
  const asset = assets[url.pathname];
  if (asset) {
    return new Response(body(asset[0]), { headers: {
      ...noStore, 'Cache-Control': 'public, max-age=300', 'Content-Type': asset[1],
    } });
  }
  if (url.pathname === '/robots.txt') {
    return new Response(body('User-agent: *\nDisallow: /\n'), { headers: { 'Content-Type': 'text/plain' } });
  }
  if (url.pathname.endsWith('.ico')) return new Response(null, { status: 404 });
  let title = 'Quizpå – Quiz på din tid';
  let cssClass = 'home';
  let script = '';
  let content = landing;
  let status = 200;
  if (/^\/spill\/(?:[a-f0-9]{32}|demo)\/?$/.test(url.pathname) || /^\/arrangor\/?$/.test(url.pathname)) {
    const adminPage = url.pathname.startsWith('/arrangor');
    title = adminPage ? 'Arrangør – Quizpå' : 'Spill quiz – Quizpå';
    cssClass = adminPage ? 'admin-page wrap' : 'game-page wrap';
    script = '<script type="module" src="/assets/' + (adminPage ? 'admin' : 'play') + '.js?v=3"></script>';
    content = '<div class="panel full"><p role="status">Laster …</p></div>';
  } else if (/^\/bli-med\/?$/.test(url.pathname)) {
    title = 'Bli med – Quizpå';
    cssClass = 'join-page wrap';
    content = joinPage;
    script = '<script type="module" src="/assets/join.js?v=3"></script>';
  } else if (url.pathname !== '/') {
    title = 'Siden finnes ikke – Quizpå';
    cssClass = 'game-page wrap';
    content = '<div class="panel full"><h1>Siden finnes ikke</h1><p>Sjekk quizen sin invitasjonslenke.</p><a class="btn primary" href="/">Til forsiden</a></div>';
    status = 404;
  }
  const html = shell.replaceAll('__TITLE__', title).replace('__CLASS__', cssClass)
    .replace('__SCRIPT__', script).replace('__CONTENT__', content);
  return new Response(body(html), { status, headers: pageHeaders });
}
