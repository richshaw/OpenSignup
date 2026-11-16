import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { englishName, TEST_LOCALES } from '@/i18n/testing/locales';
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
 * (docs/translating.md). The text starts with a `Subject:` line, because the
 * subject isn't in the body. Only with TRANSLATION_SCREENSHOTS=1, which
 * `pnpm translation:screenshots` sets; the folder is gitignored.
 */
function writeForReview(
  { lang, name, subject }: { lang: string; name: string; subject: string },
  { html, text }: { html: string; text: string },
) {
  const dir = path.resolve(import.meta.dirname, '../../../translation-review', lang, 'emails');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.html`), html);
  writeFileSync(path.join(dir, `${name}.txt`), `Subject: ${subject}\n\n${text}`);
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
 * which formats the raw JSON; the sign-in email in the web process too.
 * src/i18n/precompiled.test.ts holds the two formatters to the same text
 * message by message; this holds them to the same email, rich text and all,
 * for every sample `pnpm email:dev` shows, in English and in every test
 * language.
 */
describe('each email, from the catalogs as the web process gets them', () => {
  beforeAll(async () => {
    const namespaces = [
      ...Object.keys(en.email).map((section) => `email.${section}` as Namespace),
      'auth.email' as const,
    ];
    for (const locale of CATALOG_LOCALES) {
      for (const namespace of namespaces) {
        translators.precompiled.set(
          `${locale} ${namespace}`,
          await getPrecompiledTranslator(locale, namespace),
        );
      }
    }
  });

  // Every English sample but the sign-in email, which is the organizer's, is
  // a participant's. Each test language has a sample of each, and of the
  // sign-in email.
  const participantEmails = emailSamples
    .filter(({ lang, name }) => lang === 'en' && name !== 'magic-link')
    .map(({ name }) => name);

  it.each(TEST_LOCALES.map((locale) => [englishName(locale), locale] as const))(
    'includes every email in %s',
    (_language, locale) => {
      expect(participantEmails).toEqual([
        'commitment-confirmation',
        'reminder',
        'reminder-changed',
        'slot-changed',
      ]);
      expect(emailSamples.filter(({ lang }) => lang === locale).map(({ name }) => name)).toEqual([
        ...participantEmails.map((name) => `${name}-${locale}`),
        `magic-link-${locale}`,
      ]);
    },
  );

  it.each(emailSamples.map((sample) => [sample.name, sample] as const))(
    'renders %s as the worker does',
    async (_name, sample) => {
      const { element } = sample;
      const worker = await render(element, { web: false });
      const used = translators.precompiledUsed;
      const web = await render(element, { web: true });
      expect(web).toEqual(worker);
      expect(translators.precompiledUsed).toBeGreaterThan(used);
      if (process.env.TRANSLATION_SCREENSHOTS === '1') writeForReview(sample, worker);
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
