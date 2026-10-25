// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BuildBridge, useBuildBridge } from '@/components/signup/BuildBridge';
import { BuildWysiwyg } from './BuildWysiwyg';
import type { SignupSettings } from '@/schemas/signups';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/app/signups/sig_1/build',
}));

const settings: SignupSettings = {
  requireEmail: true,
  allowNotes: true,
  showWhoSignedUp: true,
  lockoutHoursBeforeSlot: 0,
  sendReminders: true,
  groupByFieldRefs: [],
};

const baseProps = {
  signupId: 'sig_t',
  signupMeta: {
    title: 'Sample',
    description: 'd',
  },
  initialFields: [],
  initialSlots: [],
  initialSettings: settings,
  status: 'draft' as const,
  committedBySlot: {},
};

function findSheet(container: HTMLElement): HTMLElement | null {
  return container.querySelector('div[class*="border-t-brand"]');
}

describe('BuildWysiwyg — responsive sheet layout', () => {
  it('applies mobile-first full-bleed + md-clamp classes', () => {
    const { container } = render(<BuildWysiwyg {...baseProps} />);
    const sheet = findSheet(container);
    expect(sheet).toBeTruthy();
    const cls = sheet!.className;
    // Mobile: full-bleed, square corners.
    expect(cls).toMatch(/\bw-full\b/);
    expect(cls).toMatch(/\brounded-none\b/);
    // Desktop: max-width clamp + rounded corners.
    expect(cls).toMatch(/md:max-w-\[580px\]/);
    expect(cls).toMatch(/\bmd:rounded-xl\b/);
    // mx-auto for desktop centring.
    expect(cls).toMatch(/\bmx-auto\b/);
  });

  it('grows the desktop max-width with field count', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `f${i}`,
        ref: `f${i}`,
        label: `F${i}`,
        fieldType: 'text' as const,
        sortOrder: i,
        config: { fieldType: 'text' as const, maxLength: 200 },
      }));
    const four = render(<BuildWysiwyg {...baseProps} initialFields={make(4)} />);
    expect(findSheet(four.container)!.className).toMatch(/md:max-w-\[720px\]/);
    four.unmount();

    const six = render(<BuildWysiwyg {...baseProps} initialFields={make(6)} />);
    expect(findSheet(six.container)!.className).toMatch(/md:max-w-\[960px\]/);
  });
});

describe('BuildWysiwyg — spots taken', () => {
  it('shows each slot its own count, and 0 on a slot nobody has taken', () => {
    render(
      <BuildWysiwyg
        {...baseProps}
        initialSlots={[
          { id: 'slot_full', capacity: 3, sortOrder: 0, values: {} },
          { id: 'slot_empty', capacity: 2, sortOrder: 1, values: {} },
        ]}
        committedBySlot={{ slot_full: 3 }}
      />,
    );
    expect(screen.getByText('3 of 3 taken')).toBeTruthy();
    expect(screen.getByText('0 of 2 taken')).toBeTruthy();
  });
});

