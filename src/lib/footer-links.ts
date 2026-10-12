/**
 * Links an instance adds to the site footer, shown before Help. Empty here:
 * a deployment that serves pages of its own fills in its own copy of this
 * file, so every page can link to them without that deployment editing the
 * footer. Keep this file to the list alone, so such a copy merges cleanly
 * with later updates.
 */
export const FOOTER_LINKS: readonly { href: `/${string}`; label: string }[] = [];
