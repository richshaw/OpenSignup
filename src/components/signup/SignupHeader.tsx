import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import type { SignupStatus } from '@/schemas/signups';
import { MobileSignupHeader } from './MobileSignupHeader';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  StatusActionScope,
  type StatusAction,
} from './StatusActionForm';

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
  const hasActionButton = status === 'draft' || status === 'open';
  const gridColsClass = hasActionButton ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <>
      <div className="md:hidden">
        <MobileSignupHeader
          title={title}
          status={status}
          publicUrl={publicUrl}
          publishAction={publishAction}
          closeAction={closeAction}
        />
      </div>
      {/* Publish or Close signup, whichever the status offers. A refusal shows
          on its own full-width line under the header, not in the button grid. */}
      <StatusActionScope action={status === 'draft' ? publishAction : closeAction}>
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
          {status === 'draft' ? (
            <StatusActionButtonForm>
              <AsyncSubmitButton
                loadingLabel="Publishing…"
                className="bg-brand inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
              >
                Publish
              </AsyncSubmitButton>
            </StatusActionButtonForm>
          ) : null}
          {status === 'open' ? (
            <StatusActionButtonForm>
              <AsyncSubmitButton
                loadingLabel="Closing…"
                className="bg-brand inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
              >
                Close signup
              </AsyncSubmitButton>
            </StatusActionButtonForm>
          ) : null}
        </div>
      </div>
      <StatusActionRefusal />
      </header>
      </StatusActionScope>
    </>
  );
}
