import { describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import { ok } from '@/lib/result';
import { TOOLS } from '../tools';
import type { AssistantMessage, SendChat, ToolChatMessage } from './assistant';
import { scoreFollowup } from './followup-checks';
import { runFollowupCase } from './followups';

const db = getDb();

const DRAFT = {
  title: 'Book fair volunteers',
  description: '',
  fields: [{ ref: 'start', label: 'Start', fieldType: 'time' }],
  slots: [
    { values: { start: '10:00' }, capacity: 3 },
    { values: { start: '12:00' }, capacity: 3 },
  ],
};

const call = (id: string, name: string, args: unknown): AssistantMessage => ({
  role: 'assistant',
  content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

function lastToolResult(messages: ToolChatMessage[]): Record<string, unknown> {
  const m = [...messages].reverse().find((x) => x.role === 'tool');
  return m && m.role === 'tool' ? (JSON.parse(m.content) as Record<string, unknown>) : {};
}

/**
 * Plays an assistant that creates the signup, then on the follow-up reads it
 * and puts a setup slot first, using the ids the real tools handed back.
 */
const send: SendChat = async (messages) => {
  const users = messages.filter((m) => m.role === 'user').length;
  const last = messages.at(-1)!;
  if (users === 1) {
    if (last.role === 'user') return ok(call('c1', 'create_signup', DRAFT));
    const created = lastToolResult(messages) as { links: { edit: string } };
    return ok({ role: 'assistant', content: `Made it: ${created.links.edit}` });
  }
  if (last.role === 'user') return ok(call('c2', 'list_signups', {}));
  const result = lastToolResult(messages);
  if ('signups' in result) {
    const [s] = result.signups as { id: string }[];
    return ok(call('c3', 'get_signup', { signupId: s!.id }));
  }
  if ('links' in result) {
    const found = result as { signup: { id: string }; slots: { id: string }[] };
    return ok(
      call('c4', 'add_slots', {
        signupId: found.signup.id,
        rows: [{ values: { start: '09:00' }, capacity: 2 }],
        beforeSlotId: found.slots[0]!.id,
      }),
    );
  }
  return ok({ role: 'assistant', content: 'Added setup at 9:00, first in the list.' });
};

describe('runFollowupCase on Postgres', () => {
  it('answers each tool call from the real tools and reports the slots before and after the follow-ups', async () => {
    const before = await db.select({ id: organizers.id }).from(organizers);
    const run = await runFollowupCase(
      db,
      { prompt: 'Make a book fair signup', followUps: ['Add an earlier slot for setup'] },
      { send, tools: TOOLS, instructions: 'server instructions', now: new Date('2026-10-23T12:00:00Z') },
    );
    expect(run.ok, JSON.stringify(run)).toBe(true);
    if (!run.ok) return;

    expect(run.turns.map((t) => t.outcome.toolCalls.map((c) => c.name))).toEqual([
      ['create_signup'],
      ['list_signups', 'get_signup', 'add_slots'],
    ]);
    expect(run.state.before.map((s) => s.values)).toEqual([{ start: '10:00' }, { start: '12:00' }]);
    expect(run.state.after.map((s) => s.values)).toEqual([{ start: '09:00' }, { start: '10:00' }, { start: '12:00' }]);
    expect(run.state.editLink).toMatch(/\/app\/signups\/sig_\w+\/build$/);
    expect(run.state.followUpToolCalls).toEqual(['list_signups', 'get_signup', 'add_slots']);
    expect(run.state.reply).toBe('Added setup at 9:00, first in the list.');

    const checks = scoreFollowup(
      { 'followups.tools_must_include': ['add_slots'], 'slots.added_count': 1, 'slots.first_is_new': true },
      run.state,
    );
    expect(checks.every((c) => c.outcome === 'pass'), JSON.stringify(checks)).toBe(true);

    // The case's organizer, workspace and signup are gone again.
    const after = await db.select({ id: organizers.id }).from(organizers);
    expect(after.length).toBe(before.length);
  });

  it('fails the case when the first message made no signup', async () => {
    const replyOnly: SendChat = async () => ok({ role: 'assistant', content: 'Which date is the fair?' });
    const run = await runFollowupCase(
      db,
      { prompt: 'Make a book fair signup', followUps: ['Add setup'] },
      { send: replyOnly, tools: TOOLS, instructions: '', now: new Date() },
    );
    expect(run).toMatchObject({ ok: false, code: 'no_signup' });
    expect(run.turns).toHaveLength(1);
  });
});
