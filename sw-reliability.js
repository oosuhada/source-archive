(function attachSourceArchiveReliability(root) {
  const retryableStatus = (status) => status === 429 || status >= 500;

  const backoffMs = (attempt, baseMs = 250, maxMs = 2000) =>
    Math.min(maxMs, baseMs * (2 ** attempt));

  async function fetchWithRetry(request, options = {}) {
    const fetchImpl = options.fetchImpl || root.fetch.bind(root);
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 2;
    const baseMs = options.baseMs ?? 250;
    let retries = 0;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetchImpl(request);
        if (!retryableStatus(response.status) || attempt === maxRetries) {
          return { response, retries, recovered: retries > 0, errorCategory: null };
        }
        retries += 1;
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) throw error;
        retries += 1;
      }
      await sleep(backoffMs(attempt, baseMs));
    }
    throw lastError || new Error('retry budget exhausted');
  }

  function parseByteRange(header, length) {
    if (!header || !Number.isInteger(length) || length <= 0) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (!match[1] && !match[2])) return null;

    let start;
    let end;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
      start = Math.max(0, length - suffixLength);
      end = length - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : length - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= length || end < start) return null;
      end = Math.min(end, length - 1);
    }
    return { start, end };
  }

  root.SourceArchiveReliability = { backoffMs, fetchWithRetry, parseByteRange, retryableStatus };
}(typeof self !== 'undefined' ? self : globalThis));
