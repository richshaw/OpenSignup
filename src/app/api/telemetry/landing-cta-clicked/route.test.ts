import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentHeaders: Headers;

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(currentHeaders),
}));

vi.mock('@/lib/view-tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/view-tracker')>();
  return { ...actual, recordLandingCtaClicked: vi.fn(async () => {}) };
});

import { recordLandingCtaClicked } from '@/lib/view-tracker';
import { POST } from './route';

const browserUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('POST /api/telemetry/landing-cta-clicked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 with an empty body and forwards header-derived signals', async () => {
    currentHeaders = new Headers({
      'user-agent': browserUa,
      referer: 'https://opensignup.org/',
    });

    const res = await POST();

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(recordLandingCtaClicked).toHaveBeenCalledTimes(1);
    expect(recordLandingCtaClicked).toHaveBeenCalledWith({
      signals: { userAgent: browserUa, referer: 'https://opensignup.org/', dnt: false },
    });
  });

  it('derives dnt=true from the DNT header (signals come from headers, not a body)', async () => {
    currentHeaders = new Headers({ 'user-agent': browserUa, dnt: '1' });

    const res = await POST();

    expect(res.status).toBe(204);
    expect(recordLandingCtaClicked).toHaveBeenCalledWith({
      signals: { userAgent: browserUa, referer: null, dnt: true },
    });
  });
});
