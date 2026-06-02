'use client';

import { Check, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { ErrorCode } from '@/lib/errors';
import type { SaveStatus } from './useGridState';

type SaveStatusProps = {
  status: SaveStatus;
};

const ERROR_MESSAGE: Record<ErrorCode, string> = {
  forbidden: 'You no longer have edit access.',
  unauthorized: 'Sign in again to save.',
  conflict: 'Reload to see the latest changes.',
  capacity_full: 'Slot is full.',
  closed: 'Sign-up is closed.',
  not_found: 'No longer available.',
  invalid_input: 'Some values weren\u2019t accepted.',
  rate_limited: 'Slow down \u2014 try again in a moment.',
  already_consumed: 'Already used.',
  internal: 'Save failed.',
};

function messageFor(code: ErrorCode, override?: string): string {
  return override ?? ERROR_MESSAGE[code];
}

export function SaveStatus({ status }: SaveStatusProps) {

  if (status.kind === 'idle') return null;

  if (status.kind === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
        <Spinner className="size-3 border-[1.5px]" />
        Saving&hellip;
      </span>
    );
  }

  if (status.kind === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
        <Check size={11} />
        Saved
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-danger" role="status">
      <AlertCircle size={12} />
      {messageFor(status.code, status.message)}
    </span>
  );
}
