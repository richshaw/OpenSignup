import { describe, expect, it } from 'vitest';
import { requiresEmail } from './signups';

describe('requiresEmail', () => {
  it.each([
    ['no settings', null, true],
    ['no requireEmail key', { sendReminders: false }, true],
    ['requireEmail true', { requireEmail: true }, true],
    ['requireEmail false', { requireEmail: false }, false],
    ['settings that do not parse', { requireEmail: 'no' }, true],
  ])('%s', (_label, settings, expected) => {
    expect(requiresEmail(settings)).toBe(expected);
  });
});
