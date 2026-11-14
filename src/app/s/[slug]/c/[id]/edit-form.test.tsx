// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ClientMessages } from '@/i18n/ClientMessages';
import { englishMessages, standInMessages } from '@/i18n/testing/client-messages';
import { getTestTranslator } from '@/i18n/testing/translator';
import { getTranslator, messagesFor } from '@/i18n/translator';
import { EDIT_FORM_NAMESPACES } from '../../client-namespaces';
import EditForm from './edit-form';
import { QUANTITY_MAX } from '@/lib/participant-limits';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

/** The form's messages from the Swedish catalog, as a Swedish signup's page passes them. */
function SwedishMessages({ children }: { children: ReactNode }) {
  return (
    <ClientMessages locale="sv" messages={messagesFor('sv', EDIT_FORM_NAMESPACES)}>
      {children}
    </ClientMessages>
  );
}

/** A refused save that says the sign-up can hold at most `remaining` spots. */
function refuseCapacity(remaining: number, requested: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: {
          code: 'capacity_full',
          message: `only ${remaining} left`,
          details: { remaining, requested, capacity: requested },
        },
      }),
    })),
  );
}

function renderForm(
  maxQuantity: number | null,
  initialQuantity = 1,
  // What gives the form its messages: the page's, in English, unless a test says.
  wrapper: (props: { children: ReactNode }) => ReactNode = englishMessages(EDIT_FORM_NAMESPACES),
) {
  render(
    <EditForm
      commitmentId="com_1"
      token="tok"
      initialName="Pat Example"
      initialNotes=""
      initialQuantity={initialQuantity}
      maxQuantity={maxQuantity}
    />,
    { wrapper },
  );
}

