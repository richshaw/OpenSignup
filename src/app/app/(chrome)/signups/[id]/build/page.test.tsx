// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ship } from '@/i18n/testing/ship';

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
const stored = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({}),
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
const builder = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
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
  instance.defaultLocale = undefined;
  builder.props = undefined;
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
