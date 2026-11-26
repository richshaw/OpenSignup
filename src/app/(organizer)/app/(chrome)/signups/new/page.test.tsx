// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MAGIC_COMPOSE_NAMESPACES } from '@/components/magic-compose/client-namespaces';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { ship, shipOnlyEnglish } from '@/i18n/testing/ship';
import { messagesFor } from '@/i18n/translator';

// Unit tests have no server environment. Text comes from the catalog in
// English, and as a stand-in naming its key in any other language.
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => undefined,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

// The organizer, with the language stored on their account, and no
// workspace, so the page records no view (that needs a database).
const stored = vi.hoisted(() => ({ locale: null as string | null, magic: false }));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ locale: stored.locale, defaultWorkspaceId: null }),
  getOrganizerSession: async () => ({ locale: stored.locale }),
  toActor: () => ({ kind: 'anonymous' }),
}));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ LLM_TIMEOUT_MS: 1000 }),
  magicComposeEnabled: () => stored.magic,
}));
vi.mock('./actions', () => ({ createSignupAction: async () => null }));
const compose = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
  messages: undefined as { locale: string; messages: unknown } | undefined,
}));
vi.mock('@/i18n/ClientMessages', () => ({
  ClientMessages: ({
    locale,
    messages,
    children,
  }: {
    locale: string;
    messages: unknown;
    children: ReactNode;
  }) => {
    compose.messages = { locale, messages };
    return children;
  },
}));
vi.mock('@/components/magic-compose/MagicComposeRoot', () => ({
  MagicComposeRoot: (props: Record<string, unknown>) => {
    compose.props = props;
    return null;
  },
}));

const { default: NewSignupPage, generateMetadata } = await import('./page');

async function open(query: Record<string, string> = {}) {
  render(await NewSignupPage({ searchParams: Promise.resolve(query) }));
}

afterEach(() => {
  cleanup();
  stored.locale = null;
  stored.magic = false;
  compose.props = undefined;
  compose.messages = undefined;
});

describe('New signup: the form', () => {
  it('says what it always said, in English with nothing stored', async () => {
    await open();
    expect(await generateMetadata()).toEqual({ title: 'New signup' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New signup');
    expect(
      screen.getByText(
        "You can add slots after it's created. Nothing is visible until you publish.",
      ),
    ).toBeInTheDocument();
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('placeholder', 'Snack duty — Spring season');
    expect(screen.getByLabelText('Description (optional)')).toHaveAttribute(
      'placeholder',
      'One paragraph that shows up at the top of your signup page.',
    );
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('button', { name: 'Create signup' })).toBeInTheDocument();
  });

  it.each(TEST_LOCALES)(
    'is in the organizer’s language when they store it (%s)',
    async (locale) => {
      ship('organizer', ['en', locale]);
      stored.locale = locale;
      await open();
      const t = (key: string) => `organizer.newSignup.${key} in ${locale}`;
      expect(await generateMetadata()).toEqual({ title: t('title') });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('title'));
      expect(screen.getByText(t('intro'))).toBeInTheDocument();
      expect(screen.getByLabelText(t('titleLabel'))).toHaveAttribute(
        'placeholder',
        t('titlePlaceholder'),
      );
      expect(screen.getByLabelText(t('descriptionLabel'))).toHaveAttribute(
        'placeholder',
        t('descriptionPlaceholder'),
      );
      expect(screen.getByRole('link', { name: t('cancel') })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: t('create') })).toBeInTheDocument();
    },
  );

  it('keeps what Magic Compose carried over in the boxes', async () => {
    await open({ manual: '1', title: 'Pumpkin carving', description: 'Bring a knife' });
    expect(screen.getByLabelText('Title')).toHaveValue('Pumpkin carving');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('Bring a knife');
  });
});

describe('New signup: Magic Compose', () => {
  it('gives its client components their messages, in English with nothing stored', async () => {
    stored.magic = true;
    await open();
    const { messages } = compose;
    expect(messages).toEqual({
      locale: 'en',
      messages: messagesFor('en', MAGIC_COMPOSE_NAMESPACES),
    });
    expect(Object.keys((messages?.messages as { organizer: object }).organizer)).toEqual([
      'compose',
      'errors',
    ]);
    // The language reaches the screens with their messages, and nowhere else.
    expect(compose.props).toEqual({ llmTimeoutMs: 1000 });
  });

  it.each(TEST_LOCALES)('gives them in the organizer’s language (%s)', async (locale) => {
    ship('organizer', ['en', locale]);
    stored.locale = locale;
    stored.magic = true;
    await open();
    expect(compose.messages).toEqual({
      locale,
      messages: messagesFor(locale, MAGIC_COMPOSE_NAMESPACES),
    });
  });

  it('stays English for a stored language that hasn’t shipped to organizers', async () => {
    shipOnlyEnglish();
    stored.locale = TEST_LOCALES[0] ?? 'en';
    stored.magic = true;
    await open();
    expect(compose.messages?.locale).toBe('en');
  });

  it('gives way to the form when asked to fill in by hand', async () => {
    stored.magic = true;
    await open({ manual: '1' });
    expect(compose.props).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Create signup' })).toBeInTheDocument();
  });
});
