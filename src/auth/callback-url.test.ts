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
    expect(safeCallbackUrl('https://callback.invalid/app')).toBe('/app');
  });

  it('normalises traversal rather than passing it through', () => {
    expect(safeCallbackUrl('/app/../../etc/passwd')).toBe('/etc/passwd');
  });
});
