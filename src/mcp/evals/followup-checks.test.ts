import { describe, expect, it } from 'vitest';
import { markdownTableRows, runFollowupCheck, scoreFollowup, type FollowupState } from './followup-checks';

const slot = (id: string, what: string, capacity: number | null = 1) => ({ id, values: { what }, capacity });

function state(overrides: Partial<FollowupState> = {}): FollowupState {
  return {
    before: [slot('s1', 'Mains'), slot('s2', 'Sides')],
    after: [slot('s1', 'Mains'), slot('s2', 'Sides')],
    editLink: 'http://localhost:3000/app/signups/sig_1/build',
    followUpToolCalls: [],
    reply: '',
    ...overrides,
  };
}

const outcome = (key: string, expected: unknown, s: FollowupState) => runFollowupCheck(key, expected, s).outcome;

describe('runFollowupCheck', () => {
  it('checks which tools the follow-ups called', () => {
    const s = state({ followUpToolCalls: ['get_signup', 'add_slots'] });
    expect(outcome('followups.tools_must_include', ['add_slots'], s)).toBe('pass');
    expect(outcome('followups.tools_must_include', ['update_slot'], s)).toBe('fail');
    expect(outcome('followups.tools_must_not_include', ['add_slots'], s)).toBe('fail');
    expect(outcome('followups.tools_must_not_include', ['delete_slot'], s)).toBe('pass');
  });

  it('counts slots added and removed by id', () => {
    const s = state({ after: [slot('s3', 'Setup'), slot('s1', 'Mains')] });
    expect(outcome('slots.added_count', 1, s)).toBe('pass');
    expect(outcome('slots.added_count', 0, s)).toBe('fail');
    expect(outcome('slots.removed_count', 1, s)).toBe('pass');
  });

  it('passes first_is_new only when the first slot was not there after the first message', () => {
    expect(outcome('slots.first_is_new', true, state({ after: [slot('s3', 'Setup'), slot('s1', 'Mains')] }))).toBe('pass');
    expect(outcome('slots.first_is_new', true, state({ after: [slot('s1', 'Mains'), slot('s3', 'Setup')] }))).toBe('fail');
    expect(outcome('slots.first_is_new', true, state({ after: [] }))).toBe('fail');
  });

  it('matches the first slot values case-insensitively', () => {
    const s = state({ after: [slot('s3', 'Book fair SETUP')] });
    expect(outcome('slots.first_values_must_mention_any', ['setup'], s)).toBe('pass');
    expect(outcome('slots.first_values_must_mention_any', ['09:00'], s)).toBe('fail');
  });

  it('finds slots with the same values whatever their key order', () => {
    const a = { id: 'a', values: { date: '2027-06-06', what: 'Mains' }, capacity: 1 };
    const b = { id: 'b', values: { what: 'Mains', date: '2027-06-06' }, capacity: 1 };
    expect(outcome('slots.no_duplicates', true, state({ after: [a, b] }))).toBe('fail');
    expect(outcome('slots.no_duplicates', true, state())).toBe('pass');
  });

  it('checks capacities changed and their sum', () => {
    const s = state({ after: [slot('s1', 'Mains', 5), slot('s2', 'Sides', 5)] });
    expect(outcome('slots.capacities_changed', true, s)).toBe('pass');
    expect(outcome('slots.capacities_changed', true, state())).toBe('fail');
    expect(outcome('slots.capacity_sum_range', [10, 30], s)).toBe('pass');
    expect(outcome('slots.capacity_sum_range', [11, 30], s)).toBe('fail');
    expect(outcome('slots.capacity_sum_range', [0, 30], state({ after: [slot('s1', 'Mains', null)] }))).toBe('fail');
  });

  it('wants a table row per slot and the edit link in the reply', () => {
    const table = '| What | Spots |\n|---|---|\n| Mains | 1 |\n| Sides | 1 |';
    const s = state({ reply: `${table}\n\nEdit it here: http://localhost:3000/app/signups/sig_1/build` });
    expect(outcome('reply.table_row_per_slot', true, s)).toBe('pass');
    expect(outcome('reply.must_include_edit_link', true, s)).toBe('pass');
    const short = state({ reply: '| What |\n| --- |\n| Mains |' });
    expect(outcome('reply.table_row_per_slot', true, short)).toBe('fail');
    expect(outcome('reply.must_include_edit_link', true, short)).toBe('fail');
  });

  it('skips prose and unknown keys', () => {
    expect(outcome('rationale', 'why', state())).toBe('skip');
    expect(outcome('slots.whatever', true, state())).toBe('skip');
  });
});

describe('markdownTableRows', () => {
  it('counts body rows, not headers or separators', () => {
    expect(markdownTableRows('| a | b |\n| :--- | ---: |\n| 1 | 2 |\n| 3 | 4 |')).toBe(2);
    expect(markdownTableRows('no table here\n- a list')).toBe(0);
  });
});

describe('scoreFollowup', () => {
  it('runs every expectation', () => {
    const checks = scoreFollowup({ 'slots.added_count': 0, rationale: 'x' }, state());
    expect(checks.map((c) => [c.key, c.outcome])).toEqual([
      ['slots.added_count', 'pass'],
      ['rationale', 'skip'],
    ]);
  });
});
