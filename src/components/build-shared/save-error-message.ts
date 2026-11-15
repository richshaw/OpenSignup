import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-notice';
import { MIN_DATE_YEAR } from '@/lib/reminder-fields';
import { TITLE_TOO_SHORT_MESSAGE } from '@/lib/signup-limits';
import type { SaveError } from './useBuildState';

/**
 * What the Build tab's rail says when a save is refused: its own words for
 * each refusal the tab can meet that it words itself, chosen by the error's
 * `details.reason` (see `ErrorReason`), else the line for its code
 * (`SAVE_ERROR_MESSAGE`). Never the server's `message`, which is English for
 * API callers. Each line reads as the rail read before there were reasons.
 * They move into the catalog with the rest of the Build tab's text.
 *
 * A reason whose words name a value the error doesn't carry gets its code's
 * line, rather than words with a gap in them.
 */
export function saveErrorMessage(error: SaveError): string {
  const details = error.details ?? {};
  switch (details.reason) {
    case 'title_too_short':
      return TITLE_TOO_SHORT_MESSAGE;
    // `field` is the date field's ref, as the rail has always printed it.
    case 'date_too_early':
      if (error.field) return `"${error.field}" must be a date in ${MIN_DATE_YEAR} or later`;
      break;
    case 'slot_ids_mismatch':
      return "The slots changed in another window, so your move wasn't saved. Drag it again.";
    case 'field_ids_mismatch':
      return "The fields changed in another window, so your move wasn't saved. Drag it again.";
    case 'slot_has_signups': {
      const filled = details.filled;
      if (typeof filled === 'number') {
        return `${filled} ${filled === 1 ? 'person has' : 'people have'} signed up for this slot`;
      }
      break;
    }
    case 'capacity_below_taken':
      if (typeof error.received === 'number' && typeof details.taken === 'number') {
        return `capacity (${error.received}) is less than active quantity (${details.taken})`;
      }
      break;
    case 'invalidates_slot_values':
      return 'change would invalidate existing slot values';
  }
  return SAVE_ERROR_MESSAGE[error.code] ?? SAVE_ERROR_MESSAGE.internal;
}