describe('<EditForm /> name box', () => {
  // The page gives the form its messages (ClientMessages). Stand-ins show the
  // fields' labels come from them, not the files: each reads as where it was
  // asked for ("participant.fields.name in sv").
  it('takes the fields’ labels from the messages its page passes', () => {
    renderForm(4, 1, standInMessages('sv', EDIT_FORM_NAMESPACES));
    expect(screen.getByLabelText('participant.fields.name in sv')).toHaveValue('Pat Example');
    expect(screen.getByLabelText('participant.fields.notes in sv')).toHaveValue('');
    expect(screen.getByLabelText('participant.fields.spots in sv')).toHaveValue(1);
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('labels the name box “Your name” in English', () => {
    renderForm(1);
    expect(screen.getByLabelText('Your name')).toHaveValue('Pat Example');
  });
});

describe('<EditForm /> quantity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('asks for a quantity only when the slot has room for more than one', () => {
    renderForm(1);
    expect(screen.queryByLabelText('Spots')).not.toBeInTheDocument();
  });

  it('shows the quantity on a slot with room for more', () => {
    renderForm(4, 2);
    const spots = screen.getByLabelText('Spots');
    expect(spots).toHaveValue(2);
    expect(spots).toHaveAttribute('max', '4');
    expect(spots).toHaveAccessibleDescription('You can have up to 4 spots on this slot.');
  });

  // Can't happen while capacity can't drop below what is taken, but if it did,
  // hiding the field would leave the participant no way to hand places back,
  // and a max below what they hold would block every save, even a name edit.
  it('still shows the quantity when more is held than the slot now allows', () => {
    renderForm(1, 2);
    const spots = screen.getByLabelText('Spots');
    expect(spots).toHaveValue(2);
    expect(spots).toHaveAttribute('max', '2');
  });

  it('shows the quantity on an unlimited slot, capped at the shared maximum', () => {
    renderForm(null);
    const spots = screen.getByLabelText('Spots');
    expect(spots).toHaveValue(1);
    // No spots left to cap at, so the shared QUANTITY_MAX is the cap — the same
    // number commitments.ts enforces on the server.
    expect(spots).toHaveAttribute('max', String(QUANTITY_MAX));
  });

  // Sending the default 1 would be harmless today, but leaving it out means a
  // name or notes edit can never touch the quantity at all.
  it('saves without a quantity when it does not ask for one', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(1);

    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Bringing oranges' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ name: 'Pat Example', notes: 'Bringing oranges' });
  });

  // NameSchema checks its 100 characters before trimming, so the spaces have
  // to go before the name is sent, as the sign-up dialog does.
  it('sends the name without spaces after it', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(1);

    const name = 'a'.repeat(99);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: `${name}  ` } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).name).toBe(name);
  });

  it('still refuses a name of only spaces', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: { code: 'invalid_input', message: 'name is required', field: 'name' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(1);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Enter your name, up to 100 characters.')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).name).toBe('');
  });

  // On this page `remaining` is the most the commitment can hold, spots already
  // held included, so it needs the edit page's wording rather than "left".
  it("explains a capacity error in the edit page's own words", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: {
          code: 'capacity_full',
          message: 'only 3 left — you asked for 4',
          suggestion: 'x',
          details: { remaining: 3, requested: 4, capacity: 4 },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'You can have at most 3 spots on this slot, and you asked for 4. Ask for 3 or fewer.',
    );
    expect(alert).not.toHaveTextContent('only 3 left');
    // The line at the top and the cap take the error's number instead of
    // still saying 4, without re-reading the page (which would log another
    // edit-link visit).
    expect(screen.getByText('You can have up to 3 spots on this slot.')).toBeInTheDocument();
    expect(screen.getByLabelText('Spots')).toHaveAttribute('max', '3');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // Someone else took spots since the page loaded, leaving room for only the
  // one the participant already holds.
  it('says "up to 1 spot" after a refusal that leaves 1', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: {
          code: 'capacity_full',
          message: 'only 1 left — you asked for 3',
          suggestion: 'x',
          details: { remaining: 1, requested: 3, capacity: 3 },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(3, 1);

    fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Keep your 1 spot.');
    expect(screen.getByText('You can have up to 1 spot on this slot.')).toBeInTheDocument();
  });

  // The organizer deleted the signup, or the slot, while this page was open.
  it('says the signup is no longer available rather than "not found"', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { code: 'not_found', message: 'commitment not found' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Sorry, this is no longer available. Reload the page to see what has changed.',
    );
    expect(alert).not.toHaveTextContent('commitment not found');
  });

  // The organizer closed the signup while this page was open, and the save
  // asked for more spots.
  it('says sign-ups have closed when more spots are refused', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: { code: 'closed', message: 'signup is not accepting commitments' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You can't add more spots now. Keep the number you have.");
    expect(alert).not.toHaveTextContent('not accepting commitments');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // The same helpers as the sign-up dialog, with the edit page's translator.
  it('takes an error’s words from the messages its page passes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: { code: 'closed', message: 'signup is not accepting commitments' },
        }),
      })),
    );
    renderForm(4, 2, standInMessages('sv', EDIT_FORM_NAMESPACES));

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'participant.errors.closed.change in sv participant.errors.keepNumber in sv',
    );
  });

  it('says the same when a cancel finds the signup gone', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: { code: 'not_found', message: 'commitment not found' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel signup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Sorry, this is no longer available. Reload the page to see what has changed.',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  // Reloaded, the page says the spot was cancelled and links back to the
  // sheet, where the spot shows as free. Sent straight to the sheet, people
  // had no word that the cancel worked.
  it('reloads the page in place after a cancel', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel signup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(router.push).not.toHaveBeenCalled();
    // Nothing to press again until the cancelled page replaces this form.
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled();
  });

  // The sign-up was cancelled, or moved, in another tab while this page was
  // open. The page says which once reloaded, in place of this form.
  it('reloads the page when a save finds the sign-up cancelled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: {
          code: 'conflict',
          message: 'commitment is not active',
          details: { status: 'cancelled' },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Nothing to press again, each press spending the rate limit, meanwhile.
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel signup' })).toBeDisabled();
  });

  // A conflict alone is not a cancelled sign-up.
  it('shows any other conflict without reloading', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: {
          code: 'conflict',
          message: 'commitment is not active',
          details: { status: 'no_show' },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('commitment is not active');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // The page's refresh after a successful save re-reads the limit, but the form
  // stays mounted; the error's number must not keep overriding the fresh one.
  it("drops an error's limit once a later save succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 'capacity_full',
            message: 'only 3 left',
            details: { remaining: 3, requested: 4, capacity: 4 },
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText('You can have up to 3 spots on this slot.');

    fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText('Saved.');
    expect(screen.getByText('You can have up to 4 spots on this slot.')).toBeInTheDocument();
    expect(screen.getByLabelText('Spots')).toHaveAttribute('max', '4');
  });
  // Offline, or a dropped connection: fetch itself rejects.
  it('says nothing was saved, and lets the participant try again, when the save never reaches the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't reach the server, so your changes weren't saved. Check your connection and try again.",
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel signup' })).toBeEnabled();
  });

  // An error page from a proxy, say, rather than the API's JSON.
  it('says nothing was saved when a refused save has no JSON body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Something went wrong, so your changes weren't saved. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says the sign-up was not cancelled when the cancel never reaches the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    renderForm(4, 2);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel signup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't reach the server, so your spot wasn't cancelled. Check your connection and try again.",
    );
    expect(screen.getByRole('button', { name: 'Cancel signup' })).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

