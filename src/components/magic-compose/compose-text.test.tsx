// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import { ClientMessages } from '@/i18n/ClientMessages';
import { CATALOG_LOCALES } from '@/i18n/config';
import { standInMessages } from '@/i18n/testing/client-messages';
import { messagesFor } from '@/i18n/translator';
import { MAGIC_COMPOSE_NAMESPACES } from './client-namespaces';
import { Compose } from './Compose';
import { Drafting } from './Drafting';
import { MagicComposeRoot } from './MagicComposeRoot';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Magic Compose's start, drafting and error screens take every word from the
 * messages the New signup page gives `ClientMessages`, in the organizer's
 * language: here stand-ins that name their key, in a language that isn't
 * English. What's left is the organizer's own: their description, and the
 * draft the AI made from it.
 */
const LOCALE = CATALOG_LOCALES.find((locale) => locale !== 'en') ?? 'en';
const standIns = standInMessages(LOCALE, MAGIC_COMPOSE_NAMESPACES);
const inStandIns = (ui: ReactElement) => render(ui, { wrapper: standIns });
const isMessage = (text: string) =>
  new RegExp(`^organizer\\.(compose|errors)\\.[\\w.]+ in ${LOCALE}$`).test(text);

/** Every word on the page people read or hear: text, and the attributes that carry words. */
function wordsOnPage(): string[] {
  const words: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text) words.push(text);
  }
  for (const element of document.body.querySelectorAll('*')) {
    for (const name of ['aria-label', 'placeholder', 'title']) {
      const value = element.getAttribute(name)?.trim();
      if (value) words.push(value);
    }
  }
  return words;
}

/** The words on the page that are neither a message nor `content`, nor only digits and signs. */
function strays(content: readonly string[]): string[] {
  return wordsOnPage().filter(
    (text) => !isMessage(text) && !content.includes(text) && /\p{L}/u.test(text),
  );
}

const DRAFT: DraftPreview = {
  title: 'Bake sale',
  description: 'Bring something sweet.',
  fields: ['What', 'When', 'Where', 'Who', 'Why'].map((label) => ({
    ref: label.toLowerCase(),
    label,
    fieldType: 'text' as const,
  })),
  slots: Array.from({ length: 12 }, (_, i) => ({
    values: { what: `Cake ${i + 1}`, when: 'Saturday', where: 'Hall', who: '', why: 'Fun' },
    capacity: i === 0 ? null : 2,
  })),
};
const DRAFT_CONTENT = [
  DRAFT.title,
  DRAFT.description,
  ...DRAFT.fields.map((f) => f.label),
  ...DRAFT.slots.flatMap((s) => Object.values(s.values).map(String)),
];

describe('Magic Compose’s own words', () => {
  it('start: every word is a message, and the examples are in the organizer’s language', () => {
    let prompt = '';
    const setPrompt = vi.fn((value: string) => {
      prompt = value;
    });
    const { rerender } = inStandIns(<Compose prompt="" setPrompt={setPrompt} onDraft={() => {}} />);
    expect(strays([])).toEqual([]);
    expect(screen.getByRole('textbox')).toHaveAccessibleName(
      `organizer.compose.describe in ${LOCALE}`,
    );

    // An example puts its description, in that language, in the box.
    fireEvent.click(screen.getByText(`organizer.compose.starters.classroom.label in ${LOCALE}`));
    expect(prompt).toBe(`organizer.compose.starters.classroom.body in ${LOCALE}`);
    rerender(<Compose prompt={prompt} setPrompt={setPrompt} onDraft={() => {}} />);
    expect(screen.getByText(`organizer.compose.loaded in ${LOCALE}`)).toBeInTheDocument();
    // The organizer didn't write it, so filling in by hand starts blank.
    expect(
      screen.getByRole('link', { name: `organizer.compose.skip in ${LOCALE}` }),
    ).toHaveAttribute('href', '/app/signups/new?manual=1');

    const long = 'a'.repeat(4500);
    rerender(<Compose prompt={long} setPrompt={setPrompt} onDraft={() => {}} />);
    expect(screen.getByText(`organizer.compose.countOver in ${LOCALE}`)).toBeInTheDocument();
    expect(strays([long])).toEqual([]);
  });

  it('reading: every word is a message', () => {
    inStandIns(
      <Drafting
        prompt="Bake sale"
        locale={LOCALE}
        draft={null}
        onCancel={() => {}}
        onAnimationDone={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `organizer.compose.drafting.readingTitle in ${LOCALE}`,
    );
    expect(strays([])).toEqual([]);
  });

  it('drafting: every word is a message or the draft', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    inStandIns(
      <Drafting
        prompt="Bake sale"
        locale={LOCALE}
        draft={DRAFT}
        onCancel={() => {}}
        onAnimationDone={done}
      />,
    );
    for (let ms = 0; !done.mock.calls.length && ms < 20_000; ms += 100) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(done).toHaveBeenCalled();
    expect(screen.getAllByText(`organizer.compose.drafting.more in ${LOCALE}`)).toHaveLength(2);
    expect(screen.getAllByText(`organizer.compose.drafting.shown in ${LOCALE}`)).toHaveLength(2);
    expect(strays(DRAFT_CONTENT)).toEqual([]);
  });

  it('drafting from answers: every word is a message or an answer', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    inStandIns(
      <Drafting
        prompt="Bake sale"
        locale={LOCALE}
        followUp={{ what: { picked: ['Staff the table'], added: ['Bake'] }, howMany: [2, null] }}
        draft={null}
        onCancel={() => {}}
        onAnimationDone={() => {}}
      />,
    );
    await screen.findByRole('region', {
      name: `organizer.compose.draftingFrom.label in ${LOCALE}`,
    });
    // The steps on one line, for a phone.
    await screen.findByText(`organizer.compose.steps.readShort in ${LOCALE}`);
    expect(
      screen.getByText(`organizer.compose.draftingFrom.noLimit in ${LOCALE}`),
    ).toBeInTheDocument();
    expect(strays(['Staff the table', 'Bake'])).toEqual([]);
  });

  it('errors: the hour’s drafts used up, worded from the messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'rate_limited',
                message: 'too many requests',
                details: { retryAfterSeconds: 700, bucket: 'magic.compose' },
              },
            }),
            { status: 429 },
          ),
      ),
    );
    inStandIns(<MagicComposeRoot />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bake sale' } });
    fireEvent.click(screen.getByRole('button', { name: `organizer.compose.draft in ${LOCALE}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `organizer.compose.errors.hourlyLimit in ${LOCALE}`,
    );
    expect(strays(['Bake sale'])).toEqual([]);
  });

  it.each(CATALOG_LOCALES)(
    'finds every message it reads in what its page passes (%s)',
    (locale) => {
      const error = vi.spyOn(console, 'error');
      render(
        <ClientMessages locale={locale} messages={messagesFor(locale, MAGIC_COMPOSE_NAMESPACES)}>
          <Compose prompt={'a'.repeat(4500)} setPrompt={() => {}} onDraft={() => {}} />
          <Drafting
            prompt="Bake sale"
            locale={locale}
            draft={null}
            onCancel={() => {}}
            onAnimationDone={() => {}}
          />
        </ClientMessages>,
      );
      expect(error).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(/organizer\.compose\./);
    },
  );
});
