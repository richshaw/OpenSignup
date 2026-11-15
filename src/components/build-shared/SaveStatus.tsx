'use client';

import { AlertCircle } from 'lucide-react';
import { SavedNotice } from '@/components/ui/save-notice';
import { Spinner } from '@/components/ui/spinner';
import { saveErrorMessage } from './save-error-message';
import type { SaveStatus } from './useBuildState';

type SaveStatusProps = {
  status: SaveStatus;
};

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

  if (status.kind === 'saved') return <SavedNotice>Saved</SavedNotice>;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-danger" role="status">
      <AlertCircle size={12} />
      {saveErrorMessage(status)}
    </span>
  );
}
