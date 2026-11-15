export const root = document.querySelector('#app');

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export async function api(path, options = {}) {
  const request = { method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store' };
  if (options.data !== undefined) {
    request.headers = { 'Content-Type': 'application/json' };
    request.body = JSON.stringify(options.data);
  }
  const response = await fetch(path, request);
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw Object.assign(new Error(data?.message ?? 'Fikk ikke kontakt. Prøv igjen.'), { code: data?.code, status: response.status });
  }
  return data;
}

export const number = new Intl.NumberFormat('nb-NO');
const date = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short',
});

export function dateLabel(value) {
  return date.format(value);
}

export function say(message, error = false, container = root) {
  const status = container.querySelector('[data-message]');
  if (status) {
    status.textContent = message;
    status.className = 'message ' + (error ? 'error' : 'success');
  }
}

export function focusHeading() {
  const heading = root.querySelector('h1, h2');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

export function button(action, label, kind = 'secondary', attributes = '') {
  return '<button type="button" class="btn ' + kind + '" data-do="' + action + '" ' + attributes + '>' + label + '</button>';
}

export function table(entries, nickname = '', limit = 50) {
  if (!entries.length) return '<p class="no-margin">Ingen har fullført ennå.</p>';
  const data = entries.slice(0, limit).map(item =>
    '<tr' + (item.nickname === nickname ? ' class="mine"' : '') + '><td>' + item.rank + '</td><td>' +
    escapeHtml(item.nickname) + '</td><td class="numeric">' + number.format(item.points) +
    '</td><td class="numeric">' + item.correct + '</td></tr>').join('');
  return '<div class="table-wrap"><table><thead><tr><th scope="col">Plass</th><th scope="col">Kallenavn</th>' +
    '<th scope="col" class="numeric">Poeng</th><th scope="col" class="numeric">Riktige</th></tr></thead><tbody>' +
    data + '</tbody></table></div>' + (entries.length > limit ? '<div class="actions">' +
    button('more', 'Vis flere (' + number.format(entries.length - limit) + ')', 'secondary small') + '</div>' : '');
}

export async function copyText(value, fallback) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    if (fallback) {
      fallback.focus();
      fallback.select();
    }
    return false;
  }
  return true;
}
