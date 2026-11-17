// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { ClientMessages } from '@/i18n/ClientMessages';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTranslator, messagesFor } from '@/i18n/translator';
import { formatSlotDate, formatSlotTime } from '@/lib/slot-label';
import type { SignupSettings } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { BuildWysiwyg } from './BuildWysiwyg';
import { BUILD_TAB_NAMESPACES } from './client-namespaces';
import { SignupLanguage, useSignupLanguage } from './signup-language';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/signups/sig_t/build',
}));

afterEach(cleanup);

/** The Build tab's own words, in the organizer's language, as its page gives them. */
const organizerIn = (locale: CatalogLocale) =>
  function Messages({ children }: { children: ReactNode }) {
    return (
      <ClientMessages locale={locale} messages={messagesFor(locale, BUILD_TAB_NAMESPACES)}>
        {children}
      </ClientMessages>
    );
  };

const field = (
  ref: string,
  label: string,
  config: SlotFieldDefinition['config'],
  sortOrder: number,
): SlotFieldDefinition => ({
  id: `f_${ref}`,
  ref,
  label,
  fieldType: config.fieldType,
  sortOrder,
  config,
});

/**
 * Grouped by a date, which reminders are sent for, with a second date field
 * that could be: so the group heading, a row's summary and the slot editor
 * each show a date or a time.
 */
const FIELDS = [
  field('when', 'When', { fieldType: 'date' }, 0),
  field('what', 'What', { fieldType: 'text', maxLength: 200 }, 1),
  field('kind', 'Kind', { fieldType: 'enum', choices: ['Cake', 'Pie'] }, 2),
  field('start', 'Start', { fieldType: 'time' }, 3),
  field('setup', 'Setup', { fieldType: 'date' }, 4),
];

const SETTINGS: SignupSettings = {
  requireEmail: true,
  allowNotes: true,
  showWhoSignedUp: true,
  lockoutHoursBeforeSlot: 0,
  sendReminders: true,
  groupByFieldRefs: ['when'],
  reminderFromFieldRef: 'when',
};

function renderTab(signup: CatalogLocale, organizer: CatalogLocale) {
  return render(
    <BuildWysiwyg
      signupId="sig_t"
      signupMeta={{ title: 'Bake sale', description: 'Bring something sweet' }}
      initialFields={FIELDS}
      initialSlots={[
        {
          id: 'slot_1',
          capacity: 4,
          sortOrder: 0,
          values: {
            when: '2026-05-21',
            what: 'Cupcakes',
            kind: 'Cake',
            start: '18:30',
            setup: '2026-05-20',
          },
        },
      ]}
      initialSettings={SETTINGS}
      committedBySlot={{}}
      locale={signup}
      fieldDefaults={{ name: 'Untitled', firstChoice: 'Option 1' }}
    />,
    { wrapper: organizerIn(organizer) },
  );
}

const build = (locale: CatalogLocale) =>
  getTranslator(locale, 'organizer.build', {
    onError: (error) => {
      throw error;
    },
  });

/** `text` as Testing Library reads the page's, with any run of spaces one space. */
const asRead = (text: string) => text.replace(/\s+/g, ' ');

/** The one other language with a catalog an organizer could build a signup in `locale` in. */
const otherThan = (locale: CatalogLocale) => CATALOG_LOCALES.find((other) => other !== locale)!;

