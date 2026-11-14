import { afterEach, describe, expect, it, vi } from 'vitest';
import { warnIfUnshippedLocalesShown } from './unshipped-warning';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/log', () => ({ log: { warn } }));

/** What the web server (src/instrumentation.ts) and the reminder worker each call as they start. */
describe('warnIfUnshippedLocalesShown', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockClear();
  });

  it('warns once, naming the list, when E2E_UNSHIPPED_LOCALES is set', () => {
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'sv');
    warnIfUnshippedLocalesShown();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual({ E2E_UNSHIPPED_LOCALES: 'sv' });
    expect(warn.mock.calls[0]?.[1]).toMatch(/its emails go out in it.*unset it on a real instance/);
  });

  it('says nothing when it is not set', () => {
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', '');
    warnIfUnshippedLocalesShown();
    expect(warn).not.toHaveBeenCalled();
  });
});
