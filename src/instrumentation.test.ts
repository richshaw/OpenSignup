import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/log', () => ({ log: { warn } }));

describe('register (server start)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockClear();
  });

  it('warns once when the server starts with E2E_UNSHIPPED_LOCALES set', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'sv');
    await register();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual({ E2E_UNSHIPPED_LOCALES: 'sv' });
    expect(warn.mock.calls[0]?.[1]).toMatch(/unset it on a real instance/);
  });

  it('says nothing when it is not set', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', '');
    await register();
    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing on the edge runtime, which has no logger', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'sv');
    await register();
    expect(warn).not.toHaveBeenCalled();
  });
});
