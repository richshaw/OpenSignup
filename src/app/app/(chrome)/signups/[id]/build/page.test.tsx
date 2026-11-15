// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BUILD_TAB_NAMESPACES } from '@/components/build-wysiwyg/client-namespaces';
import { ship } from '@/i18n/testing/ship';
import { messagesFor } from '@/i18n/translator';

// Unit tests have no server environment. The instance sets no language
// unless a test sets one. Text comes from the catalog in English, and as a
// stand-in naming its key in any other language.
const instance = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', async () => ({
  instanceDefaultLocale: () => instance.defaultLocale,
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

// The signup as the page loads it, and what the page needs around it: a
// session and the view it records, which need a database.
const stored = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  organizerLocale: null as string | null,
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ locale: stored.organizerLocale }),
  toActor: () => ({ kind: 'anonymous' }),
}));
vi.mock('@/services/signups.cached', () => ({
  loadSignupForOrganizer: async () => ({
    ok: true,
    value: {
      id: 'sig_1',
      workspaceId: 'ws_1',
      title: 'Bake sale',
      description: '',
      settings: stored.settings,
      fields: [],
      slots: [],
    },
  }),
  loadCommittedBySlotForOrganizer: async () => ({ ok: true, value: {} }),
}));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView: async () => {} }));
const builder = vi.hoisted(() => ({
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
    builder.messages = { locale, messages };
    return children;
  },
}));
vi.mock('@/components/build-wysiwyg/BuildWysiwyg', () => ({
  BuildWysiwyg: (props: Record<string, unknown>) => {
    builder.props = props;
    return null;
  },
}));

const { default: BuildTab } = await import('./page');

/** What the page hands the Build tab's client components. */
async function handedDown() {
  render(await BuildTab({ params: Promise.resolve({ id: 'sig_1' }) }));
  const { locale, fieldDefaults } = builder.props ?? {};
  return { locale, fieldDefaults };
}

afterEach(() => {
  cleanup();
  stored.settings = {};
  stored.organizerLocale = null;
  instance.defaultLocale = undefined;
  builder.props = undefined;
  builder.messages = undefined;
});

describe('Build tab: the signup’s language', () => {
  it('hands down English, and English defaults, for an English signup', async () => {
    expect(await handedDown()).toEqual({
      locale: 'en',
      fieldDefaults: { name: 'Untitled', firstChoice: 'Option 1' },
    });
  });

  it('hands down the signup’s language, and its defaults from the catalog in it', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    expect(await handedDown()).toEqual({
      locale: 'sv',
      fieldDefaults: {
        name: 'participant.defaults.untitledField in sv',
        firstChoice: 'participant.defaults.firstChoice in sv',
      },
    });
  });

  it('takes the language participants get: the instance’s, for a signup with none', async () => {
    ship('participant', ['en', 'sv']);
    instance.defaultLocale = 'sv';
    expect((await handedDown()).locale).toBe('sv');
  });

  it('stays English for a stored language that hasn’t shipped', async () => {
    stored.settings = { locale: 'sv' };
    expect((await handedDown()).locale).toBe('en');
  });
});

describe('Build tab: the organizer’s language', () => {
  it('gives its client components the tab’s messages, in English with nothing stored', async () => {
    await handedDown();
    const { messages } = builder;
    expect(messages).toEqual({ locale: 'en', messages: messagesFor('en', BUILD_TAB_NAMESPACES) });
    expect(Object.keys((messages?.messages as { organizer: object }).organizer)).toEqual([
      'build',
      'errors',
      'saveNotice',
    ]);
  });

  it('gives them in the organizer’s language, apart from the signup’s', async () => {
    ship('organizer', ['en', 'sv']);
    stored.organizerLocale = 'sv';
    const { locale } = await handedDown();
    expect(builder.messages).toEqual({
      locale: 'sv',
      messages: messagesFor('sv', BUILD_TAB_NAMESPACES),
    });
    expect(locale).toBe('en');
  });

  it('keeps an English organizer’s words English on a signup in another language', async () => {
    ship('participant', ['en', 'sv']);
    stored.settings = { locale: 'sv' };
    const { locale } = await handedDown();
    expect(locale).toBe('sv');
    expect(builder.messages?.locale).toBe('en');
  });
});
