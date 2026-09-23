// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CommitDialog from './commit-dialog';
import { ACTION_SIZING } from './slot-format';

// The row-level tests all run in `mode="preview"`, which renders a *disabled*
// stand-in button. This file covers the real trigger — the only button a
// participant ever taps, and the only thing commit-dialog.tsx contributes.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('<CommitDialog /> trigger', () => {
  function renderTrigger() {
    render(
      <CommitDialog
        slotId="slot_1"
        slotTitle="Cookies"
        actionName="Sat, May 16, Cookies, Vinland Elementary"
        slotAt={null}
        slotHasTime={false}
        spotsLeft={null}
        capacity={null}
        signupTitle="Snack duty"
        slug="example"
      />,
    );
  }

  it('is named after its slot, so a list of them is distinguishable', () => {
    renderTrigger();
    expect(
      screen.getByRole('button', { name: 'Sign up for Sat, May 16, Cookies, Vinland Elementary' }),
    ).toBeInTheDocument();
  });

  it('carries the shared action geometry, including the 44px touch floor', () => {
    renderTrigger();
    const button = screen.getByRole('button', { name: /^Sign up for / });
    for (const cls of ACTION_SIZING.split(' ')) {
      expect(button).toHaveClass(cls);
    }
  });
});

describe('<CommitDialog /> sheet', () => {
  // Which field the sheet opens on depends on what a previous commit left in
  // localStorage, so no test may inherit another's. Without this the focus
  // tests below pass or fail on the order the file happens to run in.
  beforeEach(() => {
    window.localStorage.clear();
  });

  function openSheet({
    spotsLeft = null,
    capacity = null,
  }: { spotsLeft?: number | null; capacity?: number | null } = {}) {
    render(
      <CommitDialog
        slotId="slot_1"
        slotTitle="Cookies"
        actionName="Sat, May 16, Cookies, Vinland Elementary"
        slotAt={null}
        slotHasTime={false}
        spotsLeft={spotsLeft}
        capacity={capacity}
        signupTitle="Snack duty"
        slug="example"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Sign up for / }));
  }

  // jsdom + Radix mount in several passes, and these run alongside the rest of
  // the suite; the 1s default left them close enough to the edge to flake on a
  // loaded machine.
  const settle = { timeout: 5000 };

  // The reason this is a real modal and not the fixed overlay it replaced: on a
  // phone the page kept scrolling under that overlay, so the row you tapped
  // slid away mid-form and the sheet read as a floating toast. Radix's
  // scroll-lock marks the body with `data-scroll-locked`, which its stylesheet
  // turns into `overflow: hidden` plus `overscroll-behavior: contain`.
  it('locks page scroll while open and releases it on close', async () => {
    openSheet();
    await waitFor(() => expect(document.body).toHaveAttribute('data-scroll-locked'), settle);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.body).not.toHaveAttribute('data-scroll-locked'), settle);
  });

  // On screen the heading is the slot's bare name. The name it is *announced*
  // by carries the group and meta the trigger uses, because "Cookies" repeats
  // on every date of a grouped signup and does not say what the sheet is for.
  it('is announced with the same disambiguated name as its trigger', async () => {
    openSheet();
    const dialog = await screen.findByRole('dialog', {}, settle);

    expect(dialog).toHaveAccessibleName('Sign up for Sat, May 16, Cookies, Vinland Elementary');
    expect(screen.getByRole('heading')).toHaveTextContent('Cookies');
  });

  it('closes on Escape', async () => {
    openSheet();
    const dialog = await screen.findByRole('dialog', {}, settle);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), settle);
  });

  it('opens with the caret in the first field, not on the close button', async () => {
    openSheet();
    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveFocus(), settle);
  });

  // The bug the scoped refs fixed: a document-wide `input[name="email"]` query
  // focused whichever such input came first in the DOM, not this sheet's.
  it('skips to the email field when a previous commit left a name behind', async () => {
    window.localStorage.setItem(
      'opensignup:lastCommit',
      JSON.stringify({ name: 'Jordan Fields', email: 'jordan@example.test' }),
    );
    openSheet();

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus(), settle);
    expect(screen.getByLabelText('Your name')).toHaveValue('Jordan Fields');
  });

  // Backdrop tap, Escape and the close X all route through one `onClose`, so
  // this guard is the only thing standing between a mid-POST dismissal and a
  // participant who cannot tell whether they got the spot.
  it('refuses to close while the commit is in flight, then closes once it lands', async () => {
    let release!: (value: unknown) => void;
    const inFlight = new Promise((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(() => inFlight as Promise<Response>);
    vi.stubGlobal('fetch', fetchMock);

    openSheet();
    await screen.findByLabelText('Your name', {}, settle);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jordan Fields' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce(), settle);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Signing up…' })).toBeDisabled(), settle);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    release({
      ok: true,
      json: async () => ({
        data: { commitment: { id: 'com_1' }, editUrl: 'https://example.test/s/example/c/com_1' },
      }),
    });

    await screen.findByRole('heading', { name: "You're in." }, settle);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), settle);

    vi.unstubAllGlobals();
  });

  // With one place open, 1 is the only quantity the server accepts, so a Spots
  // field could only be left alone or turned into an error.
  it('asks for a quantity only when more than one place is open', async () => {
    openSheet({ spotsLeft: 1 });
    await screen.findByLabelText('Your name', {}, settle);
    expect(screen.queryByLabelText('Spots')).not.toBeInTheDocument();
    cleanup();

    openSheet({ spotsLeft: 3 });
    expect(await screen.findByLabelText('Spots', {}, settle)).toHaveValue(1);
    cleanup();

    openSheet({ spotsLeft: null });
    expect(await screen.findByLabelText('Spots', {}, settle)).toHaveValue(1);
  });

  it('caps the spots at what is left, and not at all on an unlimited slot', async () => {
    openSheet({ spotsLeft: 3, capacity: 5 });
    expect(await screen.findByLabelText('Spots', {}, settle)).toHaveAttribute('max', '3');
    cleanup();

    openSheet({ spotsLeft: null, capacity: null });
    expect(await screen.findByLabelText('Spots', {}, settle)).not.toHaveAttribute('max');
  });

  // The row's "3/5" is behind the sheet and hidden from assistive tech while it
  // is open, so the header says it and the field is described by it. It stays
  // out of the heading's name, which is the slot's.
  it('says how many spots are left in the header, and describes the field with it', async () => {
    openSheet({ spotsLeft: 3, capacity: 5 });
    const spots = await screen.findByLabelText('Spots', {}, settle);
    expect(screen.getByText('3 of 5 spots left')).toBeInTheDocument();
    expect(spots).toHaveAccessibleDescription('3 of 5 spots left');
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Sign up for Sat, May 16, Cookies, Vinland Elementary',
    );
  });

  it('says nothing about spots left on an unlimited slot', async () => {
    openSheet({ spotsLeft: null, capacity: null });
    const spots = await screen.findByLabelText('Spots', {}, settle);
    expect(screen.queryByText(/spots left/)).not.toBeInTheDocument();
    expect(spots).not.toHaveAccessibleDescription();
  });

  it('does not send an ask for more spots than are left', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      openSheet({ spotsLeft: 3 });
      await screen.findByLabelText('Spots', {}, settle);
      fireEvent.change(screen.getByLabelText('Your name'), {
        target: { value: 'Jordan Fields' },
      });
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'jordan@example.test' },
      });
      fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(screen.getByLabelText('Spots')).toBeInvalid();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('commits one place when it does not ask', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { commitment: { id: 'com_1' }, editUrl: 'https://example.test/s/example/c/com_1' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    openSheet({ spotsLeft: 1 });
    await screen.findByLabelText('Your name', {}, settle);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jordan Fields' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await screen.findByRole('heading', { name: "You're in." }, settle);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ quantity: 1 });

    vi.unstubAllGlobals();
  });
});
