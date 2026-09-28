import { buildNoulRequest, callJev, listModels } from './jev-client.mjs';

const live = process.argv.includes('--live');
if (!process.env.TYPESAFE_API_KEY) {
  console.error('FAIL: TYPESAFE_API_KEY is not available to this process.');
  process.exit(1);
}
console.log('PASS: TypeSafe API key is available to the process (value not printed).');
if (!live) process.exit(0);

try {
  const models = await listModels();
  console.log('PASS: TypeSafe /v1/models responded.');
  const response = await callJev(buildNoulRequest({
    state: 'A synthetic setup test. No personal or workplace data.',
    question: 'Is this text explicitly described as a synthetic setup test?'
  }));
  console.log(`PASS: live Jev decision returned from ${response.model || 'configured model'}.`);
  if (models) console.log('PASS: JEV BRIDGE READY');
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
}
