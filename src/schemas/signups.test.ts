import { describe, expect, it } from 'vitest';
import { requiresEmail, sendsReminders, SignupCreateInputSchema, SignupUpdateInputSchema } from './signups';

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

describe('signup title validation', () => {
  const createTitleSchema = SignupCreateInputSchema.shape.title;
  const updateTitleSchema = SignupUpdateInputSchema.shape.title;

  it.each([' ', ' a '])(
    'rejects invalid create title %j',
    (title) => {
      expect(createTitleSchema.safeParse(title).success).toBe(false);
    },
  );

  it.each([' ', ' a '])(
    'rejects invalid update title %j',
    (title) => {
      expect(updateTitleSchema.safeParse(title).success).toBe(false);
    },
  );

  it('trims a valid create title', () => {
    expect(createTitleSchema.parse(' Bake sale ')).toBe('Bake sale');
  });

  it('trims a valid update title', () => {
    expect(updateTitleSchema.parse(' Bake sale ')).toBe('Bake sale');
  });
});
