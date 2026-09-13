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
});
