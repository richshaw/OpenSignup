import Link from 'next/link';
import { Download, Eye } from 'lucide-react';
import PublicLinkChip from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';

interface SignupHeaderProps {
  signupId: string;
  title: string;
  description: string | null;
  status: string;
  publicUrl: string;
  publishAction: () => void | Promise<void>;
}

export function SignupHeader({
  signupId,
  title,
  description,
  status,
  publicUrl,
  publishAction,
}: SignupHeaderProps) {
  const previewHref = `/app/signups/${signupId}/preview`;
  const exportHref = `/api/signups/${signupId}/export.csv`;

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
            <StatusPill status={status} />
          </div>
          <div className="mt-3">
            <PublicLinkChip url={publicUrl} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-surface-raised inline-flex items-center gap-2 rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition"
          >
            <Eye size={16} aria-hidden="true" />
            Preview
          </Link>
          <Link
            href={exportHref}
            className="hover:bg-surface-raised inline-flex items-center gap-2 rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition"
          >
            <Download size={16} aria-hidden="true" />
            Export
          </Link>
          {status === 'draft' ? (
            <form action={publishAction}>
              <button
                type="submit"
                className="bg-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Publish
              </button>
            </form>
          ) : null}
        </div>
      </div>
      {description ? (
        <p className="text-ink-muted max-w-2xl text-sm leading-relaxed">{description}</p>
      ) : null}
    </header>
  );
}
