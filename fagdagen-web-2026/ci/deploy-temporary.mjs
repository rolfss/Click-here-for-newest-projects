import { spawnSync } from 'node:child_process';
import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';

const wranglerVersion = '4.102.0';
const temporaryConfig = await mkdtemp(join(tmpdir(), 'fagdagen-wrangler-'));
const environment = { ...process.env, XDG_CONFIG_HOME: temporaryConfig, FORCE_COLOR: '0', WRANGLER_SEND_METRICS: 'false' };
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_API_KEY', 'CF_EMAIL', 'CF_ACCOUNT_ID']) {
  delete environment[name];
}

function readUrls(output) {
  const claimText = output.match(/^\s*Claim URL:\s*(https:\/\/\S+)\s*$/im)?.[1];
  const workerText = output.match(/^\s+(https:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev\/?)[ \t]*$/im)?.[1];
  if (!claimText || !workerText) throw new Error('Wrangler did not report both expected URLs.');
  let claim, worker;
  try {
    claim = new URL(claimText);
    worker = new URL(workerText);
  } catch {
    throw new Error('Wrangler returned an invalid deployment URL.');
  }
  if (claim.origin !== 'https://dash.cloudflare.com' || claim.pathname !== '/claim-preview' || !claim.searchParams.get('claimToken') || claim.username || claim.password || claim.hash) {
    throw new Error('Wrangler reported an unexpected claim destination.');
  }
  if (!/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(worker.hostname) || worker.port || worker.username || worker.password || worker.pathname !== '/' || worker.search || worker.hash) {
    throw new Error('Wrangler reported an unexpected Worker destination.');
  }
  return { claim: claim.href, worker: worker.origin };
}

function sealClaim(claim, publicKey) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(claim, 'utf8'), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  const envelope = {
    key: wrappedKey.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: data.toString('base64url'),
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

async function deploy() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync('npm', ['exec', '--yes', `--package=wrangler@${wranglerVersion}`, '--', 'wrangler', 'deploy', '--temporary'], {
      encoding: 'utf8', env: environment, input: '', timeout: 190000, maxBuffer: 8 * 1024 * 1024,
    });
    // Raw CLI output may include temporary credentials and is never emitted.
    const output = stripVTControlCharacters((result.stdout ?? '') + '\n' + (result.stderr ?? ''));
    if (result.status === 0) return readUrls(output);
    if (attempt === 0 && !/Claim URL:/i.test(output) && /EAI_AGAIN|ECONNRESET|ETIMEDOUT|temporarily unavailable/i.test(output)) {
      console.log('Temporary network failure. Retrying once.');
      await delay(3500);
      continue;
    }
    if (result.error?.code === 'ETIMEDOUT') throw new Error('Wrangler timed out.');
    if (/rate limit|too many requests|429/i.test(output)) throw new Error('Cloudflare rate-limited the temporary deployment.');
    if (/proof.of.work|challenge/i.test(output)) throw new Error('Cloudflare declined the temporary account challenge.');
    if (/not authenticated|logged in|authentication|credentials/i.test(output)) throw new Error('Wrangler could not authenticate the temporary deployment.');
    if (/compil|build failed|cannot find|could not resolve|no matching export/i.test(output)) throw new Error('Wrangler could not compile the Worker.');
    throw new Error(`Temporary deployment failed. Wrangler exit code: ${result.status ?? 'unknown'}.`);
  }
}

const routes = [
  { path: '/', contentType: /text\/html/i, includes: 'Fagdagen' },
  { path: '/spill', contentType: /text\/html/i, includes: 'name-form' },
  { path: '/quiz.css', contentType: /text\/css/i },
  { path: '/pdfjs/pdf.worker.min.mjs', contentType: /(?:java|ecma)script/i },
  { path: '/quiz-qr.png', contentType: /image\/(?:png|svg\+xml)/i },
  { path: '/api/quiz/status', contentType: /application\/json/i, quizStatus: true },
];

async function verifyRoute(origin, { path, contentType, includes, quizStatus }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(6500) });
    } catch {
      if (attempt === 3) throw new Error(`Published route did not respond: ${path}`);
      await delay(1700);
      continue;
    }
    if (response.ok && contentType.test(response.headers.get('content-type') ?? '')) {
      if (includes && !(await response.text()).includes(includes)) throw new Error(`Unexpected published content: ${path}`);
      if (quizStatus) {
        const status = await response.json().catch(() => null);
        if (status?.active !== false || status.count !== 10 || status.state !== 'open' || !status.resetsAt) {
          throw new Error('Published quiz status did not match the unactivated event.');
        }
      }
      if (!includes && !quizStatus) await response.body?.cancel();
      return;
    }
    await response.body?.cancel();
    if (![404, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`Published route failed verification: ${path} (HTTP ${response.status}).`);
    }
    await delay(1700);
  }
}

try {
  let publicKey;
  try { publicKey = createPublicKey(await readFile(new URL('./claim-public.pem', import.meta.url))); }
  catch { throw new Error('Missing or invalid claim encryption public key.'); }
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 2048) {
    throw new Error('Claim encryption requires an RSA key of at least 2048 bits.');
  }
  const { claim, worker } = await deploy();
  console.log('FAGDAG_WORKER_URL ' + worker);
  console.log('FAGDAG_CLAIM_ENVELOPE ' + sealClaim(claim, publicKey));
  await Promise.all(routes.map(route => verifyRoute(worker, route)));
  const bootstrap = await fetch(worker + '/api/organizer/bootstrap', { redirect: 'error', signal: AbortSignal.timeout(6500) });
  if (!bootstrap.ok) throw new Error(`Published route failed verification: organizer bootstrap (HTTP ${bootstrap.status}).`);
  const { publicKey: activationKey } = await bootstrap.json();
  if (activationKey?.kty !== 'EC' || activationKey.crv !== 'P-256' || !/^[A-Za-z0-9_-]{43}$/.test(activationKey.x) || !/^[A-Za-z0-9_-]{43}$/.test(activationKey.y)) {
    throw new Error('Unexpected published organizer key.');
  }
  console.log('FAGDAG_BOOTSTRAP_PUBLIC ' + Buffer.from(JSON.stringify(activationKey)).toString('base64url'));
  console.log('FAGDAG_SMOKE_OK');
} catch (error) {
  // Only locally constructed, non-secret diagnostics are allowed in Actions logs.
  const message = error instanceof Error && /^(?:Wrangler|Cloudflare|Temporary deployment|Missing or invalid claim|Claim encryption|Published route|Published quiz|Unexpected published)/.test(error.message)
    ? error.message : 'Deployment verification encountered an unexpected error.';
  console.error(message);
  process.exitCode = 1;
} finally {
  await rm(temporaryConfig, { recursive: true, force: true }).catch(() => {});
}
