'use strict';

/** One finite harvest, one bounded queue per origin. No daemon/new infrastructure. */
function createSourceQueue({ concurrency = 3, attempts = 2, timeoutMs = 25000,
  deadlineMs = 8 * 60 * 1000, maxRetryWaitMs = 30000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random,
  now = Date.now } = {}) {
  for (const [key, value] of Object.entries({ concurrency, attempts, timeoutMs, deadlineMs })) {
    if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) throw new RangeError(`${key} must be a positive integer`);
  }
  const started = now();
  const jobs = [];
  const coalesced = new Map();
  let active = 0;
  let sequence = 0;
  let cooldownUntil = 0;
  const stats = { requests: 0, retries: 0, coalesced: 0, peak: 0 };
  const transient = err => err?.status === 429 || err?.status >= 500
    || /timeout|abort|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(String(err?.code || '') + ' ' + String(err?.message || ''));
  async function execute(job) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (now() - started >= deadlineMs) throw Object.assign(new Error('source harvest deadline; previous snapshot retained'), { code: 'QUEUE_DEADLINE' });
      const cooldown = Math.max(0, cooldownUntil - now());
      if (cooldown > maxRetryWaitMs) throw Object.assign(new Error('source Retry-After cooldown; deferred to next harvest'), { code: 'SOURCE_COOLDOWN', retryAfterMs: cooldown });
      if (cooldown) await wait(cooldown);
      if (now() - started >= deadlineMs) throw Object.assign(new Error('source harvest deadline after cooldown; previous snapshot retained'), { code: 'QUEUE_DEADLINE' });
      const controller = new AbortController();
      let timer;
      try {
        stats.requests += 1;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error('source attempt timeout'), { code: 'ETIMEDOUT' }));
          }, timeoutMs);
        });
        return await Promise.race([job.work(controller.signal), timeout]);
      } catch (err) {
        clearTimeout(timer);
        if (err?.status === 429) cooldownUntil = Math.max(cooldownUntil, now() + (err.retryAfterMs || 1000));
        if (attempt + 1 >= attempts || !transient(err)) throw err;
        const backoff = Math.max(err.retryAfterMs || 0, 500 * (2 ** attempt) + Math.floor(random() * 250));
        if (backoff > maxRetryWaitMs) throw err; // never shorten a server's Retry-After
        stats.retries += 1;
        await wait(backoff);
      } finally { clearTimeout(timer); }
    }
    throw new Error('unreachable queue exhaustion');
  }
  function pump() {
    jobs.sort((a, b) => a.priority - b.priority || a.order - b.order);
    while (active < concurrency && jobs.length) {
      const job = jobs.shift();
      active += 1;
      stats.peak = Math.max(stats.peak, active);
      execute(job).then(job.resolve, job.reject).finally(() => { active -= 1; pump(); });
    }
  }
  function run(key, work, { priority = 0 } = {}) {
    if (coalesced.has(key)) { stats.coalesced += 1; return coalesced.get(key); }
    const promise = new Promise((resolve, reject) => {
      jobs.push({ key, work, resolve, reject, priority, order: sequence++ });
    });
    coalesced.set(key, promise);
    pump();
    return promise;
  }
  return { run, stats };
}
module.exports = { createSourceQueue };