describe('BuildWysiwyg — group headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts a date header back and says so when the server refuses the new date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'internal', message: 'boom' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    render(
      <BuildWysiwyg
        {...baseProps}
        initialFields={[
          { id: 'f-date', ref: 'date', label: 'Date', fieldType: 'date', sortOrder: 0, config: { fieldType: 'date' } },
        ]}
        initialSettings={{ ...settings, groupByFieldRefs: ['date'] }}
        initialSlots={[{ id: 'slot_a', capacity: 2, sortOrder: 0, values: { date: '2026-11-14' } }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Group header.*Sat, Nov 14/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    expect(input.type).toBe('date');
    fireEvent.change(input, { target: { value: '2026-11-21' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toMatch(/didn.t save/);
    expect(screen.getByRole('button', { name: /Group header.*Sat, Nov 14/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Group header.*Sat, Nov 21/ })).toBeNull();
  });
});

describe('BuildWysiwyg — duplicate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("focuses the copy once, so moving it to another date's group leaves focus alone", async () => {
    const copy = {
      id: 'slot_copy',
      capacity: 2,
      sortOrder: 1,
      values: { name: 'Fruit', date: '2026-11-14' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify({ data: String(url).endsWith('/slots/bulk') ? [copy] : {} }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        ),
      ),
    );
    render(
      <BuildWysiwyg
        {...baseProps}
        initialFields={[
          {
            id: 'f-name',
            ref: 'name',
            label: 'Name',
            fieldType: 'text',
            sortOrder: 0,
            config: { fieldType: 'text', maxLength: 200 },
          },
          {
            id: 'f-date',
            ref: 'date',
            label: 'Date',
            fieldType: 'date',
            sortOrder: 1,
            config: { fieldType: 'date' },
          },
        ]}
        initialSettings={{ ...settings, groupByFieldRefs: ['date'] }}
        initialSlots={[
          {
            id: 'slot_a',
            capacity: 2,
            sortOrder: 0,
            values: { name: 'Fruit', date: '2026-11-14' },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const editor = await screen.findByTestId('slot-editor-slot_copy');
    const name = () =>
      screen
        .getByTestId('slot-editor-slot_copy')
        .querySelector<HTMLInputElement>('input[aria-label="Name value"]')!;
    await waitFor(() => expect(name()).toHaveFocus());

    // Moving the copy to another date remounts its editor in that date's group.
    const date = editor.querySelector<HTMLInputElement>('input[aria-label="Date value"]')!;
    date.focus();
    fireEvent.change(date, { target: { value: '2026-11-21' } });

    expect(screen.getByRole('button', { name: /Group header.*Sat, Nov 21/ })).toBeTruthy();
    expect(name()).not.toHaveFocus();
  });
});

describe('BuildWysiwyg — opened by Publish’s check', () => {
  const what = {
    id: 'f-what',
    ref: 'what',
    label: 'What',
    fieldType: 'text' as const,
    sortOrder: 0,
    config: { fieldType: 'text' as const, maxLength: 200 },
  };
  const where = {
    id: 'f-where',
    ref: 'where',
    label: 'Where',
    fieldType: 'text' as const,
    sortOrder: 1,
    config: { fieldType: 'text' as const, maxLength: 200 },
  };
  const slots = [
    { id: 'slot_a', capacity: 1, sortOrder: 0, values: { what: 'Setup' } },
    { id: 'slot_b', capacity: 1, sortOrder: 1, values: { what: 'Cleanup', where: 'Room TBA' } },
  ];

  // What Publish and share does when the bridge hands it the focus back.
  const handBack = vi.fn();

  /**
   * Asks the Build tab, as the header's Publish does, through the bridge, and
   * takes the focus when it's handed back, as Publish and share does.
   */
  function Header({
    onReady,
    takesFocus = true,
  }: {
    onReady: (bridge: ReturnType<typeof useBuildBridge>) => void;
    /** False once published: there's no Publish and share to take it. */
    takesFocus?: boolean;
  }) {
    const bridge = useBuildBridge();
    onReady(bridge);
    useEffect(() => (takesFocus ? bridge.onHandBack(handBack) : undefined), [bridge, takesFocus]);
    return null;
  }

  /** The signup's layout, with or without the Build tab showing. */
  function Layout({
    onReady,
    build,
    takesFocus = true,
  }: {
    onReady: (b: ReturnType<typeof useBuildBridge>) => void;
    build: boolean;
    takesFocus?: boolean;
  }) {
    return (
      <BuildBridge buildHref="/app/signups/sig_t/build">
        <Header onReady={onReady} takesFocus={takesFocus} />
        {build ? (
          <BuildWysiwyg {...baseProps} initialFields={[what, where]} initialSlots={slots} />
        ) : null}
      </BuildBridge>
    );
  }

  function renderBuild({ build = true }: { build?: boolean } = {}) {
    let bridge: ReturnType<typeof useBuildBridge> | null = null;
    const onReady = (b: ReturnType<typeof useBuildBridge>) => (bridge = b);
    const view = render(<Layout onReady={onReady} build={build} />);
    const get = () => {
      if (!bridge) throw new Error('no bridge');
      return bridge;
    };
    return {
      bridge: get,
      showBuild: (shown: boolean) => view.rerender(<Layout onReady={onReady} build={shown} />),
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    router.push.mockClear();
    handBack.mockClear();
  });

  const done = (slotId: string) =>
    fireEvent.click(
      within(screen.getByTestId(`slot-editor-${slotId}`)).getByRole('button', { name: 'Done' }),
    );

  it('opens the slot it’s about, with focus in the field asked for', () => {
    const { bridge } = renderBuild();
    let opened = false;
    act(() => {
      opened = bridge().openSlot('slot_b', 'where');
    });
    expect(opened).toBe(true);
    expect(screen.getByTestId('slot-editor-slot_b')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Where value' })).toHaveFocus();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('puts focus in the first field when none is named, also on a slot already open', () => {
    const { bridge } = renderBuild();
    act(() => bridge().openSlot('slot_a', null));
    expect(screen.getByRole('textbox', { name: 'What value' })).toHaveFocus();
    act(() => screen.getByRole('textbox', { name: 'What value' }).blur());
    act(() => bridge().openSlot('slot_a', null));
    expect(screen.getByRole('textbox', { name: 'What value' })).toHaveFocus();
  });

  it('adds a slot and opens it when there is none to open', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: 'slot_new', capacity: 1, sortOrder: 2, values: {} } }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { bridge } = renderBuild();
    await act(async () => bridge().openSlot(null, null));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/signups/sig_t/slots',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByTestId('slot-editor-slot_new')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'What value' })).toHaveFocus();
  });

  it('says it can’t open a slot it hasn’t loaded, and opens nothing', () => {
    const { bridge } = renderBuild();
    let opened = true;
    act(() => {
      opened = bridge().openSlot('slot_added_elsewhere', null);
    });
    expect(opened).toBe(false);
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
  });

  it('opens the slot a fix on another tab asked for once Build shows, and only once', () => {
    const { bridge, showBuild } = renderBuild({ build: false });
    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    // Nothing goes in the address: the Build tab takes it as it mounts.
    expect(router.push).toHaveBeenCalledWith('/app/signups/sig_t/build');
    showBuild(true);
    expect(screen.getByRole('textbox', { name: 'Where value' })).toHaveFocus();

    // Back to another tab, and Forward to Build again: nothing opens.
    showBuild(false);
    showBuild(true);
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
  });

  it('sends a pending edit when the header asks it to save', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { bridge } = renderBuild();
    act(() => bridge().openSlot('slot_a', null));
    fireEvent.change(screen.getByRole('textbox', { name: 'What value' }), {
      target: { value: 'Set up tables' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(() => bridge().flushPendingSaves());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots/slot_a',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('hands the focus back to Publish and share when Done closes the slot it opened', () => {
    const { bridge } = renderBuild();
    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    expect(handBack).not.toHaveBeenCalled();
    done('slot_b');
    expect(handBack).toHaveBeenCalledOnce();
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();

    // Once: opened again by the organizer, Done just closes it.
    fireEvent.click(screen.getByRole('button', { name: /^Edit slot — Cleanup/ }));
    done('slot_b');
    expect(handBack).toHaveBeenCalledOnce();
  });

  it('hands nothing back after a slot the organizer opened', () => {
    renderBuild();
    fireEvent.click(screen.getByRole('button', { name: 'Edit slot — Setup' }));
    done('slot_a');
    expect(handBack).not.toHaveBeenCalled();
  });

  it('hands nothing back once the organizer has opened another slot', () => {
    const { bridge } = renderBuild();
    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit slot — Setup' }));
    done('slot_a');
    expect(handBack).not.toHaveBeenCalled();
  });

  it('hands it back for a slot a fix on another tab opened, and for one it added', async () => {
    const { bridge, showBuild } = renderBuild({ build: false });
    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    showBuild(true);
    done('slot_b');
    expect(handBack).toHaveBeenCalledOnce();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { id: 'slot_new', capacity: 1, sortOrder: 2, values: {} } }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    await act(async () => bridge().openSlot(null, null));
    done('slot_new');
    expect(handBack).toHaveBeenCalledTimes(2);
  });

  it('lets Enter in a one-line box do what Done does, in the slot it opened', () => {
    const { bridge } = renderBuild();
    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    const where = screen.getByRole('textbox', { name: 'Where value' });
    // Mid-composition, Enter is the input method's; Safari ends the
    // composition first, then sends that Enter as key 229.
    fireEvent.keyDown(where, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(where, { key: 'Enter', keyCode: 229 });
    expect(screen.getByTestId('slot-editor-slot_b')).toBeInTheDocument();
    expect(handBack).not.toHaveBeenCalled();
    fireEvent.keyDown(where, { key: 'Enter' });
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
    expect(handBack).toHaveBeenCalledOnce();

    // Spots is one of its boxes too.
    act(() => {
      bridge().openSlot('slot_a', null);
    });
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Spots' }), { key: 'Enter' });
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
    expect(handBack).toHaveBeenCalledTimes(2);
  });

  it('leaves Enter as it was in a slot the organizer opened, or once they open one', () => {
    const { bridge } = renderBuild();
    fireEvent.click(screen.getByRole('button', { name: 'Edit slot — Setup' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What value' }), { key: 'Enter' });
    expect(screen.getByTestId('slot-editor-slot_a')).toBeInTheDocument();

    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit slot — Setup' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What value' }), { key: 'Enter' });
    expect(screen.getByTestId('slot-editor-slot_a')).toBeInTheDocument();
    expect(handBack).not.toHaveBeenCalled();
  });

  it('leaves the slot open on Enter once there’s no Publish and share to take the focus', () => {
    let bridge: ReturnType<typeof useBuildBridge> | null = null;
    // Published with the slot still open: the header has Share now.
    render(<Layout onReady={(b) => (bridge = b)} build takesFocus={false} />);
    act(() => {
      bridge!.openSlot('slot_b', 'where');
    });
    const where = screen.getByRole('textbox', { name: 'Where value' });
    expect(fireEvent.keyDown(where, { key: 'Enter' })).toBe(true);
    expect(screen.getByTestId('slot-editor-slot_b')).toBeInTheDocument();
    expect(where).toHaveFocus();
    // Done still closes it.
    done('slot_b');
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
    expect(handBack).not.toHaveBeenCalled();
  });

  it('hands nothing back after Duplicate opens the copy, or after Delete', async () => {
    const copy = {
      id: 'slot_copy',
      capacity: 1,
      sortOrder: 2,
      values: { what: 'Cleanup', where: 'Room TBA' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify({ data: String(url).endsWith('/slots/bulk') ? [copy] : {} }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    );
    const { bridge } = renderBuild();
    act(() => {
      bridge().openSlot('slot_b', 'where');
    });
    fireEvent.click(
      within(screen.getByTestId('slot-editor-slot_b')).getByRole('button', { name: 'Duplicate' }),
    );
    const copyEditor = await screen.findByTestId('slot-editor-slot_copy');
    // The copy is Duplicate's, not the fix's: Enter leaves it open, and Done
    // just closes it.
    fireEvent.keyDown(within(copyEditor).getByRole('textbox', { name: 'Where value' }), {
      key: 'Enter',
    });
    expect(screen.getByTestId('slot-editor-slot_copy')).toBeInTheDocument();
    done('slot_copy');
    expect(handBack).not.toHaveBeenCalled();

    act(() => {
      bridge().openSlot('slot_a', null);
    });
    fireEvent.click(
      within(screen.getByTestId('slot-editor-slot_a')).getByRole('button', { name: 'Delete' }),
    );
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
    expect(handBack).not.toHaveBeenCalled();
  });

  it('leaves Enter to a list’s new item, then lets it close the slot', async () => {
    const kind = {
      id: 'f-kind',
      ref: 'kind',
      label: 'Kind',
      fieldType: 'enum' as const,
      sortOrder: 1,
      config: { fieldType: 'enum' as const, choices: ['Cake'] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    let bridge: ReturnType<typeof useBuildBridge> | null = null;
    render(
      <BuildBridge buildHref="/app/signups/sig_t/build">
        <Header onReady={(b) => (bridge = b)} />
        <BuildWysiwyg
          {...baseProps}
          initialFields={[what, kind]}
          initialSlots={[{ id: 'slot_a', capacity: 1, sortOrder: 0, values: { what: 'TBD' } }]}
        />
      </BuildBridge>,
    );
    act(() => {
      bridge!.openSlot('slot_a', 'what');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kind value' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    const item = screen.getByRole('textbox', { name: 'New option name' });
    fireEvent.change(item, { target: { value: 'Pie' } });
    await act(async () => {
      fireEvent.keyDown(item, { key: 'Enter' });
    });
    expect(screen.getByTestId('slot-editor-slot_a')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kind value' })).toHaveTextContent('Pie');
    expect(handBack).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What value' }), { key: 'Enter' });
    expect(screen.queryByTestId(/^slot-editor-/)).toBeNull();
    expect(handBack).toHaveBeenCalledOnce();
  });
});

describe('BuildWysiwyg — a slot that still says TBD', () => {
  const what = {
    id: 'f-what',
    ref: 'what',
    label: 'What',
    fieldType: 'text' as const,
    sortOrder: 0,
    config: { fieldType: 'text' as const, maxLength: 200 },
  };
  const slots = [
    { id: 'slot_a', capacity: 1, sortOrder: 0, values: { what: 'Setup' } },
    { id: 'slot_b', capacity: 1, sortOrder: 1, values: { what: 'Cashier TBD' } },
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is marked as it reads now, and in words for whether people can see it', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const page = (status: 'draft' | 'open') => (
      <BuildWysiwyg {...baseProps} status={status} initialFields={[what]} initialSlots={slots} />
    );
    const { rerender, unmount } = render(page('draft'));
    expect(screen.getAllByText(/^Still says/)).toHaveLength(1);
    const marked = screen.getByRole('button', {
      name: 'Edit slot — Cashier TBD, still says “TBD”',
    });

    // Published: the Publish action renders the page again with its status.
    rerender(page('open'));
    expect(screen.getByText('People can see “TBD”')).toBeTruthy();
    expect(screen.queryByText(/^Still says/)).toBeNull();

    // Named, the mark goes as it's typed, before it has saved.
    fireEvent.click(marked);
    fireEvent.change(screen.getByRole('textbox', { name: 'What value' }), {
      target: { value: 'Cashier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Edit slot — Cashier' })).toBeTruthy();
    expect(screen.queryByText(/can see/)).toBeNull();
    unmount();
  });
});
