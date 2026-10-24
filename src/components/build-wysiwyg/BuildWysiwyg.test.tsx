// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BuildWysiwyg } from './BuildWysiwyg';
import type { SignupSettings } from '@/schemas/signups';

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
