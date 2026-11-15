import { describe, expect, it } from 'vitest';
import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-errors';
import { fromZodError, type ErrorCode } from '@/lib/errors';
import { SIGNUP_INPUT_REASONS, SignupUpdateInputSchema } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { everyIdOnceError } from '@/services/reorder-ids';
import { validateSlotValues } from '@/services/slot-fields';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { saveErrorMessage } from './save-error-message';
import type { SaveError } from './useBuildState';

/** What the rail says for `error` in English, from the catalog. */
const said = (error: SaveError) =>
  saveErrorMessage(error, {
    build: getTestTranslator('organizer.build'),
    errors: getTestTranslator('organizer.errors'),
  });

/** A refusal as the rail keeps it: the envelope without its `message` and `suggestion`. */
function kept({ code, field, received, details }: SaveError & { message?: string }): SaveError {
  return {
    code,
    ...(field !== undefined ? { field } : {}),
    ...(received !== undefined ? { received } : {}),
    ...(details !== undefined ? { details } : {}),
  };
}

const dateField: SlotFieldDefinition = {
  id: 'fld_date',
  ref: 'date',
  label: 'Date',
  fieldType: 'date',
  sortOrder: 0,
  config: { fieldType: 'date' },
};

describe('saveErrorMessage', () => {
  // Where the service's refusal can be made without a database, the rail's
  // words are checked against its `message`: the English the rail showed
  // before it worded refusals itself.
  it('words each refusal the services make as the rail read before', () => {
    const title = SignupUpdateInputSchema.safeParse({ title: ' ' });
    if (title.success) throw new Error('a blank title parsed');
    const titleTooShort = fromZodError(title.error, SIGNUP_INPUT_REASONS);
    const early = validateSlotValues([dateField], { date: '1899-12-31' });
    if (early.ok) throw new Error('1899 passed');
    const slots = everyIdOnceError(['a'], ['a', 'b'], 'slot');
    const fields = everyIdOnceError(['a'], ['a', 'b'], 'field');
    if (!slots || !fields) throw new Error('a short list passed');

    expect(said(kept(titleTooShort))).toBe(titleTooShort.message);
    expect(said(kept(early.error))).toBe(early.error.message);
    expect(said(kept(slots))).toBe(
      "The slots changed in another window, so your move wasn't saved. Drag it again.",
    );
    expect(said(kept(fields))).toBe(
      "The fields changed in another window, so your move wasn't saved. Drag it again.",
    );
  });

  // The rest are refused inside a transaction; these are their messages, as
  // organizer-reasons.db.test.ts pins them.
  it.each([
    [
      {
        code: 'conflict',
        field: 'capacity',
        received: 1,
        details: { reason: 'capacity_below_taken', taken: 2 },
      },
      'capacity (1) is less than active quantity (2)',
    ],
    [
      { code: 'conflict', details: { reason: 'invalidates_slot_values', count: 1 } },
      'change would invalidate existing slot values',
    ],
  ] as [SaveError, string][])('words %o as the rail read before', (error, english) => {
    expect(said(error)).toBe(english);
  });

  it('gives a reason whose words lack their value the line for its code', () => {
    expect(said({ code: 'invalid_input', details: { reason: 'date_too_early' } })).toBe(
      'Some values weren’t accepted.',
    );
    expect(
      said({
        code: 'conflict',
        received: 1,
        details: { reason: 'capacity_below_taken' },
      }),
    ).toBe('Reload to see the latest changes.');
  });

  it('gives every other refusal the line for its code, whatever its message said', () => {
    for (const code of Object.keys(SAVE_ERROR_MESSAGE) as ErrorCode[]) {
      expect(said({ code })).toBe(SAVE_ERROR_MESSAGE[code]);
    }
    // A deleted slot people hold, which only the AI connector is refused: the
    // tab's Delete always forces.
    expect(
      said({
        code: 'conflict',
        field: 'slotId',
        details: { reason: 'slot_has_signups', filled: 2 },
      }),
    ).toBe('Reload to see the latest changes.');
    // A participant's reason, or one the tab doesn't know.
    expect(said({ code: 'invalid_input', details: { reason: 'quantity_too_large' } })).toBe(
      'Some values weren’t accepted.',
    );
  });

  it('gives a code the catalog doesn’t know the line for internal', () => {
    expect(said({ code: 'teapot' as ErrorCode })).toBe('Save failed.');
  });

  it('takes every line from the catalog, in the translators’ language', () => {
    const swedish = {
      build: getStandInTranslator('sv', 'organizer.build'),
      errors: getStandInTranslator('sv', 'organizer.errors'),
    };
    const cases: [SaveError, string][] = [
      [
        { code: 'invalid_input', field: 'title', details: { reason: 'title_too_short' } },
        'organizer.errors.titleTooShort in sv',
      ],
      [
        { code: 'invalid_input', field: 'date', details: { reason: 'date_too_early' } },
        'organizer.build.refusal.dateTooEarly in sv',
      ],
      [
        { code: 'invalid_input', details: { reason: 'slot_ids_mismatch' } },
        'organizer.build.refusal.slotsMoved in sv',
      ],
      [
        { code: 'invalid_input', details: { reason: 'field_ids_mismatch' } },
        'organizer.build.refusal.fieldsMoved in sv',
      ],
      [
        { code: 'conflict', received: 1, details: { reason: 'capacity_below_taken', taken: 2 } },
        'organizer.build.refusal.capacityBelowTaken in sv',
      ],
      [
        { code: 'conflict', details: { reason: 'invalidates_slot_values' } },
        'organizer.build.refusal.invalidatesSlotValues in sv',
      ],
      [{ code: 'forbidden' }, 'organizer.errors.code.forbidden in sv'],
    ];
    for (const [error, words] of cases) expect(saveErrorMessage(error, swedish)).toBe(words);
  });
});
