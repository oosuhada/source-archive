import assert from 'node:assert/strict';
import test from 'node:test';

await import('../sw-reliability.js');
const { fetchWithRetry, parseByteRange } = globalThis.SourceArchiveReliability;

test('retries a transient network error and reports recovery', async () => {
  let calls = 0;
  const result = await fetchWithRetry('asset', {
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new TypeError('network interrupted');
      return { status: 200 };
    },
    sleep: async () => {},
  });
  assert.equal(calls, 3);
  assert.equal(result.retries, 2);
  assert.equal(result.recovered, true);
});

test('retries 429 and 5xx but preserves terminal response', async () => {
  const statuses = [429, 503, 200];
  const result = await fetchWithRetry('metadata', {
    fetchImpl: async () => ({ status: statuses.shift() }),
    sleep: async () => {},
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.retries, 2);
});

test('parses explicit and suffix byte ranges and rejects invalid ranges', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseByteRange('bytes=120-130', 100), null);
  assert.equal(parseByteRange('bytes=20-10', 100), null);
});
