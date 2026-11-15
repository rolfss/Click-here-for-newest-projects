export const ROUND_CAPACITY = 2000;
export const BASE_SCORE = 1000;
export const TOTAL_BONUS = 500;
export const MAX_QUESTIONS = 40;

export class Problem extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function fail(status, code, message) {
  throw new Problem(status, code, message);
}

function field(value, label, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') fail(400, 'invalid_input', 'Skriv inn ' + label + '.');
  const cleaned = value.trim();
  if (cleaned.length > max || (required && !cleaned)) {
    fail(400, 'invalid_input', 'Sjekk ' + label + '. Feltet kan ha opptil ' + max + ' tegn.');
  }
  return cleaned;
}

export function validateQuiz(input) {
  const title = field(input.title, 'quiznavn', 90, true);
  const description = field(input.description, 'beskrivelse', 260);
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > MAX_QUESTIONS) {
    fail(400, 'invalid_input', 'En quiz må ha mellom 1 og 40 spørsmål.');
  }
  const questions = input.questions.map((question, index) => {
    const label = 'spørsmål ' + (index + 1);
    if (!question || typeof question !== 'object') fail(400, 'invalid_input', 'Sjekk ' + label + '.');
    const text = field(question.text, label, 240, true);
    const explanation = field(question.explanation, 'forklaringen til ' + label, 500);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 4) {
      fail(400, 'invalid_input', 'Velg 2–4 svaralternativer for ' + label + '.');
    }
    const options = question.options.map(option => field(option, 'svaralternativene til ' + label, 140, true));
    if (new Set(options.map(option => option.normalize('NFKC').toLocaleLowerCase('nb-NO'))).size !== options.length) {
      fail(400, 'invalid_input', 'Svaralternativene til ' + label + ' må være ulike.');
    }
    if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct >= options.length) {
      fail(400, 'invalid_input', 'Velg riktig svar for ' + label + '.');
    }
    if (!Number.isInteger(question.seconds) || question.seconds < 5 || question.seconds > 120) {
      fail(400, 'invalid_input', 'Velg 5–120 sekunder for ' + label + '.');
    }
    return { text, options, correct: question.correct, seconds: question.seconds, explanation };
  });
  return { title, description, questions };
}

const osloWall = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function osloTime(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(value)) {
    fail(400, 'invalid_time', 'Velg en gyldig dato og et klokkeslett i Oslo-tid.');
  }
  const wall = Date.parse(value + ':00Z');
  if (!Number.isFinite(wall)) fail(400, 'invalid_time', 'Velg en gyldig dato og et klokkeslett.');
  const matches = [60, 120].map(minutes => wall - minutes * 60_000)
    .filter(candidate => osloWall.format(candidate).replace(' ', 'T') === value);
  if (matches.length !== 1) {
    fail(400, 'invalid_time', 'Klokkeslettet finnes ikke eller forekommer to ganger i Oslo. Velg et annet tidspunkt.');
  }
  return matches[0];
}

export function roundStatus(round, now) {
  if (round.closed_at !== null || (round.closes_at !== null && now >= round.closes_at)) return 'closed';
  return now < round.opens_at ? 'scheduled' : 'open';
}

export function requireOpen(round, now) {
  const status = roundStatus(round, now);
  if (status === 'scheduled') fail(409, 'round_scheduled', 'Runden har ikke åpnet ennå.');
  if (status === 'closed') fail(409, 'round_closed', 'Runden er avsluttet.');
}

export function validateRound(input, now) {
  const start = osloTime(input.opensAt);
  const close = osloTime(input.closesAt);
  if (close !== null && close <= Math.max(start ?? now, now)) {
    fail(400, 'invalid_time', 'Fristen må ligge i fremtiden og etter åpningstidspunktet.');
  }
  if (!['immediate', 'after_close'].includes(input.feedbackMode) ||
      !['always', 'after_close', 'hidden'].includes(input.boardMode)) {
    fail(400, 'invalid_input', 'Velg når fasit og toppliste skal vises.');
  }
  return { open: start ?? now, close, feedback: input.feedbackMode, board: input.boardMode };
}

export function nickname(value) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._\-]{1,23}$/u.test(name)) {
    fail(400, 'invalid_nickname', 'Bruk 2–24 tegn. Start med en bokstav eller et tall.');
  }
  return { name, key: name.toLocaleLowerCase('nb-NO') };
}

export function scoreAnswer(correct, index, count, elapsed, window) {
  if (!correct) return 0;
  // The integer allocations add up to exactly TOTAL_BONUS across the round.
  const budget = Math.floor(TOTAL_BONUS * (index + 1) / count) - Math.floor(TOTAL_BONUS * index / count);
  return BASE_SCORE + Math.floor(budget * Math.max(0, window - elapsed) / window);
}

export function shuffleOptions(count) {
  const order = Array.from({ length: count }, (_, index) => index);
  const random = crypto.getRandomValues(new Uint32Array(count));
  for (let index = count - 1; index > 0; index--) {
    const swap = Math.floor(random[index] / 2 ** 32 * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

export function visibleRound(round, now, count) {
  const status = roundStatus(round, now);
  return {
    code: round.code, title: round.title, description: round.description, questionCount: count,
    status, opensAt: round.opens_at, closesAt: round.closed_at ?? round.closes_at,
    boardVisible: round.board_mode === 'always' || (round.board_mode === 'after_close' && status === 'closed'),
    feedbackMode: round.feedback_mode, boardMode: round.board_mode, serverNow: now,
  };
}
