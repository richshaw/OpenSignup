import { describe, expect, it } from 'vitest';
import { connectedAppsLines } from '@/app/(organizer)/app/(chrome)/settings/connected-apps/refusal-lines';
import { removeRefusal } from '@/app/(organizer)/app/(chrome)/signups/[id]/responses/remove-refusal';
import { statusRefusal } from '@/app/(organizer)/app/(chrome)/signups/[id]/status-refusal';
import { inputMessage } from '@/app/s/[slug]/input-message';
import { saveErrorMessage } from '@/components/build-shared/save-error-message';
import { explainDraftFailure } from '@/components/magic-compose/draft-errors';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import type { Namespace } from '@/i18n/translator';
import type { FollowUp } from '@/lib/magic-compose/questions';
import { httpStatusFor, type ErrorCode, type ErrorReason, type ServiceError } from './errors';
import { refusalFromQuery, refusalText } from './organizer-errors';
import { ERROR_CODES } from './testing/error-codes';

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
 * Every screen's words come from the catalog (`organizer.errors`,
 * `organizer.build`, `organizer.compose.errors`, `organizer.signup.refusal`),
 * in the organizer's language: the last block below checks that for every
 * code and reason.
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
/**
 * Reasons the sign-in pages word (`auth.login.code`), before anyone is signed
 * in, in the site's language: the login-code box's refusals (#948).
 */
type SignInReason = Extract<ErrorReason, 'code_malformed' | 'code_invalid' | 'code_expired'>;
type OrganizerReason = Exclude<
  ErrorReason,
  (typeof PARTICIPANT_REASONS)[number] | (typeof API_ONLY_REASONS)[number] | SignInReason
>;

const t = getTestTranslator('organizer.errors');
/** The header's refusals, in English. */
const header = { signup: getTestTranslator('organizer.signup.refusal'), errors: t };

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
    english: "Some slots have values that don't fit this change. Change those first.",
  },
  status_changed: {
    error: sent('conflict', 'status_changed', { field: 'status' }),
    screens: {
      Publish: (error) => statusRefusal(error, 'publish', header),
      'Close signup': (error) => statusRefusal(error, 'close', header),
      'Reopen signup': (error) => statusRefusal(error, 'reopen', header),
    },
    english: 'This signup changed since the page loaded. Reload to see the latest.',
  },
  no_slots: {
    error: sent('conflict', 'no_slots', { field: 'slots' }),
    screens: { Publish: (error) => statusRefusal(error, 'publish', header) },
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
    it('names at least one screen that words it', () => {
      expect(Object.keys(screens)).not.toHaveLength(0);
    });

    it.each(Object.entries(screens))('has words of its own on %s', (_screen, words) => {
      const said = words(error);
      expect(said).toBe(english);
      expect(said).not.toBe(t(`code.${error.code}`));
      if (reason !== 'refusal') expect(said).not.toContain('Server');
    });
  });

  it('leaves slot_has_signups to API callers: the Build tab would give it its code’s line', () => {
    for (const reason of API_ONLY_REASONS) {
      const error = sent('conflict', reason, { field: 'slotId', details: { filled: 2 } });
      expect(buildTab(error)).toBe(t('code.conflict'));
    }
  });

  it('includes the reopen line for a signup with no slots', () => {
    expect(statusRefusal(CASES.no_slots.error, 'reopen', header)).toBe(
      'Add a slot before reopening.',
    );
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

/**
 * Each organizer screen's refusal, from translators that answer every key
 * with where it was asked for ("organizer.errors.code.forbidden in xx"). So
 * any words that don't come from the catalog in the organizer's language
 * show up here: English written into a helper, as a viewer's refusal in the
 * header once was, or the server's `message`. Only Magic Compose's
 * `refusal` is let through, since its words are the AI's own.
 */
describe('every organizer refusal comes from the catalog', () => {
  const inOther = <N extends Namespace>(namespace: N) => getStandInTranslator('xx', namespace);
  const errors = inOther('organizer.errors');
  const signup = { signup: inOther('organizer.signup.refusal'), errors };
  const compose = { compose: inOther('organizer.compose.errors'), errors };
  const drafted = (error: ServiceError, followUp?: FollowUp) => {
    const opts = followUp ? { followUp } : {};
    const said = explainDraftFailure(httpStatusFor(error.code), error, compose, opts);
    return said.kind === 'message' ? said.text : 'the hourly limit, which has its own words';
  };
  const SCREENS: Record<string, (error: ServiceError) => string | null> = {
    'New signup': (error) => refusalText(errors, error),
    'account Settings and a signup’s Settings tab': (error) => refusalFromQuery(errors, error.code),
    'Connected apps': (error) => refusalFromQuery(errors, error.code, connectedAppsLines(errors)),
    Publish: (error) => statusRefusal(error, 'publish', signup),
    'Close signup': (error) => statusRefusal(error, 'close', signup),
    'Reopen signup': (error) => statusRefusal(error, 'reopen', signup),
    Remove: (error) =>
      removeRefusal(error.code, { responses: inOther('organizer.responses'), errors }),
    'Build tab': (error) => saveErrorMessage(error, { build: inOther('organizer.build'), errors }),
    'Magic Compose': (error) => drafted(error),
    'Magic Compose questions': (error) => drafted(error, answered),
  };
  const REASONS = [undefined, ...(Object.keys(CASES) as OrganizerReason[]), ...API_ONLY_REASONS];

  it.each(Object.entries(SCREENS))('on %s, for every code and reason', (screen, words) => {
    for (const code of ERROR_CODES) {
      for (const reason of REASONS) {
        if (reason === 'refusal' && screen.startsWith('Magic Compose')) continue;
        const error: ServiceError = {
          code,
          message: 'Server words',
          suggestion: 'Server suggestion',
          details: reason ? { reason, taken: 2, count: 1 } : {},
        };
        expect(words(error), `${code}, ${reason ?? 'no reason'}`).toMatch(
          /^organizer\.[\w.]+ in xx$/,
        );
      }
    }
  });
});