describe('the Build tab, for a signup in another language than its organizer’s', () => {
  it.each(CATALOG_LOCALES)(
    'formats a signup in %s’s dates and times in it, and marks its words with it',
    (signup) => {
      const organizer = otherThan(signup);
      const t = build(organizer);
      renderTab(signup, organizer);
      const marked = (element: HTMLElement) => expect(element).toHaveAttribute('lang', signup);
      // Nothing around it in the test, so the organizer's words carry no mark.
      const unmarked = (element: HTMLElement) => expect(element.closest('[lang]')).toBeNull();

      marked(screen.getByText('Bake sale'));
      marked(screen.getByText('Bring something sweet'));
      marked(screen.getByText(formatSlotDate('2026-05-21', signup)!));
      marked(screen.getByText('Cupcakes'));
      const summary = screen.getByText(
        asRead(
          ['Cake', formatSlotTime('18:30', signup), formatSlotDate('2026-05-20', signup)].join(
            ' · ',
          ),
        ),
      );
      marked(summary);
      unmarked(screen.getByRole('button', { name: t('group.addSlot') }));
      unmarked(screen.getByText(t('rail.editing')));

      // A slot's editor: its fields' names, the item chosen and the times to
      // choose from are the signup's; the editor's own words are the
      // organizer's.
      fireEvent.click(screen.getByText('Cupcakes'));
      const editor = screen.getByTestId('slot-editor-slot_1');
      for (const name of ['When', 'What', 'Kind', 'Start', 'Setup']) {
        marked(within(editor).getByText(name));
      }
      unmarked(within(editor).getByText(t('editor.spots')));
      const picker = within(editor).getByTestId('enum-picker');
      const trigger = within(picker).getByRole('button', {
        name: t('editor.value', { field: 'Kind' }),
      });
      marked(within(trigger).getByText('Cake'));
      fireEvent.click(trigger);
      for (const choice of ['Cake', 'Pie']) {
        marked(within(picker).getByRole('option', { name: choice }).querySelector('[lang]')!);
      }
      unmarked(within(picker).getByText(t('list.addToList')));
      const start = within(editor).getByRole('combobox', {
        name: t('editor.value', { field: 'Start' }),
      });
      expect(within(start).getByRole('option', { selected: true })).toHaveTextContent(
        asRead(formatSlotTime('18:30', signup)!),
      );
      expect(within(start).getByRole('option', { name: t('editor.noTime') })).toBeInTheDocument();
      fireEvent.click(within(editor).getByRole('button', { name: t('editor.done') }));

      // The Fields dialog: in the organizer's language, its fields' names in
      // the signup's.
      fireEvent.click(
        screen.getByRole('button', { name: t('rail.fields', { count: FIELDS.length }) }),
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('lang', organizer);
      for (const f of FIELDS) {
        marked(within(within(dialog).getByTestId(`fields-row-${f.id}`)).getByText(f.label));
      }
      const groupBy = within(dialog)
        .getAllByRole('button')
        .find((b) => b.getAttribute('aria-haspopup') === 'listbox')!;
      marked(groupBy);
      fireEvent.click(groupBy);
      const menu = within(dialog).getByRole('listbox');
      marked(within(menu).getByRole('option', { name: 'Setup' }).querySelector('[lang]')!);
      expect(
        within(menu)
          .getByRole('option', { name: t('fields.noGroup') })
          .querySelector('[lang]'),
      ).toBeNull();
      fireEvent.click(within(menu).getByRole('option', { name: 'When' }));

      // The reminder is When's, so Setup's form names it, in the signup's language.
      fireEvent.click(
        within(within(dialog).getByTestId('fields-row-f_setup')).getByRole('button', {
          name: 'Setup',
        }),
      );
      const taken = within(dialog).getByText('When');
      expect(taken.tagName).toBe('STRONG');
      marked(taken);
    },
  );

  it.each(CATALOG_LOCALES)(
    'marks nothing for a signup in its organizer’s language, %s',
    (locale) => {
      const t = build(locale);
      const { container } = renderTab(locale, locale);
      expect(screen.getByText(formatSlotDate('2026-05-21', locale)!)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Cupcakes'));
      fireEvent.click(
        within(screen.getByTestId('enum-picker')).getByRole('button', {
          name: t('editor.value', { field: 'Kind' }),
        }),
      );
      expect(container.querySelector('[lang]')).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: t('rail.fields', { count: FIELDS.length }) }),
      );
      const dialog = screen.getByRole('dialog');
      // The dialog says the organizer's language itself, and nothing in it differs.
      expect(dialog).toHaveAttribute('lang', locale);
      expect(dialog.querySelector('[lang]')).toBeNull();
    },
  );

  it('formats English as it always has', () => {
    renderTab('en', 'en');
    expect(screen.getByText('Thu, May 21')).toBeInTheDocument();
    expect(screen.getByText('Cake · 6:30 PM · Wed, May 20').textContent).toBe(
      'Cake · 6:30\u00a0PM · Wed, May 20',
    );
  });
});

describe('useSignupLanguage', () => {
  it.each(CATALOG_LOCALES)(
    'takes the signup’s words to be in the page’s language, %s, with none given',
    (locale) => {
      const { result } = renderHook(() => useSignupLanguage(), { wrapper: organizerIn(locale) });
      expect(result.current).toEqual({ locale, lang: undefined });
    },
  );

  it.each(CATALOG_LOCALES)('gives a signup in %s its language, and a mark', (signup) => {
    const organizer = otherThan(signup);
    const Organizer = organizerIn(organizer);
    const { result } = renderHook(() => useSignupLanguage(), {
      wrapper: ({ children }) => (
        <Organizer>
          <SignupLanguage value={signup}>{children}</SignupLanguage>
        </Organizer>
      ),
    });
    expect(result.current).toEqual({ locale: signup, lang: signup });
  });
});
