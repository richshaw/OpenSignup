// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditForm from './edit-form';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function renderForm(maxQuantity: number | null, initialQuantity = 1) {
  render(
    <EditForm
      commitmentId="com_1"
      token="tok"
      initialName="Pat Example"
      initialNotes=""
      initialQuantity={initialQuantity}
      maxQuantity={maxQuantity}
      slug="example"
    />,
  );
}

describe('<EditForm /> quantity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    router.refresh.mockClear();
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

  it('shows the quantity on an unlimited slot, with no cap', () => {
    renderForm(null);
    const spots = screen.getByLabelText('Spots');
    expect(spots).toHaveValue(1);
    expect(spots).not.toHaveAttribute('max');
  });

  // Sending the default 1 would be harmless today, but leaving it out means a
  // name or notes edit can never touch the quantity at all.
  it('saves without a quantity when it does not ask for one', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm(1);

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Bringing oranges' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ name: 'Pat Example', notes: 'Bringing oranges' });
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
});
