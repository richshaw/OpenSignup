import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getPrecompiledTranslator } from '@/i18n/testing/precompiled';
import type { Namespace } from '@/i18n/translator';
import { REMINDER_LEAD_WORDS } from '@/lib/reminder-lead';
import en from '@/messages/en.json';
import { emailSamples } from '../../../scripts/lib/email-samples';
import { renderEmail } from '../render';
import { CommitmentConfirmationEmail } from './commitment-confirmation';

/**
 * Which translators the templates get: the worker's (the raw JSON, through
 * use-intl's full formatter, throwing on anything it would report), or, while
 * `web` is set, the web process's (the catalogs as Next precompiles them,
 * through the formatter it swaps in), built ahead in `beforeAll`.
 */
const translators = vi.hoisted(() => ({
  web: false,
  precompiled: new Map<string, unknown>(),
  precompiledUsed: 0,
}));

vi.mock('@/i18n/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/server')>();
  const { getTranslator } = await import('@/i18n/translator');
  const getServerTranslator = (locale: CatalogLocale, namespace: Namespace): unknown => {
    if (!translators.web) {
      return getTranslator(locale, namespace, {
        onError: (error) => {
          throw error;
        },
      });
    }
    const t = translators.precompiled.get(`${locale} ${namespace}`);
    if (!t) throw new Error(`no precompiled translator for ${namespace} in ${locale}`);
    translators.precompiledUsed += 1;
    return t;
  };
  return { ...actual, getServerTranslator };
});

/**
 * Writes an email as the worker renders it, its HTML and its plain text, to
 * `translation-review/<lang>/emails/`, for a translation's review in context
 * (docs/translating.md). Only with TRANSLATION_SCREENSHOTS=1, which
 * `pnpm translation:screenshots` sets; the folder is gitignored.
 */
function writeForReview(
  lang: string,
  name: string,
  { html, text }: { html: string; text: string },
) {
  const dir = path.resolve(import.meta.dirname, '../../../translation-review', lang, 'emails');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.html`), html);
  writeFileSync(path.join(dir, `${name}.txt`), text);
}

/** `element` rendered with the web process's translators, or the worker's. */
async function render(element: ReactElement, { web }: { web: boolean }) {
  translators.web = web;
  try {
    return await renderEmail(element);
  } finally {
    translators.web = false;
  }
}

/**
 * The confirmation is rendered in the web process, which formats the catalogs
 * Next precompiled; the reminder and the time-changed email in the worker,
 * which formats the raw JSON. src/i18n/precompiled.test.ts holds the two
 * formatters to the same text message by message; this holds them to the same
 * email, rich text and all, for every sample `pnpm email:dev` shows, in
 * English and in Swedish.
 */
describe('each email, from the catalogs as the web process gets them', () => {
  beforeAll(async () => {
    for (const locale of CATALOG_LOCALES) {
      for (const section of Object.keys(en.email)) {
        const namespace = `email.${section}` as Namespace;
        translators.precompiled.set(
          `${locale} ${namespace}`,
          await getPrecompiledTranslator(locale, namespace),
        );
      }
    }
  });

  it('includes every participant email in Swedish', () => {
    expect(emailSamples.filter(({ lang }) => lang === 'sv').map(({ name }) => name)).toEqual([
      'commitment-confirmation-sv',
      'reminder-sv',
      'reminder-changed-sv',
      'slot-changed-sv',
    ]);
  });

  it.each(emailSamples.map(({ name, element, lang }) => [name, element, lang] as const))(
    'renders %s as the worker does',
    async (name, element, lang) => {
      const worker = await render(element, { web: false });
      const used = translators.precompiledUsed;
      const web = await render(element, { web: true });
      expect(web).toEqual(worker);
      // The sign-in email has no catalog text yet; every other one went
      // through the precompiled catalogs.
      if (name !== 'magic-link') expect(translators.precompiledUsed).toBeGreaterThan(used);
      if (process.env.TRANSLATION_SCREENSHOTS === '1') writeForReview(lang, name, worker);
    },
  );
});

describe('the confirmation', () => {
  it('promises the reminder when REMINDER_LEAD_WORDS says it goes out', async () => {
    const { text } = await render(
      createElement(CommitmentConfirmationEmail, {
        locale: 'en',
        participantName: 'Pat',
        signupTitle: 'Bake sale',
        manageUrl: 'https://example.com/s/bake-sale/c/fake',
        slotDetails: [],
        slotSummary: '',
        promisesReminder: true,
      }),
      { web: false },
    );
    expect(text.replace(/\s+/g, ' ')).toContain(
      `We'll also send you a reminder ${REMINDER_LEAD_WORDS}.`,
    );
  });
});
