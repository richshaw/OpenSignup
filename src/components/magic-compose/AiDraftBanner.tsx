'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { Banner } from '@/components/banner';
import { useDismissibleQueryFlag } from '@/hooks/useDismissibleQueryFlag';
import type { CatalogLocale } from '@/i18n/config';
import type { messagesFor } from '@/i18n/translator';
import { clearAiDraftWarnings, readAiDraftWarnings } from './ai-draft-warnings';

// Worded in the browser, from codes kept in the tab's storage, so they need
// the messages provider. Only a draft with warnings loads it. If its code
// won't load, as when a deploy has replaced it since the page opened, the
// warnings are left out rather than taking the signup's page down.
const AiDraftWarnings = lazy(() =>
  import('./AiDraftWarnings').then(
    (m) => ({ default: m.AiDraftWarnings }),
    () => ({ default: () => null }),
  ),
);

/**
 * The banner on a draft Magic Compose just made (`?aiDraft=1`), with what it
 * changed in the AI's draft, if anything. Its text is worded by the signup's
 * layout, and the warnings in the browser from `warningMessages`, both in the
 * organizer's language (`locale`).
 */
export function AiDraftBanner({
  signupId,
  signupStatus,
  text,
  locale,
  warningMessages,
}: {
  signupId: string;
  signupStatus: string;
  /** The banner's title (with the draft's counts), body and ✕'s name. */
  text: { title: string; body: string; dismiss: string };
  locale: CatalogLocale;
  /** `organizer.aiDraft.warnings`, for `AiDraftWarnings`. */
  warningMessages: ReturnType<typeof messagesFor>;
}) {
  const [shown, dismiss] = useDismissibleQueryFlag('aiDraft');
  const [kept, setKept] = useState<unknown[]>([]);

  useEffect(() => {
    if (signupStatus !== 'draft') {
      clearAiDraftWarnings(signupId);
      return;
    }
    if (!shown) return;
    setKept(readAiDraftWarnings(signupId));
  }, [shown, signupId, signupStatus]);

  if (signupStatus !== 'draft' || !shown) return null;

  const onDismiss = () => {
    clearAiDraftWarnings(signupId);
    dismiss();
  };

  return (
    <div className="flex flex-col gap-3">
      <Banner
        kind="aiDraft"
        title={text.title}
        body={text.body}
        onDismiss={onDismiss}
        dismissLabel={text.dismiss}
      />
      {kept.length > 0 && (
        <Suspense fallback={null}>
          <AiDraftWarnings locale={locale} messages={warningMessages} kept={kept} />
        </Suspense>
      )}
    </div>
  );
}
