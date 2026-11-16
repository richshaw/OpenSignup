// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTestTranslator } from '@/i18n/testing/translator';
import { getTranslator, messagesFor } from '@/i18n/translator';
import { warningSentence, type DraftWarning } from '@/lib/magic-compose/draft-warnings';
import { AI_DRAFT_WARNINGS_KEY_PREFIX, writeAiDraftWarnings } from './ai-draft-warnings';
import { AiDraftBanner } from './AiDraftBanner';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/signups/sig_test',
  useSearchParams: () => new URLSearchParams('aiDraft=1'),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

/** The banner's own words in English, as the signup's layout words them. */
const aiDraft = getTestTranslator('organizer.aiDraft');

/** The warnings' messages in `locale`, English under any its catalog lacks. */
const warningsIn = (locale: CatalogLocale) =>
  getTranslator(locale, 'organizer.aiDraft.warnings', {
    onError: (error) => {
      throw error;
    },
  });

function renderBanner(
  fieldsCount: number,
  slotsCount: number,
  { locale = 'en', status = 'draft' }: { locale?: CatalogLocale; status?: string } = {},
) {
  render(
    <AiDraftBanner
      signupId="sig_test"
      signupStatus={status}
      text={{
        title: aiDraft('title', { fields: fieldsCount, slots: slotsCount }),
        body: aiDraft('body'),
        dismiss: aiDraft('dismiss'),
      }}
      locale={locale}
      warningMessages={messagesFor(locale, 'organizer.aiDraft.warnings')}
    />,
  );
}

const WARNINGS: DraftWarning[] = [
  { code: 'values_blanked', count: 2 },
  { code: 'enum_fields_to_text', fields: ['Shift', 'Role'] },
  { code: 'text_cut', field: 'description', max: 2000 },
];
const OLD_SENTENCE = 'Removed 1 duplicate field the AI tried to add twice.';

/** The warnings box's items, once its code has loaded, found by its heading. */
async function warningItems(heading = 'A few things to double-check') {
  const box = (await screen.findByText(heading)).parentElement!;
  expect(box).toHaveAttribute('role', 'status');
  return within(box)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

/** Gives a lazy warnings box the time to appear, before saying it didn't. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('<AiDraftBanner />', () => {
  it('counts one field and one slot in the singular', () => {
    renderBanner(1, 1);
    expect(screen.getByText("Here's your draft, 1 field and 1 slot")).toBeInTheDocument();
    expect(screen.getByText("Edit anything below, then publish when you're ready.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('counts several fields and slots as fields, never columns', () => {
    renderBanner(2, 3);
    expect(screen.getByText("Here's your draft, 2 fields and 3 slots")).toBeInTheDocument();
    expect(screen.queryByText(/column/i)).not.toBeInTheDocument();
  });

  it('words the warnings kept for the draft, in English as the API does', async () => {
    writeAiDraftWarnings('sig_test', WARNINGS);
    renderBanner(2, 3);
    expect(await warningItems()).toEqual(WARNINGS.map(warningSentence));
  });

  it('shows no warnings box when none were kept', async () => {
    renderBanner(2, 3);
    await settle();
    expect(screen.queryByText('A few things to double-check')).not.toBeInTheDocument();
  });

  it('leaves out English sentences kept by a tab from before warnings had codes', async () => {
    window.sessionStorage.setItem(
      `${AI_DRAFT_WARNINGS_KEY_PREFIX}sig_test`,
      JSON.stringify([OLD_SENTENCE]),
    );
    renderBanner(2, 3);
    await settle();
    expect(screen.getByText("Here's your draft, 2 fields and 3 slots")).toBeInTheDocument();
    expect(screen.queryByText('A few things to double-check')).not.toBeInTheDocument();
    expect(screen.queryByText(OLD_SENTENCE)).not.toBeInTheDocument();
  });

  it('shows the first 10 warnings it knows', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ code: 'stray_values', count: i + 1 }));
    window.sessionStorage.setItem(
      `${AI_DRAFT_WARNINGS_KEY_PREFIX}sig_test`,
      JSON.stringify([OLD_SENTENCE, { code: 'something_new' }, ...many]),
    );
    renderBanner(2, 3);
    expect(await warningItems()).toEqual(
      many.slice(0, 10).map((w) => warningSentence(w as DraftWarning)),
    );
  });

  it('shows only the coded warnings from a list that mixes in an old sentence', async () => {
    window.sessionStorage.setItem(
      `${AI_DRAFT_WARNINGS_KEY_PREFIX}sig_test`,
      JSON.stringify([OLD_SENTENCE, WARNINGS[0]]),
    );
    renderBanner(2, 3);
    expect(await warningItems()).toEqual([warningSentence(WARNINGS[0]!)]);
  });

  it('shows nothing on a signup that is no longer a draft, and forgets its warnings', () => {
    writeAiDraftWarnings('sig_test', WARNINGS);
    renderBanner(2, 3, { status: 'open' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(`${AI_DRAFT_WARNINGS_KEY_PREFIX}sig_test`)).toBeNull();
  });

  it('takes every word of the warnings from the messages the layout passes', async () => {
    const locale = CATALOG_LOCALES.find((l) => l !== 'en') ?? 'en';
    const english = messagesFor('en', 'organizer.aiDraft.warnings') as {
      organizer: { aiDraft: { warnings: Record<string, unknown> } };
    };
    const standIns = Object.fromEntries(
      Object.keys(english.organizer.aiDraft.warnings).map((key) => [key, `${key} in ${locale}`]),
    );
    writeAiDraftWarnings('sig_test', [...WARNINGS, { code: 'text_cut', field: 'title', max: 120 }]);
    render(
      <AiDraftBanner
        signupId="sig_test"
        signupStatus="draft"
        text={{ title: 'title', body: 'body', dismiss: 'dismiss' }}
        locale={locale}
        warningMessages={{ organizer: { aiDraft: { warnings: standIns } } }}
      />,
    );
    expect(await warningItems(`heading in ${locale}`)).toEqual([
      `valuesBlanked in ${locale}`,
      `enumFieldsToText in ${locale}`,
      `descriptionCut in ${locale}`,
      `titleCut in ${locale}`,
    ]);
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    "words the warnings in the organizer's language, its numbers too (%s)",
    async (locale) => {
      const t = warningsIn(locale);
      writeAiDraftWarnings('sig_test', WARNINGS);
      renderBanner(2, 3, { locale });
      const fields = new Intl.ListFormat(locale, { type: 'unit', style: 'short' });
      const items = await warningItems(t('heading'));
      expect(items).toEqual([
        t('valuesBlanked', { count: 2 }),
        t('enumFieldsToText', { count: 2, fields: fields.format(['Shift', 'Role']) }),
        t('descriptionCut', { max: 2000 }),
      ]);
      // The limit is written as the language writes numbers.
      expect(items[2]).toContain(new Intl.NumberFormat(locale).format(2000));
    },
  );
});
