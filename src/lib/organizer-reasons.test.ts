import { describe, expect, it } from 'vitest';
import { statusRefusal } from '@/app/app/(chrome)/signups/[id]/status-refusal';
import { inputMessage } from '@/app/s/[slug]/input-message';
import { saveErrorMessage } from '@/components/build-shared/save-error-message';
import { explainDraftFailure } from '@/components/magic-compose/draft-errors';
import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-errors';
import { getTestTranslator } from '@/i18n/testing/translator';
import type { FollowUp } from '@/lib/magic-compose/questions';
import type { ErrorCode, ErrorReason, ServiceError } from './errors';
import { refusalText } from './organizer-errors';

/**
 * Every `ErrorReason` an organizer screen can receive, with the screens that
 * word it and what each says. The participant pages word the rest
 * (`inputMessage` in src/app/s/[slug]/input-message.ts). A reason added to
 * `ErrorReason` fails the type check here until it's listed on one side or
 * the other.
 *
 * Each screen must say something of its own for each reason, never the line
 * for the code, which is what a refusal with no words of its own falls back
 * on, and never the server's `message`, which is English for API callers
 * (but for a `refusal`, whose message is the AI's own explanation). The
 * English is as each screen read before there were reasons, but for three
 * Build tab lines worded for organizers rather than developers (#944):
 * `date_too_early`, `capacity_below_taken` and `invalidates_slot_values`.
 *
 * The New signup form's, the Build tab's and Magic Compose's words come from
 * the catalog (`organizer.errors`, `organizer.build`,
 * `organizer.compose.errors`), in the organizer's language. The header's are
 * still written in its components, and move into the catalog with the rest
 * of its text.
 */
const PARTICIPANT_REASONS = [
  'email_required',
  'email_invalid',
  'name_required',
  'name_too_long',
  'notes_too_long',
  'quantity_too_small',
  'quantity_too_large',
  'quantity_not_whole',
] as const satisfies readonly ErrorReason[];
/**
 * Reasons only API callers get, which no screen words: `slot_has_signups`
 * refuses deleting a slot people hold unless the caller forces it, and the
 * Build tab's Delete always forces (`DELETE /api/slots/[id]`), so only the AI
 * connector's `delete_slot` meets it.
 */
const API_ONLY_REASONS = ['slot_has_signups'] as const satisfies readonly ErrorReason[];
type OrganizerReason = Exclude<
  ErrorReason,
  (typeof PARTICIPANT_REASONS)[number] | (typeof API_ONLY_REASONS)[number]
>;

/** What the server sends, its English `message` and `suggestion` swapped for words no screen may show. */
const sent = (
  code: ErrorCode,
  reason: ErrorReason,
  more: Omit<ServiceError, 'code' | 'message' | 'details'> & { details?: object } = {},
) => ({
  ...more,
  code,
  message: 'Server words',
  suggestion: 'Server suggestion',
  details: { ...more.details, reason },
});

const t = getTestTranslator('organizer.errors');
const buildTab = (error: ReturnType<typeof sent>) =>
  saveErrorMessage(error, { build: getTestTranslator('organizer.build'), errors: t });
const answered: FollowUp = { what: { picked: ['Bake something'], added: [] } };
const draftText = (status: number, error: ReturnType<typeof sent>, followUp?: FollowUp) => {
  const translators = { compose: getTestTranslator('organizer.compose.errors'), errors: t };
  const said = explainDraftFailure(status, error, translators, followUp ? { followUp } : {});
  return said.kind === 'message' ? said.text : `hourly limit, ${said.minutes} minutes`;
};

type Case = {
  error: ReturnType<typeof sent>;
  /** Each screen that receives it, and what that screen says. */
  screens: Record<string, (error: ReturnType<typeof sent>) => string>;
  english: string;
};

