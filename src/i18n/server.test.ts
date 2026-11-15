import { afterEach, describe, expect, it, vi } from 'vitest';

const error = vi.fn();
vi.mock('@/lib/log', () => ({ log: { error } }));
// Unit tests have no DATABASE_URL, so the real getEnv() would throw.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { getServerTranslator, instanceDefaultLocale } = await import('./server');

afterEach(() => {
  error.mockReset();
});

describe('getServerTranslator', () => {
  it('translates without logging', () => {
    expect(getServerTranslator('en', 'common.footer')('help')).toBe('Help');
    expect(error).not.toHaveBeenCalled();
  });

  it('logs one line for a missing key and shows its path rather than throwing', () => {
    const t = getServerTranslator('en', 'common.footer');
    // @ts-expect-error not a key in en.json
    expect(t('nowhere')).toBe('common.footer.nowhere');
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      { code: 'MISSING_MESSAGE' },
      expect.stringContaining('common.footer.nowhere'),
    );
  });
});

describe('instanceDefaultLocale', () => {
  it('is the DEFAULT_LOCALE the environment sets, or nothing when unset', () => {
    expect(instanceDefaultLocale()).toBeUndefined();
    env.DEFAULT_LOCALE = 'en';
    expect(instanceDefaultLocale()).toBe('en');
  });
});
