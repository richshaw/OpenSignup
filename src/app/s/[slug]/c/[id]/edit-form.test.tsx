// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditForm from './edit-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

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
    expect(spots).toHaveAccessibleDescription('Up to 4');
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
});