const CASES = {
  title_too_short: {
    error: sent('invalid_input', 'title_too_short', { field: 'title' }),
    screens: {
      'New signup': (error) => refusalText(t, error),
      'Build tab': buildTab,
    },
    english: 'Title must be at least 2 characters.',
  },
  date_too_early: {
    error: sent('invalid_input', 'date_too_early', { field: 'date', received: '1899-12-31' }),
    screens: { 'Build tab': buildTab },
    english: 'Dates must be in 1900 or later.',
  },
  slot_ids_mismatch: {
    error: sent('invalid_input', 'slot_ids_mismatch', { field: 'slotIds' }),
    screens: { 'Build tab': buildTab },
    english: "The slots changed in another window, so your move wasn't saved. Drag it again.",
  },
  field_ids_mismatch: {
    error: sent('invalid_input', 'field_ids_mismatch', { field: 'fieldIds' }),
    screens: { 'Build tab': buildTab },
    english: "The fields changed in another window, so your move wasn't saved. Drag it again.",
  },
  capacity_below_taken: {
    error: sent('conflict', 'capacity_below_taken', {
      field: 'capacity',
      received: 1,
      details: { taken: 2 },
    }),
    screens: { 'Build tab': buildTab },
    english: '2 spots are already taken. Set this slot to 2 or more.',
  },
  invalidates_slot_values: {
    error: sent('conflict', 'invalidates_slot_values', { details: { count: 1 } }),
    screens: { 'Build tab': buildTab },
    english: 'Some slots have values that don’t fit this change. Change those first.',
  },
  status_changed: {
    error: sent('conflict', 'status_changed', { field: 'status' }),
    screens: {
      Publish: (error) => statusRefusal(error, 'publish'),
      'Close signup': (error) => statusRefusal(error, 'close'),
      'Reopen signup': (error) => statusRefusal(error, 'reopen'),
    },
    english: 'This signup changed since the page loaded. Reload to see the latest.',
  },
  no_slots: {
    error: sent('conflict', 'no_slots', { field: 'slots' }),
    screens: { Publish: (error) => statusRefusal(error, 'publish') },
    english: 'Add a slot before publishing.',
  },
  draft_invalid: {
    error: sent('internal', 'draft_invalid'),
    screens: { 'Magic Compose': (error) => draftText(500, error) },
    english: 'AI draft did not match expected shape — try again or adjust your prompt',
  },
  asked_again: {
    error: sent('invalid_input', 'asked_again'),
    screens: { 'Magic Compose questions': (error) => draftText(400, error, answered) },
    english: "Couldn't draft from these answers. Add a little more, or fill it in by hand.",
  },
  refusal: {
    error: { ...sent('invalid_input', 'refusal'), message: 'The AI’s own reason.' },
    screens: { 'Magic Compose': (error) => draftText(400, error) },
    english: 'The AI’s own reason.',
  },
} satisfies Record<OrganizerReason, Case>;

describe('every reason an organizer screen can receive', () => {
  describe.each(Object.entries(CASES))('%s', (reason, { error, screens, english }) => {
    it.each(Object.entries(screens))('has words of its own on %s', (_screen, words) => {
      const said = words(error);
      expect(said).toBe(english);
      expect(said).not.toBe(SAVE_ERROR_MESSAGE[error.code]);
      if (reason !== 'refusal') expect(said).not.toContain('Server');
    });
  });

  it('leaves slot_has_signups to API callers: the Build tab would give it its code’s line', () => {
    for (const reason of API_ONLY_REASONS) {
      const error = sent('conflict', reason, { field: 'slotId', details: { filled: 2 } });
      expect(buildTab(error)).toBe(SAVE_ERROR_MESSAGE.conflict);
    }
  });

  it('includes the reopen line for a signup with no slots', () => {
    expect(statusRefusal(CASES.no_slots.error, 'reopen')).toBe('Add a slot before reopening.');
  });

  it('leaves the rest to the participant pages, which word each one', () => {
    const participant = getTestTranslator('participant.errors');
    const general = inputMessage({ code: 'invalid_input' }, participant);
    for (const reason of PARTICIPANT_REASONS) {
      const said = inputMessage({ code: 'invalid_input', details: { reason } }, participant);
      expect(said, reason).not.toEqual(general);
    }
  });
});
