// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import { Drafting, VISIBLE_FIELD_CAP, VISIBLE_SLOT_CAP } from './Drafting';

function makeDraft(fieldCount: number, slotCount: number): DraftPreview {
  const fields = Array.from({ length: fieldCount }).map((_, i) => ({
    ref: `f${i}`,
    label: `Field ${i + 1}`,
    fieldType: 'text' as const,
  }));
  const slots = Array.from({ length: slotCount }).map((_, i) => ({
    values: Object.fromEntries(fields.map((f) => [f.ref, `v${i}-${f.ref}`])),
    capacity: 1 as number | null,
  }));
  return { title: 'Test Draft Title', description: 'Test description.', fields, slots };
}

describe('<Drafting />', () => {
  it('renders skeletons and no SAMPLE text when draft is null (pending phase)', () => {
    render(
      <Drafting prompt="anything" draft={null} onCancel={() => {}} onAnimationDone={() => {}} />,
    );
    expect(screen.queryByText(/Snack duty, U9 Eagles/)).toBeNull();
    expect(screen.queryByText(/Spring season/)).toBeNull();
    expect(screen.queryByText(/Snack \+ drinks/)).toBeNull();
    // The user's prompt is quoted back to them.
    expect(screen.getByText('“anything”')).toBeInTheDocument();
    // A first call may get questions back, so the heading doesn't promise a draft yet.
    expect(screen.getByRole('heading', { name: 'Reading your description' })).toBeInTheDocument();
    expect(
      screen.getByText("You'll get a draft, or a few quick questions if it needs more to go on."),
    ).toBeInTheDocument();
  });

  it('drafts from the answers on the call after the questions, a blank one marked', async () => {
    render(
      <Drafting
        prompt="Bake sale"
        followUp={{
          what: { picked: ['Staff the table'], added: [] },
          when: { kind: 'not_decided' },
          howMany: [2],
        }}
        draft={null}
        onCancel={() => {}}
        onAnimationDone={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Drafting your signup' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Drafting from' });
    expect(card).toHaveTextContent('“Bake sale”');
    expect(card).toHaveTextContent('One left blank');
    expect(card).toHaveTextContent('Staff the table2 people');
    expect(card).toHaveTextContent(
      'Not decided. The draft will use placeholder dates you can fill in later.',
    );
  });

  it('renders real title, labels, and slot rows for a small draft', () => {
    vi.useFakeTimers();
    try {
      const draft = makeDraft(2, 3);
      render(
        <Drafting prompt="hello" draft={draft} onCancel={() => {}} onAnimationDone={() => {}} />,
      );
      // Advance past all step durations + typewriter (1200ms max + safety).
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.getByText('Test Draft Title')).toBeInTheDocument();
      expect(screen.getByText('Field 1')).toBeInTheDocument();
      expect(screen.getByText('Field 2')).toBeInTheDocument();
      expect(screen.getByText('v0-f0')).toBeInTheDocument();
      expect(screen.getByText('v2-f1')).toBeInTheDocument();
      expect(screen.queryByText(/\+\d+ more/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps visible columns and slots and shows overflow indicators for a large draft', () => {
    vi.useFakeTimers();
    try {
      const draft = makeDraft(12, 50);
      render(
        <Drafting prompt="big one" draft={draft} onCancel={() => {}} onAnimationDone={() => {}} />,
      );
      act(() => {
        vi.advanceTimersByTime(15_000);
      });

      // First VISIBLE_FIELD_CAP labels render; later ones do NOT.
      for (let i = 0; i < VISIBLE_FIELD_CAP; i += 1) {
        expect(screen.getByText(`Field ${i + 1}`)).toBeInTheDocument();
      }
      expect(screen.queryByText(`Field ${VISIBLE_FIELD_CAP + 1}`)).toBeNull();

      // Overflow indicators present.
      const overflowFields = 12 - VISIBLE_FIELD_CAP;
      const overflowSlots = 50 - VISIBLE_SLOT_CAP;
      expect(screen.getByText(`+${overflowFields} more`)).toBeInTheDocument();
      expect(screen.getByText(`+${overflowSlots} more`)).toBeInTheDocument();

      // Meta line shows real totals.
      expect(screen.getByText(`${VISIBLE_FIELD_CAP} of 12`)).toBeInTheDocument();
      expect(screen.getByText(`${VISIBLE_SLOT_CAP} of 50`)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
