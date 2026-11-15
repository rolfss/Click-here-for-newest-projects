import { fail } from './rules.mjs';

const encoder = new TextEncoder();
export const noStore = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...noStore, ...headers } });
}

export function sql(env, query, ...params) {
  return env.DB.prepare(query).bind(...params);
}

export async function rows(statement) {
  return (await statement.all()).results;
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomHex(size) {
  return hex(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export async function passwordVerifier(password, salt) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const key = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100_000,
  }, base, 256);
  return hex(new Uint8Array(key));
}

export async function signature(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export function secureEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') ?? '';
  return cookies.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}

export function cookie(request, name, value, path, lifetime) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return name + '=' + value + '; Path=' + path + '; Max-Age=' + lifetime + '; HttpOnly; SameSite=Lax' + secure;
}

export function checkOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    fail(403, 'foreign_origin', 'Åpne quizen fra den opprinnelige lenken.');
  }
}

export async function input(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
    fail(415, 'invalid_content_type', 'Send data som JSON.');
  }
  const limit = 160_000;
  if (Number(request.headers.get('Content-Length')) > limit) fail(413, 'body_too_large', 'Quizen er for stor.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid_json', 'Ugyldige data.');
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      fail(413, 'body_too_large', 'Quizen er for stor.');
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const data = JSON.parse(body + decoder.decode());
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // Unreadable JSON and invalid top-level types share a response.
  }
  fail(400, 'invalid_json', 'Ugyldige data.');
}
