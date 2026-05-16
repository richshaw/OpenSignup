type Kind = 'preview' | 'closed' | 'aiDraft';

const STYLES: Record<Kind, string> = {
  preview: 'bg-brand/10 text-brand',
  closed: 'bg-surface-sunk text-ink-muted',
  aiDraft: 'bg-brand/10 text-brand',
};

export interface BannerAction {
  label: string;
  href: string;
}

export function Banner({
  kind,
  title,
  body,
  onDismiss,
  action,
}: {
  kind: Kind;
  title: string;
  body: string;
  onDismiss?: () => void;
  action?: BannerAction;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg px-5 py-4 ${STYLES[kind]}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm">{body}</p>
      </div>
      {(action || onDismiss) && (
        <div className="flex flex-shrink-0 items-center gap-2">
          {action && (
            <a
              href={action.href}
              className="rounded-md border border-current/20 px-3 py-1 text-sm font-medium hover:bg-current/10"
            >
              {action.label}
            </a>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="rounded-md p-1 text-current/70 hover:bg-current/10 hover:text-current"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
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
      )}
    </div>
  );
}