// Every word the form shows of its own comes from the messages its page
// passes (`participant.editForm`), in the signup's language.
describe('<EditForm /> words', () => {
  const sv = (key: string) => `participant.editForm.${key} in sv`;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('takes its buttons and the spots line from the messages its page passes', () => {
    renderForm(4, 1, standInMessages('sv', EDIT_FORM_NAMESPACES));
    expect(screen.getByText(sv('spotsMax'))).toBeInTheDocument();
    expect(screen.getByLabelText('participant.fields.spots in sv')).toHaveAccessibleDescription(
      sv('spotsMax'),
    );
    expect(screen.getByRole('button', { name: sv('save') })).toBeEnabled();
    expect(screen.getByRole('button', { name: sv('cancel') })).toBeEnabled();
  });

  it('asks before cancelling, in those messages', async () => {
    let answer: (value: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (answer = resolve))),
    );
    renderForm(4, 1, standInMessages('sv', EDIT_FORM_NAMESPACES));

    fireEvent.click(screen.getByRole('button', { name: sv('cancel') }));
    const question = screen.getByRole('alertdialog', { name: sv('confirmCancel') });
    expect(question).toHaveTextContent(sv('cancelQuestion'));
    expect(screen.getByRole('button', { name: sv('keep') })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: sv('yesCancel') }));
    expect(await screen.findByRole('button', { name: sv('cancelling') })).toBeDisabled();
    answer({ ok: true, json: async () => ({ data: {} }) });
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });

  it('says it is saving, then saved, in those messages', async () => {
    let answer: (value: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (answer = resolve))),
    );
    renderForm(4, 1, standInMessages('sv', EDIT_FORM_NAMESPACES));

    fireEvent.click(screen.getByRole('button', { name: sv('save') }));
    expect(await screen.findByRole('button', { name: sv('saving') })).toBeDisabled();
    answer({ ok: true, json: async () => ({ data: {} }) });
    expect(await screen.findByRole('status')).toHaveTextContent(sv('saved'));
  });

  it.each([
    ['a save that never reaches the server', 'save', 'saveUnreachable', true],
    ['a save refused with no JSON body', 'save', 'saveUnreadable', false],
    ['a cancel that never reaches the server', 'cancel', 'cancelUnreachable', true],
  ] as const)('explains %s in those messages', async (_, action, key, offline) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        offline
          ? Promise.reject(new TypeError('Failed to fetch'))
          : {
              ok: false,
              json: async () => {
                throw new SyntaxError('Unexpected token <');
              },
            },
      ),
    );
    renderForm(4, 1, standInMessages('sv', EDIT_FORM_NAMESPACES));

    fireEvent.click(screen.getByRole('button', { name: sv(action) }));
    if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: sv('yesCancel') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(sv(key));
  });

  it('counts spots as before in English, many and 1', async () => {
    renderForm(1234, 1);
    expect(screen.getByText('You can have up to 1234 spots on this slot.')).toBeInTheDocument();

    cleanup();
    refuseCapacity(1, 3);
    renderForm(3, 1);
    fireEvent.change(screen.getByLabelText('Spots'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('You can have up to 1 spot on this slot.')).toBeInTheDocument();
  });

  it('counts spots in Swedish, many and 1, from the Swedish catalog', async () => {
    renderForm(1234, 1, SwedishMessages);
    // Swedish groups thousands with a no-break space (the query's whitespace
    // is matched loosely), so a count never breaks across lines.
    const line = screen.getByText('Du kan ha upp till 1 234 platser på det här passet.');
    expect(line.textContent).toContain('1\u00a0234');
    expect(screen.getByRole('button', { name: 'Spara' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Avboka' })).toBeEnabled();

    cleanup();
    refuseCapacity(1, 3);
    renderForm(3, 1, SwedishMessages);
    fireEvent.change(screen.getByLabelText('Platser'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }));
    expect(
      await screen.findByText('Du kan ha upp till 1 plats på det här passet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Behåll din plats.');
  });

  // The line can't show fewer than the spots held, so never 0, but the
  // message reads right for every count all the same.
  it.each([
    [
      0,
      'You can have up to 0 spots on this slot.',
      'Du kan ha upp till 0 platser på det här passet.',
    ],
    [1, 'You can have up to 1 spot on this slot.', 'Du kan ha upp till 1 plats på det här passet.'],
    [
      2,
      'You can have up to 2 spots on this slot.',
      'Du kan ha upp till 2 platser på det här passet.',
    ],
  ])('words %i spots in both languages', (max, english, swedish) => {
    expect(getTestTranslator('participant.editForm')('spotsMax', { max })).toBe(english);
    const sv = getTranslator('sv', 'participant.editForm', {
      onError: (error) => {
        throw error;
      },
    });
    expect(sv('spotsMax', { max })).toBe(swedish);
  });
});
