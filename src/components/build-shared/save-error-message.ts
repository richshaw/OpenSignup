import type { Translator } from '@/i18n/translator';
import { MIN_DATE_YEAR } from '@/lib/reminder-fields';
import { TITLE_MIN_LENGTH } from '@/lib/signup-limits';
import type { SaveError } from './useBuildState';

/**
 * The messages the rail words a refusal with, in the organizer's language:
 * the Build tab's own (`organizer.build`), and the lines the pages rendered on
 * the server use too (`organizer.errors`).
 */
export type RefusalTranslators = {
  build: Translator<'organizer.build'>;
  errors: Translator<'organizer.errors'>;
};

/**
 * What the Build tab's rail says when a save is refused: its own words for
 * each refusal the tab can meet that it words itself, chosen by the error's
 * `details.reason` (see `ErrorReason`), else the line for its code
 * (`organizer.errors.code`). Never the server's `message`, which is English
 * for API callers. In English most lines read as the rail read before there
 * were reasons; the capacity, field change and 1900 lines are worded for
 * organizers rather than developers (#944), and the 1900 line no longer
 * prints the date field's ref.
 *
 * A reason whose words name a value the error doesn't carry gets its code's
 * line, rather than words with a gap in them, and a code the catalog doesn't
 * know gets the line for `internal`. `slot_has_signups` never reaches the
 * tab: its Delete always forces (`DELETE /api/slots/[id]`), so only the AI
 * connector's `delete_slot` is refused with it, and it gets its code's line
 * like any reason the tab doesn't word.
 */
export function saveErrorMessage(error: SaveError, { build, errors }: RefusalTranslators): string {
  const details = error.details ?? {};
  switch (details.reason) {
    case 'title_too_short':
      return errors('titleTooShort', { min: TITLE_MIN_LENGTH });
    case 'date_too_early':
      return build('refusal.dateTooEarly', { year: MIN_DATE_YEAR });
    case 'slot_ids_mismatch':
      return build('refusal.slotsMoved');
    case 'field_ids_mismatch':
      return build('refusal.fieldsMoved');
    case 'capacity_below_taken':
      if (typeof details.taken === 'number') {
        return build('refusal.capacityBelowTaken', { taken: details.taken });
      }
      break;
    case 'invalidates_slot_values':
      return build('refusal.invalidatesSlotValues');
  }
  return errors.has(`code.${error.code}`) ? errors(`code.${error.code}`) : errors('code.internal');
}
