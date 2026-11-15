'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ClientMessages } from '@/i18n/ClientMessages';
import type { CatalogLocale } from '@/i18n/config';
import type { messagesFor } from '@/i18n/translator';
import { isDraftWarning, type DraftWarning } from '@/lib/magic-compose/draft-warnings';
import { warningText } from './warning-text';

/**
 * The AI-draft banner's warnings, worded in the organizer's language from the
 * messages the signup's layout passes (`organizer.aiDraft.warnings`). Loaded
 * only when the tab kept something for the draft, so the messages provider
 * stays out of the JavaScript every tab of every signup loads (budgets.json).
 * Of what was kept, it shows the first 10 warnings it knows, and nothing when
 * there are none, as for English sentences a tab kept before warnings had
 * codes.
 */
export function AiDraftWarnings({
  locale,
  messages,
  kept,
}: {
  locale: CatalogLocale;
  messages: ReturnType<typeof messagesFor>;
  /** What the tab kept for the draft (`readAiDraftWarnings`), unchecked. */
  kept: readonly unknown[];
}) {
  const warnings = kept.filter(isDraftWarning).slice(0, 10);
  if (warnings.length === 0) return null;
  return (
    <ClientMessages locale={locale} messages={messages}>
      <WarningList warnings={warnings} />
    </ClientMessages>
  );
}

function WarningList({ warnings }: { warnings: readonly DraftWarning[] }) {
  const t = useTranslations('organizer.aiDraft.warnings');
  const locale = useLocale();
  return (
    <div
      role="status"
      className="rounded-lg border border-warn/30 bg-warn/10 px-5 py-4 text-sm text-ink"
    >
      <p className="mb-1 font-semibold">{t('heading')}</p>
      <ul className="list-inside list-disc space-y-1">
        {warnings.map((warning, i) => (
          <li key={i}>{warningText(warning, t, locale)}</li>
        ))}
      </ul>
    </div>
  );
}
