import type { ReactNode } from 'react';

type Kind = 'preview' | 'closed' | 'aiDraft';

const STYLES: Record<Kind, string> = {
  preview: 'bg-brand/10 text-brand',
  closed: 'bg-surface-sunk text-ink-muted',
  aiDraft: 'bg-brand/10 text-brand',
};

export function Banner({
  kind,
  title,
  body,
  action,
  onDismiss,
  live = true,
}: {
  kind: Kind;
  title: string;
  body: string;
  /**
   * What the organizer can do about it, such as the closed banner's Reopen
   * signup: under the text, at its left, on every width. Never at the
   * banner's right edge, where Close signup's confirm button was a moment
   * before the closed banner appeared.
   */
  action?: ReactNode;
  onDismiss?: () => void;
  /**
   * A live region (`role="status"`) unless false: for a banner that says what
   * the page is, where the change that put it there is announced already.
   */
  live?: boolean;
}) {
  return (
    <div
      role={live ? 'status' : undefined}
      className={`flex items-start gap-3 rounded-lg px-5 py-4 ${STYLES[kind]}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm">{body}</p>
        {/* 12px under the body: space-y-1's 4px top margin, which outranks
            an mt-* here, and this 8px. */}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
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
