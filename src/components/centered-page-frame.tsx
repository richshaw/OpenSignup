import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/**
 * The frame around the sign-in and connection pages: one narrow column,
 * centred on a full-height page, with the site footer under it. The footer
 * also gives each page its Privacy and Terms links, which a page that
 * collects or shows an email address should have.
 *
 * `gap` and `padding` are the spacing each page already had; they stay
 * separate props so moving a page onto the frame doesn't change its look.
 */
export function CenteredPageFrame({
  children,
  gap = 'gap-6',
  padding = 'py-16',
  header = false,
}: {
  children: React.ReactNode;
  gap?: 'gap-6' | 'gap-8';
  padding?: 'py-8' | 'py-16';
  /** Show the site name above the column. */
  header?: boolean;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col">
      {header ? <SiteHeader /> : null}
      <main className={`container-tight flex flex-1 flex-col justify-center ${gap} ${padding}`}>
        {children}
      </main>
      {/* Organizer pages, English until the organizer app has other languages. */}
      <SiteFooter locale="en" />
    </div>
  );
}
