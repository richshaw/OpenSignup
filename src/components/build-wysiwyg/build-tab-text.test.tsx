// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ClientMessages } from '@/i18n/ClientMessages';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { standInMessages } from '@/i18n/testing/client-messages';
import { getTranslator, messagesFor } from '@/i18n/translator';
import { CHOICE_COUNT_FROM } from '@/schemas/slot-field-basics';
import type { SignupSettings } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { BuildWysiwyg } from './BuildWysiwyg';
import { BUILD_TAB_NAMESPACES } from './client-namespaces';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/signups/sig_t/build',
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The Build tab's own words come from the messages its page gives
 * `ClientMessages`, in the organizer's language, while what the organizer
 * wrote, the dates and times, and the order groups sort in are the signup's.
 * A signup with a field of each type, grouped by its date, which reminders
 * are sent for, and a second date field that could be.
 */
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

const FIELDS = [
  field('when', 'When', { fieldType: 'date' }, 0),
  field('what', 'What', { fieldType: 'text', maxLength: 200 }, 1),
  field('kind', 'Kind', { fieldType: 'enum', choices: ['Cake', 'Pie'] }, 2),
  field('start', 'Start', { fieldType: 'time' }, 3),
  field('qty', 'Qty', { fieldType: 'number' }, 4),
  field('setup', 'Setup', { fieldType: 'date' }, 5),
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

function BuildTab() {
  return (
    <BuildWysiwyg
      signupId="sig_t"
      signupMeta={{ title: 'Bake sale', description: 'Bring something sweet' }}
      initialFields={FIELDS}
      initialSlots={[
        {
          id: 'slot_full',
          capacity: 4,
          sortOrder: 0,
          values: { when: '2026-05-21', what: 'Cupcakes', kind: 'Cake', start: '09:00', qty: '3' },
        },
        { id: 'slot_open', capacity: 1, sortOrder: 1, values: { when: '2026-05-21' } },
        { id: 'slot_blank', capacity: null, sortOrder: 2, values: {} },
      ]}
      initialSettings={SETTINGS}
      committedBySlot={{ slot_full: 2 }}
      locale="en"
      fieldDefaults={{ name: 'Untitled', firstChoice: 'Option 1' }}
    />
  );
}

/** What the signup holds, and how its English dates and times read: no message's words. */
const CONTENT = new Set([
  'Bake sale',
  'Bring something sweet',
  ...FIELDS.map((f) => f.label),
  'Cupcakes',
  'Cake',
  'Pie',
  '3',
  'Thu, May 21',
  'x'.repeat(CHOICE_COUNT_FROM),
]);
const isContent = (text: string) =>
  CONTENT.has(text) || /^\d{1,2}:\d{2} [AP]M$/.test(text) || /^\d+$/.test(text);

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
  // A collapsed row's summary is its other values, joined.
  return words.flatMap((text) => text.split(' · '));
}

/**
 * Opens everything the tab can show at once, collecting what it says on the
 * way: the sheet, a slot's editor with its list's menu and a new item long
 * enough to count, the Fields dialog's list, a new field, the reminder field
 * and the date field it blocks, and the group-by menu. `name` finds a
 * control by the message that names it.
 */
function driveTheTab(name: (key: string) => string | RegExp): string[] {
  const seen = [...wordsOnPage()];

  const [firstRow] = screen.getAllByRole('button', { name: name('slot.row') });
  fireEvent.click(firstRow!);
  const editor = screen.getByTestId('slot-editor-slot_full');
  fireEvent.click(within(within(editor).getByTestId('enum-picker')).getAllByRole('button')[0]!);
  seen.push(...wordsOnPage());
  fireEvent.click(within(editor).getByRole('button', { name: name('list.addToList') }));
  fireEvent.change(within(editor).getByRole('textbox', { name: name('list.newItemLabel') }), {
    target: { value: 'x'.repeat(CHOICE_COUNT_FROM) },
  });
  seen.push(...wordsOnPage());
  fireEvent.keyDown(within(editor).getByRole('textbox', { name: name('list.newItemLabel') }), {
    key: 'Escape',
  });
  fireEvent.click(within(editor).getByRole('button', { name: name('editor.done') }));

  fireEvent.click(screen.getByRole('button', { name: name('rail.fields') }));
  const dialog = screen.getByRole('dialog');
  seen.push(...wordsOnPage());
  fireEvent.click(within(dialog).getByRole('button', { name: name('fields.add') }));
  seen.push(...wordsOnPage());
  fireEvent.click(within(dialog).getByRole('button', { name: name('fieldForm.backLabel') }));
  fireEvent.click(
    within(within(dialog).getByTestId('fields-row-f_setup')).getByRole('button', { name: 'Setup' }),
  );
  seen.push(...wordsOnPage());
  fireEvent.click(within(dialog).getByRole('button', { name: name('fieldForm.backLabel') }));
  fireEvent.click(
    within(within(dialog).getByTestId('fields-row-f_when')).getByRole('button', { name: 'When' }),
  );
  seen.push(...wordsOnPage());
  fireEvent.click(within(dialog).getByRole('button', { name: name('fieldForm.backLabel') }));
  const groupBy = within(dialog)
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-haspopup') === 'listbox');
  fireEvent.click(groupBy!);
  seen.push(...wordsOnPage());
  return seen;
}

