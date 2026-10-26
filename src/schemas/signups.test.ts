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

describe('title', () => {
  // Three spaces pass a length check made before trimming; one space doesn't.
  it.each(['   ', ' a '])('refuses %j on create', (title) => {
    const r = SignupCreateInputSchema.safeParse({ title, settings: {} });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['title']);
  });

  it.each(['   ', ' a '])('refuses %j on update', (title) => {
    const r = SignupUpdateInputSchema.safeParse({ title });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['title']);
  });

  it('trims the title on create', () => {
    const r = SignupCreateInputSchema.parse({ title: ' Bake sale ', settings: {} });
    expect(r.title).toBe('Bake sale');
  });

  it('trims the title on update', () => {
    expect(SignupUpdateInputSchema.parse({ title: ' Bake sale ' }).title).toBe('Bake sale');
  });

  it('says why a title of only spaces is refused, in the Build tab’s words', () => {
    const r = SignupCreateInputSchema.safeParse({ title: '   ', settings: {} });
    expect(r.error?.issues[0]?.message).toBe('Title must be at least 2 characters.');
  });

  // Magic Compose's fitDraftText cuts a title by its raw length, so the limit
  // is on the raw string too: otherwise it would cut a title the schema takes.
  it('checks the 120-character limit before trimming', () => {
    const accepts = (title: string) =>
      SignupCreateInputSchema.safeParse({ title, settings: {} }).success;
    expect(accepts('a'.repeat(120))).toBe(true);
    expect(accepts(`${'a'.repeat(119)}   `)).toBe(false);
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
