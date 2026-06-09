import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentHeaders: Headers;

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(currentHeaders),
}));

vi.mock('@/lib/view-tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/view-tracker')>();
  return { ...actual, recordLandingCtaClicked: vi.fn(async () => {}) };
});

vi.mock('@/db/client', () => ({
  getDb: () => ({}) as unknown,
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: vi.fn(async () => {}) };
});

import { recordLandingCtaClicked } from '@/lib/view-tracker';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { serviceError, ServiceException } from '@/lib/errors';
import { POST } from './route';

const browserUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(query = '', headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/telemetry/landing-cta-clicked${query}`, {
    method: 'POST',
    headers,
  });
}

describe('POST /api/telemetry/landing-cta-clicked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 with an empty body, forwards header-derived signals, and defaults cta=start_signup', async () => {
    currentHeaders = new Headers({
      'user-agent': browserUa,
      referer: 'https://opensignup.org/',
    });

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(recordLandingCtaClicked).toHaveBeenCalledTimes(1);
    expect(recordLandingCtaClicked).toHaveBeenCalledWith({
      cta: 'start_signup',
      signals: { userAgent: browserUa, referer: 'https://opensignup.org/', dnt: false },
    });
  });

  it('forwards an explicit cta=demo_video query param', async () => {
    currentHeaders = new Headers({ 'user-agent': browserUa });

    const res = await POST(request('?cta=demo_video'));

    expect(res.status).toBe(204);
    expect(recordLandingCtaClicked).toHaveBeenCalledWith({
      cta: 'demo_video',
      signals: { userAgent: browserUa, referer: null, dnt: false },
    });
  });

  it('rejects unknown cta values with a 400', async () => {
    currentHeaders = new Headers({ 'user-agent': browserUa });

    const res = await POST(request('?cta=mystery'));

    expect(res.status).toBe(400);
    expect(recordLandingCtaClicked).not.toHaveBeenCalled();
  });

  it('derives dnt=true from the DNT header (signals come from headers, not a body)', async () => {
    currentHeaders = new Headers({ 'user-agent': browserUa, dnt: '1' });

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(recordLandingCtaClicked).toHaveBeenCalledWith({
      cta: 'start_signup',
      signals: { userAgent: browserUa, referer: null, dnt: true },
    });
  });

  it('meters per client IP from x-forwarded-for, falling back to a shared bucket', async () => {
    currentHeaders = new Headers({ 'user-agent': browserUa });

    await POST(request('', { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }));
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      RateLimits.telemetryPerIp,
      '203.0.113.9',
    );

    await POST(request());
    expect(consumeRateLimit).toHaveBeenLastCalledWith(
      expect.anything(),
      RateLimits.telemetryPerIp,
      'unknown',
    );
  });

  it('returns 429 with Retry-After and records nothing when rate-limited', async () => {
    currentHeaders = new Headers({ 'user-agent': browserUa });
    vi.mocked(consumeRateLimit).mockRejectedValueOnce(
      new ServiceException(
        serviceError('rate_limited', 'too many requests', {
          details: { retryAfterSeconds: 42, bucket: RateLimits.telemetryPerIp.bucket },
        }),
      ),
    );

    const res = await POST(request());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(recordLandingCtaClicked).not.toHaveBeenCalled();
  });
});
