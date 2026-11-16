import { describe, expect, it, vi } from 'vitest';
import {
  extractClientIp,
  getCurrentRequestAcceptLanguage,
  getCurrentRequestIp,
} from './request-context';

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('extractClientIp', () => {
  it('returns the first hop of x-forwarded-for', () => {
    expect(extractClientIp(headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe(
      '203.0.113.5',
    );
  });

  it('falls back to x-real-ip', () => {
    expect(extractClientIp(headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('returns null for missing headers', () => {
    expect(extractClientIp(headers({}))).toBeNull();
  });

  it('returns null for invalid IP strings', () => {
    expect(extractClientIp(headers({ 'x-forwarded-for': 'not-an-ip' }))).toBeNull();
    expect(extractClientIp(headers({ 'x-real-ip': '999.999.999.999' }))).toBeNull();
  });

  it('accepts IPv6', () => {
    expect(extractClientIp(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });
});

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

describe('getCurrentRequestIp', () => {
  it('returns the client IP from the live request headers', async () => {
    const { headers: mocked } = await import('next/headers');
    vi.mocked(mocked).mockResolvedValueOnce(
      new Headers({ 'x-forwarded-for': '203.0.113.5' }) as never,
    );
    expect(await getCurrentRequestIp()).toBe('203.0.113.5');
  });

  it('returns null when next/headers throws (outside any request scope)', async () => {
    const { headers: mocked } = await import('next/headers');
    vi.mocked(mocked).mockImplementationOnce(() => {
      throw new Error('called outside a request');
    });
    expect(await getCurrentRequestIp()).toBeNull();
  });
});

describe('getCurrentRequestAcceptLanguage', () => {
  it('returns the live request’s Accept-Language as sent', async () => {
    const { headers: mocked } = await import('next/headers');
    vi.mocked(mocked).mockResolvedValueOnce(
      new Headers({ 'accept-language': 'sv-SE,en;q=0.8' }) as never,
    );
    expect(await getCurrentRequestAcceptLanguage()).toBe('sv-SE,en;q=0.8');
  });

  it('returns null when the request has none', async () => {
    const { headers: mocked } = await import('next/headers');
    vi.mocked(mocked).mockResolvedValueOnce(new Headers() as never);
    expect(await getCurrentRequestAcceptLanguage()).toBeNull();
  });

  it('returns null when next/headers throws (outside any request scope)', async () => {
    const { headers: mocked } = await import('next/headers');
    vi.mocked(mocked).mockImplementationOnce(() => {
      throw new Error('called outside a request');
    });
    expect(await getCurrentRequestAcceptLanguage()).toBeNull();
  });
});
