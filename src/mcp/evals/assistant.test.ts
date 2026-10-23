import { describe, expect, it } from 'vitest';
import { err, ok } from '@/lib/result';
import { TOOLS } from '../tools';
import {
  buildAssistantMessages,
  openConversation,
  runAssistant,
  toChatTools,
  type AssistantMessage,
  type SendChat,
  type ToolChatMessage,
} from './assistant';

const DRAFT = {
  title: 'Snack rota',
  description: '',
  fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
  slots: [{ values: { date: '2026-11-07' }, capacity: 1 }],
};

function call(id: string, name: string, args: unknown): NonNullable<AssistantMessage['tool_calls']>[number] {
  return { id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } };
}

/** Replays the given assistant turns in order and records every request it was sent. */
function scripted(turns: AssistantMessage[]): { send: SendChat; sent: ToolChatMessage[][] } {
  const sent: ToolChatMessage[][] = [];
  const send: SendChat = async (messages) => {
    sent.push(structuredClone(messages));
    const next = turns.shift();
    return next ? ok(next) : err({ code: 'upstream', message: 'script ran out' });
  };
  return { send, sent };
}

const base = { tools: TOOLS, instructions: 'server instructions', now: new Date('2026-10-18T12:00:00Z') };

describe('toChatTools', () => {
  it('offers every MCP tool as a function with its description and JSON Schema', () => {
    const chat = toChatTools(TOOLS);
    expect(chat.map((t) => t.function.name)).toEqual(TOOLS.map((t) => t.name));
    const create = chat.find((t) => t.function.name === 'create_signup')!;
    expect(create.type).toBe('function');
    expect(create.function.description).toBe(TOOLS.find((t) => t.name === 'create_signup')!.description);
    expect(create.function.parameters).toMatchObject({ type: 'object' });
    expect(create.function.parameters).not.toHaveProperty('$schema');
  });
});

describe('buildAssistantMessages', () => {
  it('puts the date and the server instructions in the system message, and the prompt in the user message', () => {
    const [system, user] = buildAssistantMessages('Six games need snacks', 'server instructions', base.now);
    expect(system).toEqual({ role: 'system', content: expect.stringContaining('2026-10-18') });
    expect(system!.content).toContain('server instructions');
    expect(user).toEqual({ role: 'user', content: 'Six games need snacks' });
  });
});

describe('runAssistant', () => {
  it('returns the create_signup arguments from the first call', async () => {
    const { send } = scripted([{ role: 'assistant', content: null, tool_calls: [call('c1', 'create_signup', DRAFT)] }]);
    const out = await runAssistant('prompt', { ...base, send });
    expect(out).toEqual({ kind: 'created', args: DRAFT, toolCalls: ['create_signup'], rejectedCreates: 0 });
  });

  it('answers read tools with an empty account and carries on to the create', async () => {
    const { send, sent } = scripted([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'list_workspaces', {}), call('c2', 'list_signups', {})] },
      { role: 'assistant', content: null, tool_calls: [call('c3', 'create_signup', DRAFT)] },
    ]);
    const out = await runAssistant('prompt', { ...base, send });
    expect(out).toMatchObject({ kind: 'created', toolCalls: ['list_workspaces', 'list_signups', 'create_signup'] });
    const second = sent[1]!;
    const results = second.filter((m) => m.role === 'tool');
    expect(results.map((m) => m.tool_call_id)).toEqual(['c1', 'c2']);
    expect(JSON.parse(results[0]!.content)).toMatchObject({ workspaces: [{ isDefault: true, role: 'owner' }] });
    expect(JSON.parse(results[1]!.content)).toEqual({ signups: [] });
  });

  it('sends invalid create_signup arguments back as the invalid_input error the server gives, and scores the retry', async () => {
    const { send, sent } = scripted([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'create_signup', { title: 'x' })] },
      { role: 'assistant', content: null, tool_calls: [call('c2', 'create_signup', DRAFT)] },
    ]);
    const out = await runAssistant('prompt', { ...base, send });
    expect(out).toMatchObject({ kind: 'created', args: DRAFT, rejectedCreates: 1 });
    const result = sent[1]!.find((m) => m.role === 'tool')!;
    expect(JSON.parse(result.content)).toMatchObject({ error: { code: 'invalid_input' } });
  });

  it('treats arguments that are not JSON as an invalid create', async () => {
    const { send } = scripted([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'create_signup', '{not json')] },
      { role: 'assistant', content: 'Sorry, something went wrong.' },
    ]);
    const out = await runAssistant('prompt', { ...base, send });
    expect(out).toEqual({
      kind: 'replied',
      text: 'Sorry, something went wrong.',
      toolCalls: ['create_signup'],
      rejectedCreates: 1,
    });
  });

  it('returns the reply when the assistant answers without creating', async () => {
    const { send } = scripted([{ role: 'assistant', content: 'Which dates are the games?' }]);
    const out = await runAssistant('prompt', { ...base, send });
    expect(out).toEqual({ kind: 'replied', text: 'Which dates are the games?', toolCalls: [], rejectedCreates: 0 });
  });

  it('reports a failed request', async () => {
    const send: SendChat = async () => err({ code: 'timeout', message: 'too slow' });
    const out = await runAssistant('prompt', { ...base, send });
    expect(out).toEqual({ kind: 'failed', code: 'timeout', message: 'too slow', toolCalls: [], rejectedCreates: 0 });
  });

  it('gives up after maxRounds of tool calls without a create', async () => {
    const loop: AssistantMessage = { role: 'assistant', content: null, tool_calls: [call('c', 'list_signups', {})] };
    const { send, sent } = scripted([loop, loop, loop]);
    const out = await runAssistant('prompt', { ...base, send, maxRounds: 2 });
    expect(out).toMatchObject({ kind: 'failed', code: 'too_many_rounds' });
    expect(sent).toHaveLength(2);
  });
});

