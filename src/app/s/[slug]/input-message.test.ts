import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { getTranslator } from '@/i18n/translator';
import type { ErrorReason } from '@/lib/errors';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, QUANTITY_MAX } from '@/lib/participant-limits';
import { inputMessage } from './input-message';

const t = getTestTranslator('participant.errors');
/** The Swedish catalog, failing the test on a missing key. */
const sv = getTranslator('sv', 'participant.errors', {
  onError: (error) => {
    throw error;
  },
});

/** An `invalid_input` as the server sends it, its English text included. */
const refused = (reason?: string) => ({
  code: 'invalid_input',
  message: 'Invalid email',
  suggestion: 'Check the value of "email".',
  ...(reason === undefined ? {} : { details: { reason } }),
});

// Every reason the sign-up and edit endpoints send (src/lib/errors.ts), in
// English and in Swedish.
type Copy = { message: string; suggestion?: string };
const REASONS: readonly (readonly [ErrorReason, Copy, Copy])[] = [
  [
    'email_required',
    { message: 'This signup now needs an email address.', suggestion: 'Add yours and try again.' },
    {
      message: 'Den här anmälningslistan kräver nu en e-postadress.',
      suggestion: 'Fyll i din e-postadress och försök igen.',
    },
  ],
  [
    'email_invalid',
    { message: "That email address doesn't look right.", suggestion: 'Check it and try again.' },
    { message: 'E-postadressen ser inte rätt ut.', suggestion: 'Kontrollera den och försök igen.' },
  ],
  [
    'name_required',
    { message: `Enter your name, up to ${NAME_MAX_LENGTH} characters.` },
    { message: `Skriv ditt namn, högst ${NAME_MAX_LENGTH} tecken.` },
  ],
  [
    'name_too_long',
    { message: `Enter your name, up to ${NAME_MAX_LENGTH} characters.` },
    { message: `Skriv ditt namn, högst ${NAME_MAX_LENGTH} tecken.` },
  ],
  [
    'notes_too_long',
    { message: `Shorten your notes to ${NOTES_MAX_LENGTH} characters or fewer.` },
    { message: `Korta kommentaren till högst ${NOTES_MAX_LENGTH} tecken.` },
  ],
  ...(['quantity_too_small', 'quantity_too_large', 'quantity_not_whole'] as const).map(
    (reason) =>
      [
        reason,
        { message: `Enter a whole number of spots, from 1 to ${QUANTITY_MAX}.` },
        { message: `Ange ett helt antal platser, från 1 till ${QUANTITY_MAX}.` },
      ] as const,
  ),
];

describe('inputMessage', () => {
  it.each(REASONS)('words %s in English and Swedish', (reason, english, swedish) => {
    expect(inputMessage(refused(reason), t)).toStrictEqual(english);
    expect(inputMessage(refused(reason), sv)).toStrictEqual(swedish);
  });

  it('says to check the form for a reason it does not know, or none', () => {
    const general = { message: 'Check what you entered and try again.' };
    for (const reason of [undefined, 'phone_invalid', 'refusal']) {
      expect(inputMessage(refused(reason), t)).toStrictEqual(general);
      expect(inputMessage(refused(reason), sv)).toStrictEqual({
        message: 'Kontrollera det du har fyllt i och försök igen.',
      });
    }
    // A body over the size limit: its `details` hold the limit, not a reason.
    const tooLarge: { code: string; details: Record<string, unknown> } = {
      code: 'invalid_input',
      details: { maxBytes: 1_000_000 },
    };
    expect(inputMessage(tooLarge, t)).toStrictEqual(general);
  });

  it('takes its lines from the translator it is given', () => {
    const standIn = getStandInTranslator('sv', 'participant.errors');
    expect(inputMessage(refused('email_invalid'), standIn)).toStrictEqual({
      message: 'participant.errors.email.invalid in sv',
      suggestion: 'participant.errors.email.check in sv',
    });
    expect(inputMessage(refused(), standIn)).toStrictEqual({
      message: 'participant.errors.input in sv',
    });
  });

  it('never words the server’s own text', () => {
    for (const [reason] of REASONS) {
      const words = JSON.stringify(inputMessage(refused(reason), t));
      expect(words).not.toContain('Invalid email');
      expect(words).not.toContain('Check the value');
    }
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(inputMessage({ code: 'closed', details: { reason: 'email_invalid' } }, t)).toBeNull();
    expect(inputMessage({ code: 'conflict' }, t)).toBeNull();
    expect(inputMessage({}, t)).toBeNull();
    expect(inputMessage(null, t)).toBeNull();
    expect(inputMessage(undefined, t)).toBeNull();
  });
});
