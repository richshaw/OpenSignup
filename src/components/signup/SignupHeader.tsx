import Link from 'next/link';
import { Download, Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';
import { MobileSignupHeader } from './MobileSignupHeader';
import { StatusActionForm, type StatusAction } from './StatusActionForm';

interface SignupHeaderProps {
  signupId: string;
  title: string;
  status: SignupStatus;
  publicUrl: string;
  publishAction: StatusAction;
  closeAction: StatusAction;
}

export function SignupHeader({
  signupId,
  title,
  status,
  publicUrl,
  publishAction,
  closeAction,
}: SignupHeaderProps) {
  const previewHref = `/app/signups/${signupId}/preview`;
  const exportHref = `/api/signups/${signupId}/export.csv`;
  const hasActionButton = status === 'draft' || status === 'open';
  const buttonCount = hasActionButton ? 3 : 2;
  const gridColsClass = buttonCount === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <>
      <div className="md:hidden">
        <MobileSignupHeader
          signupId={signupId}
          title={title}
          status={status}
          publicUrl={publicUrl}
          publishAction={publishAction}
          closeAction={closeAction}
        />
      </div>
      <header className="hidden space-y-3 md:block">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex min-h-[1.875rem] flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
            <StatusPill status={status} />
          </div>
          <PublicLinkChip url={publicUrl} className="inline-flex max-w-md" />
        </div>
        <div className={`grid w-full max-w-full shrink-0 ${gridColsClass} gap-x-2 gap-y-3 sm:w-auto sm:max-w-sm`}>
          <Link
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-surface-raised inline-flex w-full items-center justify-center gap-2 rounded-lg border border-surface-sunk px-3 py-1.5 text-xs font-medium transition"
          >
            <Eye size={14} aria-hidden="true" />
            Preview
          </Link>
          <Link
            href={exportHref}
            className="hover:bg-surface-raised inline-flex w-full items-center justify-center gap-2 rounded-lg border border-surface-sunk px-3 py-1.5 text-xs font-medium transition"
          >
            <Download size={14} aria-hidden="true" />
            Export
          </Link>
          {status === 'draft' ? (
            <StatusActionForm
              action={publishAction}
              className="contents"
              errorClassName="col-span-full"
            >
              <AsyncSubmitButton
                loadingLabel="Publishing…"
                className="bg-brand inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
              >
                Publish
              </AsyncSubmitButton>
            </StatusActionForm>
          ) : null}
          {status === 'open' ? (
            <StatusActionForm
              action={closeAction}
              className="contents"
              errorClassName="col-span-full"
            >
              <AsyncSubmitButton
                loadingLabel="Closing…"
                className="bg-brand inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
              >
                Close signup
              </AsyncSubmitButton>
            </StatusActionForm>
          ) : null}
        </div>
      </div>
      </header>
    </>
  );
}
