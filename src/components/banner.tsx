import type { ReactNode } from 'react';

type Kind = 'preview' | 'closed' | 'aiDraft' | 'offer';

const STYLES: Record<Kind, string> = {
  preview: 'bg-brand/10 text-brand',
  closed: 'bg-surface-sunk text-ink-muted',
  aiDraft: 'bg-brand/10 text-brand',
  // Darker text than Preview's, for 4.5:1 on the tint (WCAG AA); brand is 4.07:1.
  offer: 'bg-brand/10 text-brand-hover',
};

/** A ✕ that closes the banner, or none. */
type Dismiss =
  | { onDismiss?: undefined; dismissLabel?: undefined }
  | {
      onDismiss: () => void;
      /**
       * The ✕'s name for a screen reader, such as "Dismiss", in the page's
       * language. A prop rather than a translation hook, because organizer
       * pages show banners too, and they have no messages provider.
       */
      dismissLabel: string;
    };

/**
 * A coloured notice near the top of a page, such as Preview or Closed. All its
 * text comes from the caller, already in the page's language. `children` go
 * under the body: the buttons that answer an offer, say.
 */
export function Banner({
  kind,
  title,
  body,
  children,
  onDismiss,
  dismissLabel,
  live = true,
}: {
  kind: Kind;
  /**
   * Usually a string. A node lets the title carry its own twin in another
   * language, marked with `lang`, as the notice offering Swedish does.
   */
  title: ReactNode;
  body: string;
  children?: ReactNode;
  /**
   * A live region (`role="status"`) unless false: for a banner that says what
   * the page is, where the change that put it there is announced already.
   */
  live?: boolean;
} & Dismiss) {
  return (
    <div
      role={live ? 'status' : undefined}
      className={`flex items-start gap-3 rounded-lg px-5 py-4 ${STYLES[kind]}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm">{body}</p>
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="text-current/70 hover:bg-current/10 flex-shrink-0 rounded-md p-1 hover:text-current"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
