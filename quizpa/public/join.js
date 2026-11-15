import { api, root, say } from './shared.js';

const form = root.querySelector('[data-join]');
const codeInput = form.elements.code;
const submit = form.querySelector('button[type=submit]');

codeInput.addEventListener('input', () => {
  const normalized = codeInput.value.replace(/\D/g, '').slice(0, 8);
  if (normalized !== codeInput.value) codeInput.value = normalized;
  say('');
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  try {
    const result = await api('/api/join', { method: 'POST', data: { code: codeInput.value } });
    location.assign(result.path);
  } catch (error) {
    say(error.status ? error.message : 'Fikk ikke kontakt. Prøv igjen.', true);
    codeInput.focus();
    codeInput.select();
    submit.disabled = false;
  }
});
