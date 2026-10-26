// The signup header's buttons, so Preview, Publish and share, Share and ⋯
// match: 36px tall on a computer, as the header's other controls are, and
// 48px in a phone's bar at the bottom of the screen.

/** A computer's header button: add `PRIMARY` or `OUTLINED`. */
export const HEADER_BUTTON =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] transition';

/** A phone bar's button, as wide as it can be: add `PRIMARY`. */
export const BAR_BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-[15px] transition';

/**
 * The header's one blue button: Publish and share on a draft, Share once
 * it's open, and Reopen signup once it's closed.
 */
export const PRIMARY =
  'bg-brand font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90';

/** Preview and ⋯. */
export const OUTLINED = 'border border-surface-sunk bg-white font-medium hover:bg-surface-raised';

/** An item in a phone's More actions sheet: Preview, Close signup, Reopen signup. */
export const SHEET_ITEM = 'flex w-full items-center gap-2 py-3.5 text-[15px] font-medium text-ink';
