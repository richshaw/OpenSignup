import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './callback-url';

describe('safeCallbackUrl', () => {
  it('keeps same-site paths and rejects everything else', () => {
    expect(safeCallbackUrl('/oauth/consent/abc')).toBe('/oauth/consent/abc');
    expect(safeCallbackUrl(undefined)).toBe('/app');
    expect(safeCallbackUrl('https://evil.example')).toBe('/app');
    expect(safeCallbackUrl('//evil.example')).toBe('/app');
    expect(safeCallbackUrl('/\\evil.example')).toBe('/app');
  });

  it('keeps the query and fragment of a deep link', () => {
    expect(safeCallbackUrl('/app/signups/sig_abc?tab=responses')).toBe(
      '/app/signups/sig_abc?tab=responses',
    );
    expect(safeCallbackUrl('/app/signups/sig_abc?tab=responses#row-3')).toBe(
      '/app/signups/sig_abc?tab=responses#row-3',
    );
  });

  it('rejects the characters a browser strips before parsing', () => {
    // The URL spec removes ASCII tab, LF and CR, so each of these reaches the
    // browser as the protocol-relative `//evil.example`. A leading-slash prefix
    // check does not see that; the parser does.
    expect(safeCallbackUrl('/\t/evil.example')).toBe('/app');
    expect(safeCallbackUrl('/\n/evil.example')).toBe('/app');
    expect(safeCallbackUrl('/\r/evil.example')).toBe('/app');
    expect(safeCallbackUrl('/\t\\evil.example')).toBe('/app');
    expect(safeCallbackUrl('/\\\t/evil.example')).toBe('/app');
  });

  it('rejects an absolute URL even on our own sentinel origin', () => {
    expect(safeCallbackUrl('https://callback.invalid/oauth/consent/abc')).toBe('/app');
  });

  it('rejects input the parse rewrites into a path starting with //', () => {
    // Each of these resolves on the sentinel origin, but dot-segment removal,
    // backslash folding or an authority naming the sentinel host leaves a
    // pathname of `//evil.example`, which the browser reads as another host.
    for (const raw of [
      '/.//evil.example',
      '/..//evil.example',
      '/app/..//evil.example',
      '/%2e//evil.example',
      '/%2E%2E//evil.example',
      '/./\\evil.example',
      '/.\\/evil.example',
      '/\t.//evil.example',
      '//callback.invalid//evil.example',
      '////callback.invalid//evil.example',
      '//CALLBACK.INVALID:443//evil.example',
      '/\t/callback.invalid//evil.example',
      '/\\callback.invalid\\/evil.example',
    ]) {
      expect(safeCallbackUrl(raw), JSON.stringify(raw)).toBe('/app');
    }
  });

  it('returns a path that stays on the site and is unchanged by a second pass', () => {
    const site = 'https://opensignup.example';
    for (const raw of [
      '/oauth/consent/abc',
      '/app/signups/sig_abc?tab=responses#row-3',
      '/app/../../etc/passwd',
      '/app/./signups//sig_abc',
      '/.//evil.example',
      '//callback.invalid//evil.example',
      '/\t/evil.example',
      '/app\\..\\..\\/evil.example',
    ]) {
      const out = safeCallbackUrl(raw);
      expect(new URL(out, site).origin, JSON.stringify(raw)).toBe(site);
      expect(safeCallbackUrl(out), JSON.stringify(raw)).toBe(out);
    }
  });

  it('resolves dot segments within the site', () => {
    expect(safeCallbackUrl('/app/../../etc/passwd')).toBe('/etc/passwd');
  });

  it('falls back when a repeated query key arrives as an array', () => {
    expect(safeCallbackUrl(['/app/signups', '/oauth/consent/abc'])).toBe('/app');
  });
});
