// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        requireEmail
        sendsReminder={false}
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
    requireEmail = true,
    slotAt = null,
    sendsReminder = false,
  }: {
    spotsLeft?: number | null;
    capacity?: number | null;
    requireEmail?: boolean;
    slotAt?: string | null;
    sendsReminder?: boolean;
  } = {}) {
    render(
      <CommitDialog
        slotId="slot_1"
        slotTitle="Cookies"
        actionName="Sat, May 16, Cookies, Vinland Elementary"
        slotAt={slotAt}
        slotHasTime={false}
        spotsLeft={spotsLeft}
        capacity={capacity}
        signupTitle="Snack duty"
        slug="example"
        requireEmail={requireEmail}
        sendsReminder={sendsReminder}
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
    expect(screen.getByLabelText('Email')).toHaveValue('jordan@example.test');
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

  // The row's own count is behind the sheet and hidden from assistive tech
  // while it is open, so the header says how many are left. It sits beside the
  // heading, not in it, and describes both the dialog and the Spots field.
  it('says how many spots are left in the header, and describes the sheet with it', async () => {
    openSheet({ spotsLeft: 3, capacity: 5 });
    const spots = await screen.findByLabelText('Spots', {}, settle);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('3 of 5 spots left')).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Sign up for Sat, May 16, Cookies, Vinland Elementary');
    expect(dialog).toHaveAccessibleDescription('3 of 5 spots left');
    expect(screen.getByRole('heading')).not.toHaveTextContent('spots left');
    expect(spots).toHaveAccessibleDescription('3 of 5 spots left');
  });

  // With one spot left there is no Spots field to describe, so the dialog's
  // own description is the only place a screen reader hears it.
  it('says it on a slot down to its last spot, where there is no Spots field', async () => {
    openSheet({ spotsLeft: 1, capacity: 3 });
    await screen.findByLabelText('Your name', {}, settle);
    expect(screen.queryByLabelText('Spots')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('1 of 3 spots left');
  });

  it('says nothing about spots left on an unlimited slot', async () => {
    openSheet({ spotsLeft: null, capacity: null });
    const spots = await screen.findByLabelText('Spots', {}, settle);
    expect(screen.queryByText(/spots left/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveAccessibleDescription();
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

  // The organizer deleted the slot or the whole signup after this page loaded.
  it('says a removed slot or signup is no longer available, not "not found"', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { code: 'not_found', message: 'signup not found' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    // jsdom leaves scrollIntoView out, and the dialog calls it on the alert.
    Element.prototype.scrollIntoView = vi.fn();
    try {
      openSheet();
      await screen.findByLabelText('Your name', {}, settle);
      fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jordan Fields' } });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@example.test' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      const alert = await screen.findByRole('alert', {}, settle);
      expect(alert).toHaveTextContent('Sorry, this is no longer available.');
      expect(alert).toHaveTextContent('Reload the page to see what has changed.');
      expect(alert).not.toHaveTextContent('signup not found');
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
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

  it('requires the email unless the signup makes it optional', async () => {
    openSheet();
    expect(await screen.findByLabelText('Email', {}, settle)).toBeRequired();
    expect(screen.queryByText(/We'll email you your link/)).not.toBeInTheDocument();
    cleanup();

    openSheet({ requireEmail: false });
    const email = await screen.findByLabelText('Email (optional)', {}, settle);
    expect(email).not.toBeRequired();
    // The label already says it is optional; the help says what it is for.
    expect(email).toHaveAccessibleDescription(
      "We'll email you your link to change or cancel. Without an email, save the link we show you after you sign up.",
    );
  });

  it('promises a reminder only where the slot will get one', async () => {
    openSheet({ requireEmail: false, sendsReminder: true });
    expect(
      await screen.findByLabelText('Email (optional)', {}, settle),
    ).toHaveAccessibleDescription(
      "We'll email you your link to change or cancel, and a reminder before your slot. Without an email, save the link we show you after you sign up.",
    );
  });

  it('still suggests a fix for a mistyped email when it is optional', async () => {
    openSheet({ requireEmail: false });
    const email = await screen.findByLabelText('Email (optional)', {}, settle);
    fireEvent.change(email, { target: { value: 'pat@gmial.com' } });
    fireEvent.click(await screen.findByRole('button', { name: 'pat@gmail.com' }, settle));
    expect(email).toHaveValue('pat@gmail.com');
  });

  describe('where the email is optional', () => {
    const editUrl = 'https://example.test/s/example/c/com_1';

    async function signUpWithEmail(email: string, opts: { slotAt?: string | null } = {}) {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { commitment: { id: 'com_1' }, editUrl } }),
      }));
      vi.stubGlobal('fetch', fetchMock);
      openSheet({ requireEmail: false, ...opts });
      await screen.findByLabelText('Your name', {}, settle);
      fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jordan Fields' } });
      fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: email } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await screen.findByRole('heading', { name: "You're in." }, settle);
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      return JSON.parse(String(init.body)) as Record<string, unknown>;
    }

    // jsdom has no clipboard.
    function stubClipboard(writeText: (text: string) => Promise<void>) {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it('sends no email when the box is blank, and says the link will not be emailed', async () => {
      const body = await signUpWithEmail('  ');
      expect(body).not.toHaveProperty('email');
      expect(
        screen.getByText(
          "Save this link now: we won't email it, and only this browser remembers it.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: editUrl })).toBeInTheDocument();
      // No slot date, so no calendar button to mention.
      expect(screen.queryByText(/Add to calendar/)).not.toBeInTheDocument();
    });

    it('says Add to calendar saves the link when that button is there', async () => {
      await signUpWithEmail('', { slotAt: '2030-04-06T12:00:00.000Z' });
      expect(screen.getByText(/Add to calendar saves the link too\./)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
    });

    // The link is how they change or cancel, so nothing offers to post it.
    it('offers Copy link, not Share link, and says when it copied', async () => {
      const writeText = vi.fn(async () => {});
      stubClipboard(writeText);
      await signUpWithEmail('', { slotAt: '2030-04-06T12:00:00.000Z' });
      expect(screen.queryByRole('button', { name: 'Share link' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
      const status = screen.getByRole('status');
      expect(status).toBeEmptyDOMElement();

      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await waitFor(() => expect(status).toHaveTextContent('Link copied.'), settle);
      expect(writeText).toHaveBeenCalledWith(editUrl);
    });

    it('says to copy the link by hand when the browser will not', async () => {
      const writeText = vi.fn(async () => {
        throw new Error('not allowed');
      });
      stubClipboard(writeText);
      await signUpWithEmail('');
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await waitFor(
        () =>
          expect(screen.getByRole('status')).toHaveTextContent(
            "Couldn't copy it. Select the link above and copy it yourself.",
          ),
        settle,
      );
    });

    it('reads as usual when they give an email after all', async () => {
      const body = await signUpWithEmail('jordan@example.test');
      expect(body).toMatchObject({ email: 'jordan@example.test' });
      expect(screen.getByText(/Bookmark this link to edit or cancel later/)).toBeInTheDocument();
      expect(screen.queryByText(/we won't email it/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Share link' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    });

    // Someone who chose to leave it out once should not send it by accident.
    it('fills in a remembered name but not a remembered email', async () => {
      window.localStorage.setItem(
        'opensignup:lastCommit',
        JSON.stringify({ name: 'Jordan Fields', email: 'jordan@example.test' }),
      );
      openSheet({ requireEmail: false });
      expect(await screen.findByLabelText('Your name', {}, settle)).toHaveValue('Jordan Fields');
      expect(screen.getByLabelText('Email (optional)')).toHaveValue('');
    });

    it('keeps the remembered email after a sign-up without one', async () => {
      window.localStorage.setItem(
        'opensignup:lastCommit',
        JSON.stringify({ name: 'Jordan', email: 'jordan@example.test' }),
      );
      await signUpWithEmail('');
      expect(JSON.parse(window.localStorage.getItem('opensignup:lastCommit') ?? 'null')).toEqual({
        name: 'Jordan Fields',
        email: 'jordan@example.test',
      });
    });

    // The organizer made it required again after the page rendered.
    it('makes the box required when the server refuses a blank email', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 'invalid_input',
              message: 'Email is required for this signup.',
              field: 'email',
              suggestion: 'Add your email and try again.',
            },
          }),
        })),
      );
      // jsdom leaves scrollIntoView out, and the dialog calls it on the alert.
      Element.prototype.scrollIntoView = vi.fn();
      try {
        openSheet({ requireEmail: false });
        await screen.findByLabelText('Your name', {}, settle);
        fireEvent.change(screen.getByLabelText('Your name'), {
          target: { value: 'Jordan Fields' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        const alert = await screen.findByRole('alert', {}, settle);
        expect(alert).toHaveTextContent('Email is required for this signup.');
        const email = screen.getByLabelText('Email');
        expect(email).toBeRequired();
        expect(email).not.toHaveAccessibleDescription();
        expect(screen.queryByLabelText('Email (optional)')).not.toBeInTheDocument();
        expect(screen.queryByText(/We'll email you your link/)).not.toBeInTheDocument();
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });
  });

  // The service's own text for this is developer shorthand; the participant
  // gets a sentence built from the numbers in `details` instead.
  it('explains a capacity error in plain words instead of the server text', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'capacity_full',
          message: 'only 1 left, you asked for 2',
          suggestion: 'lower the quantity to 1 or fewer',
          details: { remaining: 1, requested: 2, capacity: 3, alternatives: [] },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    // jsdom does no layout and leaves scrollIntoView out, and the dialog calls
    // it to bring the alert on screen.
    Element.prototype.scrollIntoView = vi.fn();

    try {
      // The page rendered with 3 of 4 left; since then someone took 2 and the
      // organizer lowered the capacity to 3.
      openSheet({ spotsLeft: 3, capacity: 4 });
      await screen.findByLabelText('Your name', {}, settle);
      fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Pat Example' } });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pat@example.com' } });
      fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      const alert = await screen.findByRole('alert', {}, settle);
      expect(alert).toHaveTextContent('Only 1 spot is left, and you asked for 2.');
      expect(alert).toHaveTextContent('Ask for 1 instead.');
      expect(alert).not.toHaveTextContent('lower the quantity');

      // The header and the cap take the server's numbers, capacity included,
      // so they agree with the error instead of still saying 3 of 4.
      expect(screen.getByText('1 of 3 spots left')).toBeInTheDocument();
      expect(screen.getByLabelText('Spots')).toHaveAttribute('max', '1');

      // They last until the sheet closes; reopened, it shows the page's
      // numbers again rather than an old error's.
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), settle);
      fireEvent.click(screen.getByRole('button', { name: /^Sign up for / }));
      expect(await screen.findByText('3 of 4 spots left', {}, settle)).toBeInTheDocument();
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
      vi.unstubAllGlobals();
    }
  });
});
