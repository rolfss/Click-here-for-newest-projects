import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateQuestionPack } from './question-pack.mjs';

function pack() {
  return {
    sources: [{ id: 'guide', title: 'Eksempelveileder', url: 'https://example.org/guide' }],
    questions: [{ id: 'q1', question: 'Velg første alternativ.', options: ['Første', 'Andre'],
      correct: 0, explanation: 'Første alternativ er etterspurt.', source: 'guide' }],
  };
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child);
  }
  return value;
}

const codes = value => validateQuestionPack(value).issues.map(issue => issue.code);

test('accepts the documented synthetic example', async () => {
  const example = JSON.parse(await readFile(new URL('./examples/example-pack.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateQuestionPack(example), { valid: true, issues: [] });
});

test('does not mutate valid or invalid deeply frozen input', () => {
  const valid = deepFreeze(pack());
  const before = JSON.stringify(valid);
  assert.equal(validateQuestionPack(valid).valid, true);
  assert.equal(JSON.stringify(valid), before);
  const invalid = pack();
  invalid.questions[0].options[1] = null;
  deepFreeze(invalid);
  const invalidBefore = JSON.stringify(invalid);
  assert.equal(validateQuestionPack(invalid).valid, false);
  assert.equal(JSON.stringify(invalid), invalidBefore);
});

test('returns a root issue for invalid envelope values', () => {
  for (const value of [null, undefined, [], '', 7, false]) {
    assert.deepEqual(validateQuestionPack(value).issues[0], {
      code: 'invalid_pack', path: '$', row: null, message: 'Spørsmålspakken må være et objekt.',
    });
  }
});

test('reports missing, wrong-type and empty collections', () => {
  assert.deepEqual(codes({}), ['invalid_sources', 'invalid_questions']);
  assert.deepEqual(codes({ sources: {}, questions: 'bad' }), ['invalid_sources', 'invalid_questions']);
  assert.deepEqual(codes({ sources: [], questions: [] }), ['empty_sources', 'empty_questions']);
});

test('handles null, primitive and array rows without throwing', () => {
  const input = pack();
  input.sources.push(null, 9, []);
  input.questions.push(null, 'bad', []);
  const result = validateQuestionPack(input);
  assert.equal(result.valid, false);
  assert.equal(result.issues.filter(issue => issue.code === 'invalid_source').length, 3);
  assert.equal(result.issues.filter(issue => issue.code === 'invalid_question').length, 3);
});

test('detects duplicate question IDs and identifies the second row', () => {
  const input = pack();
  input.questions.push({ ...input.questions[0] });
  const issue = validateQuestionPack(input).issues.find(item => item.code === 'duplicate_question_id');
  assert.equal(issue.path, 'questions[1].id');
  assert.equal(issue.row, 2);
});

test('duplicate source IDs make a reference ambiguous', () => {
  const input = pack();
  input.sources.push({ ...input.sources[0], title: 'En annen veileder' });
  assert.ok(codes(input).includes('duplicate_source_id'));
  assert.ok(codes(input).includes('ambiguous_source'));
});

test('IDs and source references are exact and case-sensitive', () => {
  const input = pack();
  input.questions[0].source = 'Guide';
  assert.ok(codes(input).includes('unknown_source'));
  input.questions[0].source = ' guide ';
  assert.ok(codes(input).includes('unknown_source'));
});

test('rejects absent and non-string IDs, text, explanations and source references', () => {
  const input = pack();
  input.sources[0].id = '';
  input.sources[0].title = '  ';
  Object.assign(input.questions[0], { id: 5, question: '\n', explanation: {}, source: null });
  const actual = codes(input);
  for (const code of ['invalid_source_id', 'invalid_source_title', 'invalid_question_id',
    'invalid_question_text', 'invalid_explanation', 'invalid_source_reference']) {
    assert.ok(actual.includes(code), code);
  }
});

test('requires at least two nonempty string options and points to the bad option', () => {
  const input = pack();
  input.questions[0].options = ['One'];
  assert.ok(codes(input).includes('too_few_options'));
  input.questions[0].options = ['One', null, {}, '   '];
  const errors = validateQuestionPack(input).issues.filter(issue => issue.code === 'invalid_option');
  assert.deepEqual(errors.map(issue => issue.path), [
    'questions[0].options[1]', 'questions[0].options[2]', 'questions[0].options[3]',
  ]);
});

test('handles missing, non-array and sparse option lists', () => {
  for (const options of [undefined, null, {}, 'One,Two']) {
    const input = pack();
    input.questions[0].options = options;
    assert.ok(codes(input).includes('invalid_options'));
  }
  const input = pack();
  input.questions[0].options = ['One', , 'Three'];
  assert.ok(codes(input).includes('invalid_option'));
});

test('correct answer must be an integer index within the option list', () => {
  for (const correct of ['0', 0.5, null, NaN, Infinity, {}, undefined]) {
    const input = pack();
    input.questions[0].correct = correct;
    assert.ok(codes(input).includes('invalid_correct_index'));
  }
  for (const correct of [-1, 2, 100]) {
    const input = pack();
    input.questions[0].correct = correct;
    assert.ok(codes(input).includes('correct_index_out_of_range'));
  }
  const input = pack();
  input.questions[0].correct = 1;
  assert.equal(validateQuestionPack(input).valid, true);
});

test('accepts absolute HTTP and HTTPS source links without fetching them', () => {
  for (const url of ['https://example.org/a?b=c#section', 'http://example.org/guide']) {
    const input = pack();
    input.sources[0].url = url;
    assert.equal(validateQuestionPack(input).valid, true);
  }
});

test('rejects unsafe, incomplete and non-string source links', () => {
  for (const url of [null, {}, '', '/relative', 'not a url', 'javascript:alert(1)',
    'data:text/html,bad', 'file:///tmp/data', 'https://user:secret@example.org/',
    'https://example.org/a b', 'https://exam\nple.org/']) {
    const input = pack();
    input.sources[0].url = url;
    assert.ok(codes(input).includes('invalid_source_url'), String(url));
  }
});

test('accepts existing metadata without requiring new schema fields', () => {
  const input = pack();
  input.verified = '2026-11-23';
  input.note = 'Synthetic metadata.';
  input.sources[0].note = 'Not independently checked.';
  Object.assign(input.questions[0], { category: 'Demo', mascot: 'demo', course: 0, expert: false });
  assert.deepEqual(validateQuestionPack(input), { valid: true, issues: [] });
});

test('handles mixed malformed fields in one pass and keeps structured Norwegian errors', () => {
  const input = { sources: [{}], questions: [{}, null] };
  const result = validateQuestionPack(input);
  assert.equal(result.valid, false);
  assert.ok(result.issues.length >= 9);
  for (const issue of result.issues) {
    assert.equal(typeof issue.code, 'string');
    assert.equal(typeof issue.path, 'string');
    assert.equal(typeof issue.message, 'string');
    assert.ok(issue.message.length > 10);
    assert.ok(issue.row === null || Number.isInteger(issue.row));
  }
});
