// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { ACTION_SIZING } from './slot-format';
import {
  SignupViewBody,
  toSignupViewFields,
  toSignupViewSlots,
  type SignupViewField,
  type SignupViewSlot,
} from './signup-view';

// Only the 'live' tests mount the real CommitDialog, which calls useRouter().
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const FIELDS: SignupViewField[] = [
  { ref: 'date', label: 'Date', fieldType: 'date' },
  { ref: 'team', label: 'Team', fieldType: 'text' },
];

const SLOTS: SignupViewSlot[] = [
  {
    id: 's1',
    ref: 's1',
    values: { date: '2026-05-17', team: 'Hawks' },
    slotAt: null,
    hasTime: false,
    capacity: 2,
    status: 'open',
    committed: 0,
  },
];

const SIGNUP = { title: 'Snack duty', description: null, status: 'open' as const };

describe('<SignupViewBody mode="showcase" />', () => {
  it('renders the row action as an inert span styled like the active button', () => {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="showcase"
      />,
    );

    const labels = screen.getAllByText('Sign up');
    expect(labels).toHaveLength(1);
    const pill = labels[0]!;
    expect(pill.tagName).toBe('SPAN');
    expect(pill).not.toHaveAttribute('aria-hidden');
    expect(pill).toHaveClass('bg-brand');
    expect(pill).not.toHaveClass('opacity-60');
    expect(pill).not.toHaveClass('cursor-not-allowed');
  });

  it('does not render the preview banner in showcase mode', () => {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="showcase"
      />,
    );
    expect(screen.queryByText('Preview')).toBeNull();
    expect(
      screen.queryByText(/This signup is live\. The page below shows what visitors see\./),
    ).toBeNull();
  });

  it('preview mode still renders a disabled Sign-up button (regression guard)', () => {
    render(
      <SignupViewBody
        signup={{ ...SIGNUP, status: 'draft' }}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
    const button = screen.getByRole('button', { name: 'Sign up for Sun, May 17, Hawks' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-60');
  });

  it('demotes the title to h2 so an embedding page keeps a single h1', () => {
    // Showcase mode is embedded in a page that already has its own h1 (the
    // landing hero). Two h1s on one page is an SEO defect.
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="showcase"
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Snack duty' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});

describe('<SignupViewBody /> heading level', () => {
  // Only 'preview' is exercised here: 'live' mounts the whole CommitDialog.
  // Both take the same non-showcase branch, so preview is a faithful stand-in.
  it('keeps the title as the h1 outside showcase mode, where it is the page heading', () => {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={SLOTS}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Snack duty' })).toBeInTheDocument();
  });
});

describe('<SignupViewBody /> slot row', () => {
  // Distinct dates: the primary field is what each button is named after, so
  // sharing one would hide the very collision this guards against.
  const MULTI: SignupViewSlot[] = [
    {
      ...SLOTS[0]!,
      id: 'cap1',
      values: { date: '2026-05-17', team: 'Hawks' },
      capacity: 1,
      committed: 0,
    },
    {
      ...SLOTS[0]!,
      id: 'cap12',
      values: { date: '2026-05-18', team: 'Hawks' },
      capacity: 12,
      committed: 10,
    },
    {
      ...SLOTS[0]!,
      id: 'uncapped',
      values: { date: '2026-05-19', team: 'Hawks' },
      capacity: null,
      committed: 0,
    },
  ];

  function renderRows() {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={MULTI}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
  }

  it('drops the "0/1" counter but keeps a real fraction', () => {
    renderRows();
    expect(screen.queryByText('0/1')).toBeNull();
    expect(screen.getByText('10/12')).toBeInTheDocument();
  });

  it('does not render a bare "0" for an uncapped slot', () => {
    renderRows();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('gives a counter a screen-reader sentence, not a slash', () => {
    renderRows();
    expect(screen.getByText('10 of 12 signed up')).toHaveClass('sr-only');
  });

  it('lets the meta line wrap instead of clamping the last segment away', () => {
    // The location was being truncated off every row on a 390px screen.
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={[...FIELDS, { ref: 'where', label: 'Where', fieldType: 'text' }]}
        groupByRef={null}
        slots={[
          {
            ...SLOTS[0]!,
            values: { date: '2026-05-17', team: 'Hawks', where: 'Sunnyvale Sports Complex' },
          },
        ]}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
    const meta = screen.getByText('Hawks · Sunnyvale Sports Complex');
    expect(meta).toHaveClass('line-clamp-3');
    expect(meta).toHaveClass('sm:line-clamp-2');
    expect(meta).not.toHaveClass('truncate');
  });

  it('disambiguates rows on a grouped signup, where the title is only the time', () => {
    // pickPrimaryField skips the group field, so every row's title here is its
    // time: without the group label in the name, both buttons are "9:00 AM".
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={[
          { ref: 'date', label: 'Date', fieldType: 'date' },
          { ref: 'time', label: 'Time', fieldType: 'time' },
        ]}
        groupByRef="date"
        slots={[
          { ...SLOTS[0]!, id: 'g1', values: { date: '2026-05-17', time: '09:00' } },
          { ...SLOTS[0]!, id: 'g2', values: { date: '2026-05-18', time: '09:00' } },
        ]}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Sign up for Sun, May 17, 9:00\u00a0AM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up for Mon, May 18, 9:00\u00a0AM' })).toBeInTheDocument();
  });

  it('names each button after its own slot, not a bare "Sign up"', () => {
    // Sixteen identically-named buttons give a screen-reader user no way to
    // tell which slot they are committing to.
    renderRows();
    expect(screen.getByRole('button', { name: 'Sign up for Sun, May 17, Hawks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up for Mon, May 18, Hawks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up for Tue, May 19, Hawks' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
  });

  it('gives Full, Closed and Sign up the same box, not a narrow label beside a pill', () => {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={[
          { ...MULTI[0]!, id: 'open' },
          { ...MULTI[0]!, id: 'full', committed: 1 },
          { ...MULTI[0]!, id: 'shut', status: 'closed' },
        ]}
        slug="example"
        mode="preview"
        showStateBanner={false}
      />,
    );
    // Assert against ACTION_SIZING rather than naming a class: the invariant
    // is "every state carries the same geometry", which survives a token
    // change (w-24 -> w-[96px]) and still fails if one call site drifts.
    const actions = [
      screen.getByText('Full'),
      screen.getByText('Closed'),
      screen.getByRole('button', { name: /^Sign up for / }),
    ];
    for (const el of actions) {
      for (const cls of ACTION_SIZING.split(' ')) expect(el).toHaveClass(cls);
    }
  });

  it('keeps every row action at a 44px minimum touch target on mobile', () => {
    renderRows();
    for (const button of screen.getAllByRole('button', { name: /^Sign up for / })) {
      expect(ACTION_SIZING).toContain('min-h-11');
      for (const cls of ACTION_SIZING.split(' ')) expect(button).toHaveClass(cls);
    }
  });
});

describe('<SignupViewBody mode="live" /> quantity', () => {
  // Places left is capacity less what is taken, so one row has a single place
  // open and the other two. Only the second has a quantity worth asking for.
  const LIVE: SignupViewSlot[] = [
    {
      ...SLOTS[0]!,
      id: 'one-left',
      values: { date: '2026-05-17', team: 'Hawks' },
      capacity: 12,
      committed: 11,
    },
    {
      ...SLOTS[0]!,
      id: 'two-left',
      values: { date: '2026-05-24', team: 'Owls' },
      capacity: 12,
      committed: 10,
    },
  ];

  function openRow(team: RegExp) {
    render(
      <SignupViewBody
        signup={SIGNUP}
        fields={FIELDS}
        groupByRef={null}
        slots={LIVE}
        slug="example"
        mode="live"
        showStateBanner={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: team }));
  }

  it('leaves the quantity out when one place is left', async () => {
    openRow(/^Sign up for .*Hawks/);
    await screen.findByLabelText('Your name', {}, { timeout: 5000 });
    expect(screen.queryByLabelText('Spots')).not.toBeInTheDocument();
  });

  it('asks for a quantity when more than one place is left', async () => {
    openRow(/^Sign up for .*Owls/);
    expect(await screen.findByLabelText('Spots', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('"Add to calendar" on a signup with several time fields', () => {
  // A trip whose reminders come from the departure date, so the departure time
  // is the one paired with it. The return time says nothing about when the
  // slot starts.
  const field = (
    ref: string,
    fieldType: 'date' | 'time',
    sortOrder: number,
  ): SlotFieldDefinition => ({
    id: `fld_${ref}`,
    ref,
    label: ref,
    fieldType,
    sortOrder,
    config: { fieldType },
  });
  const slot = (id: string, values: Record<string, string>, slotAt: string) => ({
    id,
    ref: id,
    values,
    slotAt: new Date(slotAt),
    capacity: null,
    status: 'open',
  });
  const TRIP = {
    settings: { reminderFromFieldRef: 'depart-date' },
    fields: [
      field('depart-date', 'date', 0),
      field('depart-time', 'time', 1),
      field('return-date', 'date', 2),
      field('return-time', 'time', 3),
    ],
    slots: [
      // No departure time, so the server stored the date-only noon anchor.
      slot(
        'no-depart-time',
        { 'depart-date': '2026-11-18', 'return-time': '17:00' },
        '2026-11-18T12:00:00.000Z',
      ),
      slot(
        'depart-time',
        { 'depart-date': '2026-11-18', 'depart-time': '09:30', 'return-time': '17:00' },
        '2026-11-18T09:30:00.000Z',
      ),
    ],
  };

  it('says a slot has a time only when its paired time is filled in', () => {
    const bySlot = new Map(toSignupViewSlots(TRIP).map((s) => [s.id, s.hasTime]));
    expect(bySlot.get('no-depart-time')).toBe(false);
    expect(bySlot.get('depart-time')).toBe(true);
  });

  // jsdom's Blob has no text().
  function readBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  /** Signs up for one slot and returns the calendar file it offers. */
  async function downloadIcs(slotId: string): Promise<string> {
    const settle = { timeout: 5000 };
    const blobs: Blob[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return 'blob:ics';
    };
    URL.revokeObjectURL = () => {};
    // jsdom does not implement navigation, which a download link's click is.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: { commitment: { id: 'com_1' }, editUrl: 'https://example.test/s/trip/c/com_1' },
        }),
      })),
    );
    try {
      render(
        <SignupViewBody
          signup={{ title: 'Trip', description: null, status: 'open' }}
          fields={toSignupViewFields(TRIP.fields)}
          groupByRef={null}
          slots={toSignupViewSlots(TRIP).filter((s) => s.id === slotId)}
          slug="trip"
          mode="live"
          showStateBanner={false}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /^Sign up for / }));
      await screen.findByLabelText('Your name', {}, settle);
      fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Pat Example' } });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pat@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Add to calendar' }, settle));
      expect(blobs).toHaveLength(1);
      return await readBlob(blobs[0]!);
    } finally {
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  }

  it('exports an all-day event when the paired time is blank, whatever other time is filled in', async () => {
    const ics = await downloadIcs('no-depart-time');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261118');
    expect(ics).toContain('DTEND;VALUE=DATE:20261119');
    expect(ics).not.toContain('T120000');
  });

  it('exports a timed event when the paired time is filled in', async () => {
    const ics = await downloadIcs('depart-time');
    expect(ics).toContain('DTSTART:20261118T093000');
    expect(ics).toContain('DTEND:20261118T103000');
  });
});
