// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WHAT_ITEMS_MAX } from '@/lib/magic-compose/limits';
import type { MagicComposeQuestions } from '@/lib/magic-compose/questions';
import { MagicComposeRoot } from './MagicComposeRoot';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ASKED: MagicComposeQuestions = {
  topics: ['what', 'when', 'how_many'],
  whatOptions: ['Bake something to sell', 'Staff the table', 'Set up or clean up'],
};

type Reply = { status: number; body: unknown } | 'hang';

/** Answers each call with the next reply; 'hang' waits until the call is aborted. */
function stubReplies(...replies: Reply[]) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const reply = replies.shift() ?? 'hang';
    if (reply === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return (call: number) => JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as unknown;
}

const asks = (questions: MagicComposeQuestions = ASKED): Reply => ({
  status: 200,
  body: { data: { questions } },
});

async function openQuestions(prompt = 'Bake sale') {
  render(<MagicComposeRoot />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: prompt } });
  fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
  return screen.findByRole('heading', { name: 'A few details first' });
}

/** Picks two options, adds two of their own (Enter, then Add), counts, and a day. */
function answerEverything() {
  fireEvent.click(screen.getByRole('button', { name: 'Bake something to sell' }));
  fireEvent.click(screen.getByRole('button', { name: 'Staff the table' }));
  const add = screen.getByRole('textbox', { name: 'Add your own, then press Enter' });
  fireEvent.change(add, { target: { value: 'Bring drinks' } });
  fireEvent.keyDown(add, { key: 'Enter' });
  fireEvent.change(add, { target: { value: 'Clean up after' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(screen.getByRole('button', { name: 'More people for Staff the table' }));
  fireEvent.click(screen.getByRole('button', { name: 'More people for Staff the table' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'People for Bring drinks' }), {
    target: { value: '1' },
  });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-14' } });
  fireEvent.change(screen.getByLabelText('Start time (optional)'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: '13:00' } });
}

const ANSWERED = {
  what: {
    picked: ['Bake something to sell', 'Staff the table'],
    added: ['Bring drinks', 'Clean up after'],
  },
  when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '13:00' },
  howMany: [null, 2, 1, null],
};

function expectEveryAnswerKept() {
  expect(screen.getByRole('button', { name: 'Bake something to sell' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Set up or clean up' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Remove Bring drinks' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove Clean up after' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'People for Staff the table' })).toHaveValue(2);
  expect(screen.getByRole('spinbutton', { name: 'People for Bring drinks' })).toHaveValue(1);
  expect(screen.getByRole('spinbutton', { name: 'People for Clean up after' })).toHaveValue(null);
  expect(screen.getByLabelText('Date')).toHaveValue('2026-11-14');
  expect(screen.getByLabelText('Start time (optional)')).toHaveValue('09:00');
  expect(screen.getByLabelText('End time (optional)')).toHaveValue('13:00');
}

describe('<MagicComposeRoot /> questions', () => {
  it("doesn't promise a draft while the first reply is on its way", async () => {
    stubReplies('hang');
    render(<MagicComposeRoot />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bake sale' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(
      await screen.findByRole('heading', { name: 'Reading your description' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You'll get a draft, or a few quick questions if it needs more to go on."),
    ).toBeInTheDocument();
    expect(screen.getByText('“Bake sale”')).toBeInTheDocument();
  });

  it('shows the questions, focused on their heading, when the first call asks', async () => {
    stubReplies(asks());
    const heading = await openQuestions();
    expect(heading).toHaveFocus();
    expect(screen.getByText('“Bake sale”')).toBeInTheDocument();
    const what = screen.getByRole('group', { name: 'What do people sign up for?' });
    for (const option of ASKED.whatOptions) {
      expect(within(what).getByRole('button', { name: option })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    expect(screen.getByRole('radiogroup', { name: 'When is it?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'One day' })).toBeChecked();
    expect(screen.getByText('Pick or add something above first.')).toBeInTheDocument();
  });

  it('shows only the questions that were asked', async () => {
    stubReplies(asks({ topics: ['what'], whatOptions: ['Bring a dish', 'Bring drinks'] }));
    await openQuestions('Team party on Saturday, June 6');
    expect(screen.getByText('What do people sign up for?')).toBeInTheDocument();
    expect(screen.queryByText('When is it?')).toBeNull();
    expect(screen.queryByText('How many people do you need?')).toBeNull();
  });

  it('picks options, adds your own, and gives each item a count row', async () => {
    stubReplies(asks());
    await openQuestions();
    answerEverything();
    const rows = screen.getAllByRole('spinbutton');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'People for Bake something to sell',
      'People for Staff the table',
      'People for Bring drinks',
      'People for Clean up after',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Staff the table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clean up after' }));
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Remove Clean up after' })).toBeNull();
  });

  it('sends the description and the exact answers, and shows them while drafting', async () => {
    const sent = stubReplies(asks(), 'hang');
    await openQuestions();
    answerEverything();
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(
      await screen.findByRole('heading', { name: 'Drafting your signup' }),
    ).toBeInTheDocument();
    expect(sent(0)).toEqual({ prompt: 'Bake sale' });
    expect(sent(1)).toEqual({ prompt: 'Bake sale', followUp: ANSWERED });
    const card = await screen.findByRole('region', { name: 'Drafting from' });
    expect(within(card).getByText('All answered')).toBeInTheDocument();
    expect(within(card).getByText('2 people')).toBeInTheDocument();
    expect(within(card).getByText('1 person')).toBeInTheDocument();
    expect(within(card).getAllByText('No limit')).toHaveLength(2);
    expect(within(card).getByText(/November 14 · 9am to 1pm/)).toBeInTheDocument();
  });

  it('comes back to the questions with every answer when drafting is cancelled', async () => {
    stubReplies(asks(), 'hang');
    await openQuestions();
    answerEverything();
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'A few details first' })).toHaveFocus();
    expectEveryAnswerKept();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error on the questions, with every answer kept', async () => {
    const message =
      "Couldn't draft from these answers. Add a little more, or draft with placeholders.";
    stubReplies(asks(), {
      status: 400,
      body: { error: { code: 'invalid_input', message, details: { reason: 'asked_again' } } },
    });
    await openQuestions();
    answerEverything();
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('heading', { name: 'A few details first' })).toBeInTheDocument();
    expectEveryAnswerKept();
  });

  it('shows the hourly limit on the questions too', async () => {
    stubReplies(asks(), {
      status: 429,
      body: {
        error: {
          code: 'rate_limited',
          message: 'too many requests',
          details: { retryAfterSeconds: 700, bucket: 'magic.compose' },
        },
      },
    });
    await openQuestions();
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You've used this hour's AI drafts. Try again in 12 minutes, or fill it in by hand.",
    );
  });

  it('sends no answers for Draft with placeholders', async () => {
    const sent = stubReplies(asks(), 'hang');
    await openQuestions();
    answerEverything();
    fireEvent.click(screen.getByRole('button', { name: 'Draft with placeholders' }));
    const card = await screen.findByRole('region', { name: 'Drafting from' });
    expect(sent(1)).toEqual({
      prompt: 'Bake sale',
      followUp: {
        what: { picked: [], added: [] },
        when: { kind: 'not_decided' },
        placeholders: true,
      },
    });
    expect(within(card).getByText('Two left blank')).toBeInTheDocument();
    expect(
      within(card).getByText(
        'Not decided. The draft will use placeholder dates you can fill in later.',
      ),
    ).toBeInTheDocument();
  });

  it('adds words left in "Add your own" rather than dropping them', async () => {
    const sent = stubReplies(asks({ topics: ['what'], whatOptions: ASKED.whatOptions }), 'hang');
    await openQuestions();
    fireEvent.change(screen.getByRole('textbox', { name: 'Add your own, then press Enter' }), {
      target: { value: 'Bring drinks ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    await screen.findByRole('region', { name: 'Drafting from' });
    expect(sent(1)).toEqual({
      prompt: 'Bake sale',
      followUp: { what: { picked: [], added: ['Bring drinks'] } },
    });
  });

  it("doesn't send an end time before the start time", async () => {
    const sent = stubReplies(asks());
    await openQuestions();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-14' } });
    fireEvent.change(screen.getByLabelText('Start time (optional)'), {
      target: { value: '13:00' },
    });
    fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The end time must be after the start time.',
    );
    expect(() => sent(1)).toThrow();
  });

  it("doesn't send a date with a short year, and stops it on the page", async () => {
    const sent = stubReplies(asks());
    await openQuestions();
    const date = screen.getByLabelText('Date');
    expect(date).toHaveAttribute('min', '1900-01-01');
    fireEvent.change(date, { target: { value: '0202-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Check the date's year.");
    expect(() => sent(1)).toThrow();
  });

  it('takes the error away once an answer changes, not before', async () => {
    stubReplies(asks());
    await openQuestions();
    fireEvent.click(screen.getByRole('button', { name: 'Staff the table' }));
    fireEvent.click(screen.getByRole('button', { name: 'More people for Staff the table' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-14' } });
    fireEvent.change(screen.getByLabelText('Start time (optional)'), {
      target: { value: '13:00' },
    });
    fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The end time must be after the start time.',
    );

    // − at 1, and a count box left as it was, change nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Fewer people for Staff the table' }));
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'People for Staff the table' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: '14:00' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("takes a failed call's error away once an answer changes", async () => {
    stubReplies(asks(), {
      status: 500,
      body: { error: { code: 'internal', message: 'Something went wrong while drafting.' } },
    });
    await openQuestions();
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Staff the table' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("says only to try again when drafting from answers runs too long, as there's no prompt to change", async () => {
    stubReplies(asks(), 'hang');
    await openQuestions();
    fireEvent.click(screen.getByRole('button', { name: 'Staff the table' }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    expect(screen.getByRole('heading', { name: 'Drafting your signup' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(210_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /^AI drafting is taking longer than expected\. Try again\.$/,
    );
    expect(screen.getByRole('heading', { name: 'A few details first' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Staff the table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('goes Back to compose with the answers added to the description, then starts fresh', async () => {
    const sent = stubReplies(asks(), asks());
    await openQuestions('Bake sale for the PTA');
    answerEverything();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'What are you organizing?' })).toBeInTheDocument();
    const description = screen.getByRole('textbox');
    expect((description as HTMLTextAreaElement).value).toMatch(
      new RegExp(
        [
          '^Bake sale for the PTA',
          'What: Bake something to sell \\(no limit\\), Staff the table \\(2\\), Bring drinks \\(1\\), Clean up after \\(no limit\\)',
          'When: Saturday, November 14(, 2026)?, 9am to 1pm$',
        ].join('\n'),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    await screen.findByRole('heading', { name: 'A few details first' });
    expect(sent(1)).toEqual({ prompt: (description as HTMLTextAreaElement).value });
    expect(screen.getByRole('button', { name: 'Bake something to sell' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('<MagicComposeRoot /> questions focus', () => {
  const addBox = () => screen.getByRole('textbox', { name: 'Add your own, then press Enter' });

  /** Adds each item from "Add your own" with Enter, as a keyboard user would. */
  function addWithEnter(...items: string[]) {
    for (const item of items) {
      addBox().focus();
      fireEvent.change(addBox(), { target: { value: item } });
      fireEvent.keyDown(addBox(), { key: 'Enter' });
    }
  }

  it('stays in "Add your own" after Add, which goes away, and after Enter', async () => {
    stubReplies(asks());
    await openQuestions();
    fireEvent.change(addBox(), { target: { value: 'Bring drinks' } });
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();
    fireEvent.click(add);
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(addBox()).toHaveFocus();

    addWithEnter('Clean up after');
    expect(screen.getByRole('button', { name: 'Remove Clean up after' })).toBeInTheDocument();
    expect(addBox()).toHaveFocus();
  });

  it("moves from a removed chip's × to the next chip's ×, or to the box after the last", async () => {
    stubReplies(asks());
    await openQuestions();
    addWithEnter('Bring drinks', 'Clean up after', 'Sell tickets');

    const first = screen.getByRole('button', { name: 'Remove Bring drinks' });
    first.focus();
    fireEvent.click(first);
    expect(screen.getByRole('button', { name: 'Remove Clean up after' })).toHaveFocus();

    const last = screen.getByRole('button', { name: 'Remove Sell tickets' });
    last.focus();
    fireEvent.click(last);
    expect(addBox()).toHaveFocus();
  });

  it(`moves to the line about the limit when item ${WHAT_ITEMS_MAX} takes the box away`, async () => {
    stubReplies(asks({ topics: ['what'], whatOptions: ASKED.whatOptions }));
    await openQuestions();
    addWithEnter(...Array.from({ length: WHAT_ITEMS_MAX }, (_, i) => `Item ${i + 1}`));
    expect(screen.queryByRole('textbox', { name: 'Add your own, then press Enter' })).toBeNull();
    expect(
      screen.getByText(`${WHAT_ITEMS_MAX} is the most. Remove one to add another.`),
    ).toHaveFocus();

    // Removing one brings the box back, and focus goes to it.
    const remove = screen.getByRole('button', { name: `Remove Item ${WHAT_ITEMS_MAX}` });
    remove.focus();
    fireEvent.click(remove);
    expect(addBox()).toHaveFocus();
  });
});
