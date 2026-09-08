import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

await import('../sw-reliability.js');
const { fetchWithRetry } = globalThis.SourceArchiveReliability;

const scenarios = [
  ['429-then-ok', [429, 200]],
  ['503-then-ok', [503, 200]],
  ['network-twice-then-ok', ['network', 'network', 200]],
  ['persistent-503', [503, 503, 503]],
];

const results = [];
for (const [name, sequence] of scenarios) {
  const statuses = [...sequence];
  let calls = 0;
  try {
    const result = await fetchWithRetry(name, {
      fetchImpl: async () => {
        calls += 1;
        const next = statuses.shift();
        if (next === 'network') throw new TypeError('injected network failure');
        return { status: next };
      },
      sleep: async () => {},
    });
    results.push({ name, calls, retries: result.retries, terminal_status: result.response.status, recovered: result.recovered && result.response.status === 200 });
  } catch (error) {
    results.push({ name, calls, retries: calls - 1, terminal_status: 'network-error', recovered: false, error: error.name });
  }
}

const recoverable = results.filter((item) => item.name !== 'persistent-503');
const payload = {
  experiment: 'source-archive-media-recovery-v1',
  git_sha: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  generated_at: new Date().toISOString(),
  policy: { max_retries: 2, backoff: '250ms exponential; sleep removed in deterministic benchmark' },
  recoverable_scenario_success_rate: recoverable.filter((item) => item.recovered).length / recoverable.length,
  scenarios: results,
  limitations: [
    'Failure injection validates retry/range policy without live CDN traffic.',
    'It does not measure real buffering, ISP loss, R2/B2 availability, or browser decoder failures.',
  ],
};
mkdirSync('benchmarks', { recursive: true });
writeFileSync('benchmarks/media-recovery.json', `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload, null, 2));
