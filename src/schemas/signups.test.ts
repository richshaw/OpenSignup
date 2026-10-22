import { describe, expect, it } from 'vitest';
import { SignupCreateInputSchema, SignupUpdateInputSchema, requiresEmail, sendsReminders } from './signups';

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

describe('sendsReminders', () => {
  it.each([
    ['no settings', null, true],
    ['no sendReminders key', { requireEmail: false }, true],
    ['sendReminders true', { sendReminders: true }, true],
    ['sendReminders false', { sendReminders: false }, false],
  ])('%s', (_label, settings, expected) => {
    expect(sendsReminders(settings)).toBe(expected);
  });
});

describe('visibility', () => {
  it('defaults to unlisted on create', () => {
    const r = SignupCreateInputSchema.parse({ title: 'Snack rota', settings: {} });
    expect(r.visibility).toBe('unlisted');
  });

  // Nothing reads visibility: every signup opens for anyone with its link.
  it.each(['public', 'unlisted', 'password'])('refuses %s on update', (visibility) => {
    const r = SignupUpdateInputSchema.safeParse({ visibility });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['visibility']);
  });

  it('accepts an update that leaves visibility out', () => {
    expect(SignupUpdateInputSchema.safeParse({ title: 'New' }).success).toBe(true);
  });
});
