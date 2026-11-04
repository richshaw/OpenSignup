// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import type { FollowUp } from '@/lib/magic-compose/questions';
import { Drafting, VISIBLE_FIELD_CAP, VISIBLE_SLOT_CAP } from './Drafting';
import { BAND_DIVIDER, YOU_WROTE_BAND } from './YouWrote';

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

// A test that spies on window.scrollTo can't leak it into the next, even when it fails.
afterEach(() => {
  vi.restoreAllMocks();
});

/** Nothing in the band is drawn as a card: no bordered, rounded, shadowed or tinted box. */
function expectNoCard(region: HTMLElement) {
  for (const el of [region, ...region.querySelectorAll('*')]) {
    const cls = typeof el.className === 'string' ? el.className : '';
    expect(cls).not.toMatch(/(^|\s)(border|shadow-sm|rounded-lg)(\s|$)|bg-brand\/|border-brand/);
  }
}

describe('<Drafting />', () => {
  it('renders skeletons and no SAMPLE text when draft is null (pending phase)', () => {
    render(
      <Drafting prompt="anything" draft={null} onCancel={() => {}} onAnimationDone={() => {}} />,
    );
    expect(screen.queryByText(/Snack duty, U9 Eagles/)).toBeNull();
    expect(screen.queryByText(/Spring season/)).toBeNull();
    expect(screen.queryByText(/Snack \+ drinks/)).toBeNull();
    // The user's prompt is quoted back to them as the panel's first band, as on the questions
    // screen: not a card inside the panel, and not a blue box that reads as a notice.
    const quote = screen.getByRole('region', { name: 'Your description' });
    expect(quote).toHaveTextContent('You wrote“anything”');
    expect(quote).toHaveClass(...YOU_WROTE_BAND.split(' '), ...BAND_DIVIDER.split(' '));
    expectNoCard(quote);
    // A first call may get questions back, so the heading doesn't promise a draft yet.
    expect(screen.getByRole('heading', { name: 'Reading your description' })).toBeInTheDocument();
    expect(
      screen.getByText("You'll get a draft, or a few quick questions if it needs more to go on."),
    ).toBeInTheDocument();
  });

  it('drafts from the answers on the call after the questions, a blank one marked', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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
    // The same flat band as the reading screen, with the answers under the quote.
    expect(card).toHaveClass(...YOU_WROTE_BAND.split(' '), ...BAND_DIVIDER.split(' '));
    expectNoCard(card);
    expect(card).toHaveTextContent('“Bake sale”');
    expect(card).toHaveTextContent('One left blank');
    expect(card).toHaveTextContent('Staff the table2 people');
    expect(card).toHaveTextContent(
      'Not decided. The draft will use placeholder dates you can fill in later.',
    );
    // The questions were a step: reading and the details are done, the title is next.
    for (const done of screen.getAllByText('A few details')) {
      expect(done.closest('li')).not.toHaveAttribute('aria-current');
    }
    expect(screen.getByText('Drafting a title').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    // Draft my signup sat at the foot of the questions: the drafting screen starts at the top.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    scrollTo.mockRestore();
  });

  it('keeps the steps it always had for a description that drafts at once', () => {
    render(<Drafting prompt="hello" draft={null} onCancel={() => {}} onAnimationDone={() => {}} />);
    expect(screen.queryByText('A few details')).toBeNull();
    // Organizers read "fields" on the Build tab, so the drafting screen says the same.
    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getAllByText('Choosing fields for each slot').length).toBeGreaterThan(0);
    expect(screen.queryByText(/column/i)).toBeNull();
    const steps = screen.getByRole('list', { name: 'Progress' });
    expect(within(steps).getByText('Reading your description').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('starts at the title after the questions, rather than spending reading’s time first', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.useFakeTimers();
    // How long the steps take to finish, from a draft arriving.
    const finishes = (followUp?: FollowUp) => {
      const done = vi.fn();
      const { unmount } = render(
        <Drafting
          prompt="Bake sale"
          followUp={followUp}
          draft={makeDraft(2, 3)}
          onCancel={() => {}}
          onAnimationDone={done}
        />,
      );
      let ms = 0;
      while (!done.mock.calls.length && ms < 20_000) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
        ms += 100;
      }
      unmount();
      return ms;
    };
    try {
      const atOnce = finishes();
      const afterQuestions = finishes({ what: { picked: ['Staff the table'], added: [] } });
      expect(atOnce - afterQuestions).toBe(700);
    } finally {
      vi.useRealTimers();
    }
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

  it('caps visible fields and slots and shows overflow indicators for a large draft', () => {
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
