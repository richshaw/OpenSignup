// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftWarning } from '@/lib/magic-compose/draft-warnings';
import {
  AI_DRAFT_WARNINGS_KEY_PREFIX,
  clearAiDraftWarnings,
  readAiDraftWarnings,
  writeAiDraftWarnings,
} from './ai-draft-warnings';

const KEY = `${AI_DRAFT_WARNINGS_KEY_PREFIX}sig_test`;

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('a draft’s warnings in the tab’s storage', () => {
  it('keeps codes with their arguments, not sentences', () => {
    const warnings: DraftWarning[] = [
      { code: 'stray_values', count: 2 },
      { code: 'enum_fields_to_text', fields: ['role'] },
    ];
    writeAiDraftWarnings('sig_test', warnings);
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toEqual(warnings);
    expect(readAiDraftWarnings('sig_test')).toEqual(warnings);
    clearAiDraftWarnings('sig_test');
    expect(readAiDraftWarnings('sig_test')).toEqual([]);
  });

  it('keeps nothing for a draft with no warnings', () => {
    window.sessionStorage.setItem(KEY, '[]');
    writeAiDraftWarnings('sig_test', []);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('reads back what was kept as a list, for the warnings box to check, and nothing else', () => {
    const kept = ['an old sentence', { code: 'stray_values', count: 1 }];
    window.sessionStorage.setItem(KEY, JSON.stringify(kept));
    expect(readAiDraftWarnings('sig_test')).toEqual(kept);
    for (const raw of ['not json', '{"code":"stray_values","count":1}', '"text"']) {
      window.sessionStorage.setItem(KEY, raw);
      expect(readAiDraftWarnings('sig_test'), raw).toEqual([]);
    }
  });

  it('gets by without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() =>
      writeAiDraftWarnings('sig_test', [{ code: 'stray_values', count: 1 }]),
    ).not.toThrow();
    expect(readAiDraftWarnings('sig_test')).toEqual([]);
  });
});
