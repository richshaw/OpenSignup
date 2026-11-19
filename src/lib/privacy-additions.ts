/**
 * What an instance adds to the privacy page, for what it does beyond
 * OpenSignup: a kind of email of its own, say. Empty here: a deployment that
 * does more fills in its own copy of this file, and the page then shows these
 * sections under "Added on this site" and points to them wherever it would
 * otherwise read as the whole story (the emails it sends, why it uses data,
 * how long it keeps it). Each section should say what it collects or sends,
 * why (its lawful basis), and how long it's kept. Plain text only.
 *
 * Keep this file to the value and its type, so such a copy merges cleanly
 * with later updates.
 */
type PrivacyAdditions = {
  /** When these sections last changed, as YYYY-MM-DD. "Last updated" shows the later of this and the page's own date. */
  lastUpdated: string;
  sections: readonly { heading: string; paragraphs: readonly string[] }[];
};

export const PRIVACY_ADDITIONS: PrivacyAdditions | null = null;
