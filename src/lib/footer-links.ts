/**
 * Links an instance adds to the site footer, shown before Help. Empty here:
 * a deployment that serves pages of its own fills in its own copy of this
 * file, so every page can link to them without that deployment editing the
 * footer. Keep this file to the list and its type, so such a copy merges
 * cleanly with later updates.
 */
type FooterLink = { href: `/${string}`; label: string };

export const FOOTER_LINKS: readonly FooterLink[] = [];
