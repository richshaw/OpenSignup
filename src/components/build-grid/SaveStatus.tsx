'use client';

import { Check, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { SaveStatus } from './useGridState';

type SaveStatusProps = {
  status: SaveStatus;
};

export function SaveStatus({ status }: SaveStatusProps) {

  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
        <Spinner className="size-3 border-[1.5px]" />
        Saving…
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
        <Check size={12} />
        Saved
      </span>
    );
  }

  // error
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-danger">
      <AlertCircle size={12} />
      Save failed
    </span>
  );
}
