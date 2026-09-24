// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ACTION_SIZING } from './slot-format';
import {
  SignupViewBody,
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
    expect(screen.queryByLabelText('Qty')).not.toBeInTheDocument();
  });

  it('asks for a quantity when more than one place is left', async () => {
    openRow(/^Sign up for .*Owls/);
    expect(await screen.findByLabelText('Qty', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
