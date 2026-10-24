/** Phone presentation only. Racing, question rewards and score storage stay unchanged. */
function mountPhoneUI() {
  if (!document.body.classList.contains('mobile-ui') || document.body.classList.contains('phone-ui-ready')) return;
  const $ = selector => document.querySelector(selector);
  const menu = $('#menu'), actions = $('.top-actions'), quiz = $('#quiz');
  if (!menu || !actions || !quiz || !$('#mobile-help-toggle')) return;
  document.body.classList.add('phone-ui-ready');

  // Keep the primary action above the fold; preserve every secondary action.
  const toggle = document.createElement('button');
  toggle.id = 'phone-menu-toggle'; toggle.className = 'secondary';
  toggle.type = 'button'; toggle.textContent = 'Meny';
  actions.id = 'phone-menu-actions';
  toggle.setAttribute('aria-controls', actions.id);
  toggle.setAttribute('aria-expanded', 'false');
  $('.topbar').insertBefore(toggle, actions);
  function closeMenu() { if (menu.classList.contains('phone-menu-open')) menu.classList.remove('phone-menu-open'); toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('phone-menu-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  actions.addEventListener('click', event => { if (event.target.closest('button')) closeMenu(); });
  toggle.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  actions.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeMenu(); toggle.focus(); }
  });

  // A visible viewport shrinks when the phone keyboard opens. Do not disable zoom.
  let viewportFrame = 0;
  function fitViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      // Pinch-zoom must remain browser-controlled, not resize the UI underneath it.
      if (viewport && Math.abs(viewport.scale - 1) > .05) return;
      document.documentElement.style.setProperty('--phone-visible-height', `${viewport?.height || innerHeight}px`);
      document.documentElement.style.setProperty('--phone-visible-top', `${viewport?.offsetTop || 0}px`);
    });
  }
  window.visualViewport?.addEventListener('resize', fitViewport);
  window.visualViewport?.addEventListener('scroll', fitViewport);
  addEventListener('resize', fitViewport);
  fitViewport();

  // Put continuation after the answer, not in tiny text above the question.
  const next = $('#skip-quiz'), heading = $('#quiz-question'), explanation = $('#quiz-explanation');
  quiz.append(next);
  heading.tabIndex = -1;
  quiz.setAttribute('role', 'dialog'); quiz.setAttribute('aria-modal', 'true');
  quiz.setAttribute('aria-labelledby', 'quiz-question');
  const feedback = document.createElement('p');
  feedback.id = 'phone-answer-feedback'; feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite'); feedback.setAttribute('aria-atomic', 'true');
  explanation.before(feedback);
  let quizOpen = false, answered = false, questionText = '', quizFrame = 0;
  function syncQuiz() {
    const open = !quiz.classList.contains('hidden');
    const changed = heading.textContent !== questionText;
    const correct = quiz.querySelector('[data-answer].correct');
    if (open && (!quizOpen || changed)) {
      questionText = heading.textContent; answered = false; feedback.textContent = '';
      quiz.scrollTop = 0; heading.focus({ preventScroll: true });
    }
    quiz.classList.toggle('phone-answered', !!correct);
    if (open && correct && !answered) {
      const answerText = correct.textContent.replace(/^\s*[123]\s*/, '').trim();
      feedback.textContent = `Riktig svar: ${answerText}`;
      next.focus({ preventScroll: true });
      // Reveal feedback as well as the continuation button, including short screens.
      feedback.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      answered = true;
    }
    quizOpen = open;
  }
  const quizObserver = new MutationObserver(() => {
    cancelAnimationFrame(quizFrame); quizFrame = requestAnimationFrame(syncQuiz);
  });
  quizObserver.observe(quiz, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  quiz.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...quiz.querySelectorAll('button:not(:disabled)')].filter(b => b.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });

  // Results: show the reward and replay before the detailed statistics.
  const result = $('.results-inner');
  const details = document.createElement('details'); details.id = 'phone-run-details';
  const summary = document.createElement('summary'); summary.textContent = 'Løpsdetaljer og medaljer';
  details.append(summary);
  for (const id of ['result-stats', 'medal-targets', 'run-badges', 'sector-results', 'result-progression']) {
    const element = document.getElementById(id); if (element) details.append(element);
  }
  result.insertBefore(details, $('#review-btn'));
  const score = $('#score-entry');
  function compactScore() {
    const table = score.querySelector(':scope > .table-scroll');
    if (!table) return;
    const board = document.createElement('details'); board.className = 'phone-board-details';
    const label = document.createElement('summary'); label.textContent = 'Poengtavle på denne enheten';
    board.append(label); table.before(board); board.append(table);
    const breakdown = score.querySelector(':scope > .score-breakdown');
    if (breakdown) board.append(breakdown);
    const fullBoard = score.querySelector('#result-leaderboard');
    if (fullBoard) board.append(fullBoard);
  }
  new MutationObserver(compactScore).observe(score, { childList: true });
  new MutationObserver(() => {
    if (!$('#results').classList.contains('hidden')) {
      $('#results').scrollTop = 0; details.open = false;
      $('#retry-btn').focus({ preventScroll: true });
    }
  }).observe($('#results'), { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { if (menu.classList.contains('hidden')) closeMenu(); })
    .observe(menu, { attributes: true, attributeFilter: ['class'] });
  compactScore();
}

// main.js builds the touch controls after loading the local game assets.
// Observe that mount once; never poll or touch the physics animation loop.
if (document.getElementById('mobile-help-toggle')) mountPhoneUI();
else {
  const ready = new MutationObserver(() => {
    if (document.getElementById('mobile-help-toggle')) {
      ready.disconnect(); requestAnimationFrame(mountPhoneUI);
    }
  });
  ready.observe(document.body, { childList: true, subtree: true });
}
