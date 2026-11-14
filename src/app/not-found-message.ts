/**
 * The site's 404 (`./global-not-found.tsx`), for an address no page matches:
 * a link mistyped or cut short, or a page that has gone. A signup's own pages
 * have their own (`./s/[slug]/not-found.tsx`).
 */
export const NOT_FOUND_PAGE = {
  tabTitle: 'Page not found',
  title: 'Sorry, we can’t find this page',
  body: 'Check the address for typos. If someone sent you the link, ask them for a new one.',
  action: { label: 'Go to the home page', href: '/' },
} as const;
