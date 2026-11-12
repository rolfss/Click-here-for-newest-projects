const status = process.argv[2];
const { GITHUB_API_URL, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID, FAGDAG_STATUS_TOKEN } = process.env;
if (!FAGDAG_STATUS_TOKEN) process.exit(0);
const state = status === 'pending' || status === 'success' ? status : 'failure';
try {
  const response = await fetch(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/statuses/${GITHUB_SHA}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FAGDAG_STATUS_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state, context: 'Fagdagen / Browser deployment',
      target_url: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
      description: state === 'pending' ? 'Building Fagdagen' : state === 'success' ? 'Browser deployment verified' : 'Browser deployment needs attention',
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) console.log(`Could not report run status (HTTP ${response.status}).`);
} catch { console.log('Could not report run status.'); }
