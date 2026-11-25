/**
 * The id of the hidden note, "Opens in a new tab", that an embedded signup
 * (`/s/[slug]/embed`) puts on its page once, for every link that leaves the
 * sheet to describe itself with.
 */
export const NEW_TAB_NOTE_ID = 'embed-new-tab-note';

/**
 * What a link that leaves an embedded signup carries: it opens a new tab, so
 * the next page is never shown inside the other website's frame, where only
 * the embed's own address may be (`next.config.mjs`), and a screen reader
 * hears that it does. `noopener` keeps the new tab from reaching the frame.
 */
export const NEW_TAB = {
  target: '_blank',
  rel: 'noopener',
  'aria-describedby': NEW_TAB_NOTE_ID,
} as const;