describe('openConversation', () => {
  it('answers every tool call through callTool and returns the reply', async () => {
    const { send, sent } = scripted([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'list_signups', {})] },
      { role: 'assistant', content: 'You have no signups yet.' },
    ]);
    const calls: [string, unknown][] = [];
    const convo = openConversation({
      ...base,
      send,
      callTool: async (name, args) => {
        calls.push([name, args]);
        return '{"signups":[]}';
      },
    });
    const out = await convo.say('What have I got?');
    expect(out).toEqual({
      kind: 'replied',
      text: 'You have no signups yet.',
      toolCalls: [{ name: 'list_signups', args: {} }],
    });
    expect(calls).toEqual([['list_signups', {}]]);
    expect(sent[1]!.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"signups":[]}' });
  });

  it('keeps the history across turns, with the next message after the last reply', async () => {
    const { send, sent } = scripted([
      { role: 'assistant', content: 'Made it.' },
      { role: 'assistant', content: 'Added it.' },
    ]);
    const convo = openConversation({ ...base, send, callTool: async () => '{}' });
    await convo.say('Make a signup');
    const out = await convo.say('Add a slot');
    expect(out).toMatchObject({ kind: 'replied', text: 'Added it.', toolCalls: [] });
    expect(sent[1]!.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(sent[1]!.at(-1)).toEqual({ role: 'user', content: 'Add a slot' });
  });

  it('does not call the tool when its arguments are not JSON', async () => {
    const { send, sent } = scripted([
      { role: 'assistant', content: null, tool_calls: [call('c1', 'add_slots', '{not json')] },
      { role: 'assistant', content: 'Sorry.' },
    ]);
    let called = false;
    const convo = openConversation({
      ...base,
      send,
      callTool: async () => {
        called = true;
        return '{}';
      },
    });
    const out = await convo.say('Add a slot');
    expect(called).toBe(false);
    expect(out.toolCalls).toEqual([{ name: 'add_slots', args: '{not json' }]);
    const result = sent[1]!.find((m) => m.role === 'tool')!;
    expect(JSON.parse(result.content)).toMatchObject({ error: { code: 'invalid_input' } });
  });

  it('reports a failed request and gives up after maxRounds', async () => {
    const failing = openConversation({
      ...base,
      send: async () => err({ code: 'timeout', message: 'too slow' }),
      callTool: async () => '{}',
    });
    expect(await failing.say('hi')).toEqual({ kind: 'failed', code: 'timeout', message: 'too slow', toolCalls: [] });

    const loop: AssistantMessage = { role: 'assistant', content: null, tool_calls: [call('c', 'list_signups', {})] };
    const { send } = scripted([loop, loop, loop]);
    const looping = openConversation({ ...base, send, callTool: async () => '{}', maxRounds: 2 });
    expect(await looping.say('hi')).toMatchObject({ kind: 'failed', code: 'too_many_rounds' });
  });
});
