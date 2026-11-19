/**
 * What an instance adds to the privacy page, for what it does beyond the
 * OpenSignup software: a kind of email of its own, say. Empty here: a
 * deployment that does more fills in its own copy of this file. The page then
 * shows each section under "Added on this site", lists its `why` and `kept`
 * with the page's own reasons and retention periods, and points to the
 * sections wherever it would otherwise read as the whole story. Plain text
 * only.
 *
 * Keep this file to the value and its types, so such a copy merges cleanly
 * with later updates.
 */
type PrivacySection = {
  heading: string;
  paragraphs: readonly [string, ...string[]];
  /**
   * An item for "Why we use your data": what it's for, then what allows it,
   * as the page's own items say it. "To ask a new organizer how their first
   * signup went. (Our legitimate interest in helping organizers.)"
   */
  why: string;
  /** An item for "How long we keep it": what's kept, and for how long. */
  kept: string;
};

export type PrivacyAdditions = {
  /** When these sections last changed, as YYYY-MM-DD. "Last updated" shows the later of this and the page's own date. */
  lastUpdated: string;
  sections: readonly [PrivacySection, ...PrivacySection[]];
};

export const PRIVACY_ADDITIONS: PrivacyAdditions | null = null;