describe('the Build tab’s text', () => {
  it('comes from the messages its page gives, in the organizer’s language, all of it', () => {
    render(<BuildTab />, { wrapper: standInMessages('sv', BUILD_TAB_NAMESPACES) });
    const seen = driveTheTab((key) => `organizer.build.${key} in sv`);

    const notFromTheCatalog = [...new Set(seen)].filter(
      (text) => !isContent(text) && !/^organizer\.[\w.]+ in sv$/.test(text),
    );
    expect(notFromTheCatalog).toEqual([]);
    // Each place the tab words something, met at least once on the way.
    for (const key of [
      'rail.editing',
      'rail.fields',
      'sheet.titleLabel',
      'sheet.descriptionLabel',
      'group.header',
      'group.addSlot',
      'empty.date',
      'empty.named',
      'slot.row',
      'slot.edit',
      'slot.takenOf',
      'slot.taken',
      'editor.title',
      'editor.signedUp',
      'editor.value',
      'editor.noTime',
      'editor.spots',
      'editor.noLimit',
      'editor.spotsHelp',
      'placeholder.text',
      'placeholder.number',
      'list.addToList',
      'list.newItem',
      'list.count',
      'list.maxLength',
      'fields.label',
      'fields.title',
      'fields.groupBy',
      'fields.noGroup',
      'fields.reorder',
      'fields.reminder',
      'fields.typeCount',
      'fields.delete',
      'fieldType.date',
      'fieldType.time',
      'fields.newTitle',
      'fields.editTitle',
      'fieldForm.name',
      'fieldForm.type',
      'fieldForm.reminder',
      'fieldForm.reminderHelp',
      'fieldForm.reminderTaken',
      'fieldForm.remove',
      'fieldForm.cancel',
      'fieldForm.save',
      'fieldForm.add',
    ]) {
      expect(seen, key).toContain(`organizer.build.${key} in sv`);
    }
  });

  it('marks the Fields dialog, which renders outside the page’s marks, with the organizer’s language', () => {
    render(<BuildTab />, { wrapper: standInMessages('sv', BUILD_TAB_NAMESPACES) });
    fireEvent.click(screen.getByRole('button', { name: 'organizer.build.rail.fields in sv' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('lang', 'sv');
  });

  /** The tab under the messages its page gives in `locale`. */
  const inLanguage = (locale: CatalogLocale) =>
    function Messages({ children }: { children: ReactNode }) {
      return (
        <ClientMessages locale={locale} messages={messagesFor(locale, BUILD_TAB_NAMESPACES)}>
          {children}
        </ClientMessages>
      );
    };

  // A message the page didn't pass shows its key's name and logs an error.
  it.each(CATALOG_LOCALES)('reads only messages its page gives, in %s', (locale) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<BuildTab />, { wrapper: inLanguage(locale) });
    const t = getTranslator(locale, 'organizer.build', {
      onError: (error) => {
        throw error;
      },
    });
    const seen = driveTheTab((key) => {
      if (key === 'rail.fields') return t('rail.fields', { count: FIELDS.length });
      if (key === 'slot.row') {
        const count = t('slot.takenOf', { taken: 2, capacity: 4 });
        return t('slot.row', { kind: 'named', name: 'Cupcakes', count });
      }
      // The rest name their control with no arguments.
      return (t as unknown as (key: string) => string)(key);
    });
    expect(seen.filter((text) => text.startsWith('organizer.'))).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });
});
