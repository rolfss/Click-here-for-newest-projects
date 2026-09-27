// Run from a clean checkout: node noark-api/deploy.mjs
// OAuth stays on your own computer; existing Worker secrets and budget ledger are preserved.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { API_CONFIG } from '../noark-assistent/api-config.mjs';
import { BUILD_INFO } from '../noark-assistent/data.mjs';
import { MODEL_ID } from '../noark-assistent/rag-shared.mjs';
import { ANSWER_VERSION, LIMITS } from './worker.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const wranglerPackage = 'wrangler@4.130.0';

export function assertDeploymentHealth(health, { requireRag = false } = {}) {
  const expected = {
    configured: true, model: MODEL_ID, reasoning: 'medium',
    corpusVersion: BUILD_INFO.corpusVersion, answerVersion: ANSWER_VERSION,
    dailyBudgetUsd: LIMITS.dailyMicroUsd / 1e6,
    monthlyBudgetUsd: LIMITS.monthlyMicroUsd / 1e6,
    trialBudgetUsd: LIMITS.trialMicroUsd / 1e6,
  };
  const mismatches = Object.entries(expected).filter(([key, value]) => health?.[key] !== value);
  const siteKeyPresent = typeof health?.siteKey === 'string' && health.siteKey.length > 0;
  if (mismatches.length || !siteKeyPresent) {
    // Print field names only: never dump a response that might contain unexpected sensitive data.
    const fields = [...mismatches.map(([key]) => key), ...(!siteKeyPresent ? ['siteKey'] : [])];
    throw new Error(`Den aktive Luna-serveren er ikke klar. Kontroller: ${fields.join(', ')}.`);
  }
  if (requireRag && (health.retrieval?.provider !== 'jev' || health.retrieval.enabled !== true ||
      health.fallback?.enabled !== true || health.fallback.available !== true ||
      health.fallback.model !== 'Bonsai-2-27B-PQ2_0'))
    throw new Error('JEV eller Bonsai er ikke klar i den aktive appen. Kontroller hemmelighet, aktivering og lokal forbindelse.');
  return health;
}

export async function checkDeployment({ fetchImpl = fetch, attempts = 1, pause = delay, requireRag = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(`${API_CONFIG.origin}/api/health`, {
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Helsekontrollen svarte HTTP ${response.status}.`);
      return assertDeploymentHealth(await response.json(), { requireRag });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        console.log('Venter på at den nye serverversjonen skal bli tilgjengelig ...');
        await pause(3000);
      }
    }
  }
  throw lastError;
}

function run(command, args, shell = false) {
  const result = spawnSync(command, args, { cwd: directory, stdio: 'inherit', shell });
  if (result.error || result.status !== 0)
    throw new Error(`Kommandoen ${command} ble ikke fullført. Publiseringen er stoppet.`);
}

function wrangler(...args) {
  // All shell arguments are fixed by this script, never supplied by the user or a server.
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', wranglerPackage, ...args], process.platform === 'win32');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--check', '--check-rag', '--dry-run'].includes(args[0])))
    throw new Error('Bruk node noark-api/deploy.mjs [--check | --check-rag | --dry-run].');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 eller nyere kreves.');
  if (!['--check', '--check-rag'].includes(args[0])) {
    console.log('Tester serveren og klienten før publisering ...');
    const testFiles = ['tests', '../noark-assistent/tests'].flatMap((folder) =>
      readdirSync(join(directory, folder)).filter((name) => name.endsWith('.test.mjs')).sort()
        .map((name) => join(directory, folder, name)));
    run(process.execPath, ['--test', ...testFiles]);
    wrangler('deploy', '--dry-run');
    if (args[0] === '--dry-run') return;
    if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_API_KEY) {
      console.log('Godkjenn Cloudflare-innloggingen i nettleseren som åpnes. Ikke del nøkler i chatten.');
      wrangler('login', '--scopes', 'account:read', 'user:read', 'workers_scripts:write');
    }
    console.log('Kontrollerer at den eksisterende noark-luna-api finnes på kontoen ...');
    wrangler('deployments', 'list', '--name', 'noark-luna-api');
    console.log('Oppdaterer den eksisterende Luna-serveren ...');
    wrangler('deploy');
  }
  await checkDeployment({ attempts: ['--check', '--check-rag'].includes(args[0]) ? 1 : 4, requireRag: args[0] === '--check-rag' });
  console.log(`Bekreftet serverversjon: ${ANSWER_VERSION}. Kildeversjon: ${BUILD_INFO.corpusVersion}.`);
  console.log('Åpne NOARK-assistenten på nytt, aktiver Luna og spør: Hva er systemID?');
  console.log('Helsekontrollen bekrefter utrullingen. En test av et ekte modellsvar gjenstår; ingen betalte testspørsmål er sendt.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
