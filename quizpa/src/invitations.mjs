import qrcode from 'qrcode-generator';
import { fail, roundStatus } from './rules.mjs';
import { input, json, noStore, signature, sql } from './support.mjs';

const periodMs = 120_000;
const maxFailures = 20;
const codeSpace = 100_000_000;

function randomJoinCode() {
  const sample = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / codeSpace) * codeSpace;
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return String(sample[0] % codeSpace).padStart(8, '0');
}

export async function issueJoinCode(env, round, now) {
  const status = roundStatus(round, now);
  const result = { code: null, expiresAt: null, serverNow: now, status, opensAt: round.opens_at };
  if (status !== 'open') return result;

  const period = Math.floor(now / periodMs);
  const currentCode = () => sql(env, 'SELECT code FROM join_codes WHERE round_code = ? AND period = ?',
    round.code, period).first();
  let existing = await currentCode();
  for (let index = 0; !existing && index < 6; index++) {
    const created = await sql(env, 'INSERT INTO join_codes (code, round_code, period) VALUES (?, ?, ?) ' +
      'ON CONFLICT DO NOTHING RETURNING code', randomJoinCode(), round.code, period).first();
    if (created) {
      // Retain recently expired codes so consecutive windows cannot reuse them.
      await sql(env, 'DELETE FROM join_codes WHERE period < ?', period - 30).run();
    }
    existing = created ?? await currentCode();
  }
  if (!existing) fail(503, 'code_unavailable', 'Spillkoden kunne ikke opprettes. Prøv igjen.');
  result.code = existing.code;
  result.expiresAt = Math.min((period + 1) * periodMs, round.closes_at ?? Infinity);
  result.serverNow = Date.now();
  return result;
}

export async function redeemJoinCode(request, env, now) {
  const value = (await input(request)).code;
  const code = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  if (!/^\d{8}$/.test(code)) fail(400, 'invalid_code', 'Skriv inn de åtte sifrene i spillkoden.');
  if (!env.ADMIN_SESSION_SECRET) fail(503, 'code_unavailable', 'Spillkoder er midlertidig utilgjengelige.');

  const source = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = await signature(env.ADMIN_SESSION_SECRET, 'join-code:' + source);
  const period = Math.floor(now / periodMs);
  const match = 'SELECT r.code FROM join_codes j JOIN rounds r ON r.code = j.round_code ' +
    'WHERE j.code = ? AND j.period = ? AND r.closed_at IS NULL AND r.opens_at <= ? ' +
    'AND (r.closes_at IS NULL OR r.closes_at > ?)';
  const values = [code, period, now, now];
  // D1 executes the lookup and failed-attempt counter in the same transaction.
  const [lookup, failures] = await env.DB.batch([
    sql(env, match + ' AND NOT EXISTS (SELECT 1 FROM login_limits WHERE key = ? AND bucket = ? AND hits >= ?)',
      ...values, key, period, maxFailures),
    sql(env, 'INSERT INTO login_limits (key, bucket, hits) SELECT ?, ?, 1 WHERE NOT EXISTS (' + match + ') ' +
      'ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN excluded.bucket > bucket THEN 1 ' +
      'WHEN excluded.bucket = bucket THEN min(hits + 1, ?) ELSE hits END, bucket = max(bucket, excluded.bucket) ' +
      'RETURNING hits', key, period, ...values, maxFailures),
  ]);
  const result = lookup.results[0];
  if (result) return json({ path: '/spill/' + result.code });
  if ((failures.results[0]?.hits ?? maxFailures) >= maxFailures) {
    fail(429, 'code_limit', 'For mange feil forsøk. Prøv igjen når arrangøren har en ny kode.');
  }
  fail(404, 'code_missing', 'Spillkoden er utløpt eller ugyldig. Sjekk den nyeste koden hos arrangøren.');
}

export function invitationQr(request, code) {
  const url = new URL(request.url);
  const qr = qrcode(0, 'M');
  qr.addData(new URL('/spill/' + code, url.origin).href);
  qr.make();
  const attachment = url.searchParams.get('download') === '1';
  return new Response(qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true }), {
    headers: { ...noStore, 'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Content-Disposition': (attachment ? 'attachment' : 'inline') + '; filename="quizpa-qr.svg"' },
  });
}
