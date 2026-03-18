import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Each test uses a unique cf-connecting-ip to avoid shared rate limit state
let ipCounter = 0;
function nextIp() {
  return `test-ip-${++ipCounter}`;
}

async function makeApp(max: number, windowMs: number) {
  // Reset modules so the rate limiter's module-level store starts clean for each suite
  const { rateLimit } = await import('../src/lib/rate-limit.js');
  const app = new Hono();
  app.use('/api', rateLimit({ max, windowMs }));
  app.get('/api', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimit middleware', () => {
  let app: Hono;

  beforeEach(async () => {
    app = await makeApp(3, 60_000);
  });

  it('allows requests within the limit', async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when limit is exceeded', async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
    }
    const res = await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
    expect(res.status).toBe(429);
  });

  it('includes Retry-After header on 429', async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
    }
    const res = await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns a JSON error body on 429', async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
    }
    const res = await app.request('/api', { headers: { 'cf-connecting-ip': ip } });
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Too many requests');
  });

  it('uses x-forwarded-for when cf-connecting-ip is absent', async () => {
    const ip = `forwarded-${nextIp()}`;
    for (let i = 0; i < 3; i++) {
      await app.request('/api', { headers: { 'x-forwarded-for': ip } });
    }
    const res = await app.request('/api', { headers: { 'x-forwarded-for': ip } });
    expect(res.status).toBe(429);
  });

  it('tracks limits independently per IP', async () => {
    const ip1 = nextIp();
    const ip2 = nextIp();

    // Exhaust ip1's limit
    for (let i = 0; i < 3; i++) {
      await app.request('/api', { headers: { 'cf-connecting-ip': ip1 } });
    }
    const blockedRes = await app.request('/api', { headers: { 'cf-connecting-ip': ip1 } });
    expect(blockedRes.status).toBe(429);

    // ip2 should still be allowed
    const allowedRes = await app.request('/api', { headers: { 'cf-connecting-ip': ip2 } });
    expect(allowedRes.status).toBe(200);
  });
});
