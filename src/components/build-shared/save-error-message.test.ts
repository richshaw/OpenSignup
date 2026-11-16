import { describe, expect, it } from 'vitest';
import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-errors';
import { fromZodError, type ErrorCode } from '@/lib/errors';
import { SIGNUP_INPUT_REASONS, SignupUpdateInputSchema } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { everyIdOnceError } from '@/services/reorder-ids';
import { validateSlotValues } from '@/services/slot-fields';
import { saveErrorMessage } from './save-error-message';
import type { SaveError } from './useBuildState';

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

    expect(saveErrorMessage(kept(titleTooShort))).toBe(titleTooShort.message);
    expect(saveErrorMessage(kept(early.error))).toBe(early.error.message);
    expect(saveErrorMessage(kept(slots))).toBe(
      "The slots changed in another window, so your move wasn't saved. Drag it again.",
    );
    expect(saveErrorMessage(kept(fields))).toBe(
      "The fields changed in another window, so your move wasn't saved. Drag it again.",
    );
  });

  // The rest are refused inside a transaction; these are their messages, as
  // organizer-reasons.db.test.ts pins them.
  it.each([
    [
      { code: 'conflict', field: 'slotId', details: { reason: 'slot_has_signups', filled: 1 } },
      '1 person has signed up for this slot',
    ],
    [
      { code: 'conflict', field: 'slotId', details: { reason: 'slot_has_signups', filled: 3 } },
      '3 people have signed up for this slot',
    ],
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
    expect(saveErrorMessage(error)).toBe(english);
  });

  it('gives a reason whose words lack their value the line for its code', () => {
    expect(saveErrorMessage({ code: 'invalid_input', details: { reason: 'date_too_early' } })).toBe(
      'Some values weren’t accepted.',
    );
    expect(saveErrorMessage({ code: 'conflict', details: { reason: 'slot_has_signups' } })).toBe(
      'Reload to see the latest changes.',
    );
    expect(
      saveErrorMessage({
        code: 'conflict',
        received: 1,
        details: { reason: 'capacity_below_taken' },
      }),
    ).toBe('Reload to see the latest changes.');
  });

  it('gives every other refusal the line for its code, whatever its message said', () => {
    for (const code of Object.keys(SAVE_ERROR_MESSAGE) as ErrorCode[]) {
      expect(saveErrorMessage({ code })).toBe(SAVE_ERROR_MESSAGE[code]);
    }
    // A participant's reason, or one the tab doesn't know.
    expect(
      saveErrorMessage({ code: 'invalid_input', details: { reason: 'quantity_too_large' } }),
    ).toBe('Some values weren’t accepted.');
  });
});
