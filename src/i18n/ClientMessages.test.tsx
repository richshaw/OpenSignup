// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { useFormatter, useLocale, useTimeZone, useTranslations } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { ClientMessages } from './ClientMessages';
import { TIME_ZONE } from './time-zone';
import { messagesFor, namespaceMessages } from './translator';

/** What a client component under the provider gets. */
function Probe() {
  const t = useTranslations('participant.fields');
  const format = useFormatter();
  return (
    <dl>
      <dt>locale</dt>
      <dd>{useLocale()}</dd>
      <dt>time zone</dt>
      <dd>{useTimeZone()}</dd>
      <dt>name</dt>
      <dd>{t('name')}</dd>
      {/* Half past eleven at night in UTC: the next day east of it. */}
      <dt>day</dt>
      <dd>{format.dateTime(new Date('2026-05-16T23:30:00Z'), { day: 'numeric' })}</dd>
    </dl>
  );
}

const shown = (term: string) =>
  screen.getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('ClientMessages', () => {
  it('gives the client components under it the language and the messages it’s given', () => {
    render(
      <ClientMessages locale="en" messages={messagesFor('en', 'participant.fields')}>
        <Probe />
      </ClientMessages>,
    );
    expect(shown('locale')).toBe('en');
    expect(shown('name')).toBe('Your name');
  });

  it('formats in UTC, as every translator does, whatever the browser’s zone', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland');
    render(
      <ClientMessages locale="en" messages={messagesFor('en', 'participant.fields')}>
        <Probe />
      </ClientMessages>,
    );
    expect(shown('time zone')).toBe(TIME_ZONE);
    expect(shown('day')).toBe('16');
  });

  it('shows English for a message a partial catalog lacks', () => {
    // A language whose catalog has the section but not this message.
    const messages = namespaceMessages('participant.fields', en, { participant: { fields: {} } });
    render(
      <ClientMessages locale="en" messages={messages}>
        <Probe />
      </ClientMessages>,
    );
    expect(shown('name')).toBe('Your name');
  });

  it('reports a namespace the page didn’t pass, and shows its key path rather than throwing', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ClientMessages locale="en" messages={messagesFor('en', 'common.footer')}>
        <Probe />
      </ClientMessages>,
    );
    expect(shown('name')).toBe('participant.fields.name');
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_MESSAGE' }));
  });

  // Next gives a server component next-intl's server provider, which fills
  // each prop it isn't given from the request config, and so reads the
  // request's headers: a page built once would be rendered per request. The
  // directive is what makes Next give this file the client's provider, which
  // takes only the props it's given.
  it('is a client component, so it gets the provider that never reads the request config', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'ClientMessages.tsx'), 'utf8');
    expect(source.startsWith("'use client';\n")).toBe(true);
  });
});
