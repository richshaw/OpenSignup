import { errorEnvelope } from '@/lib/api-response';
import { fromZodError } from '@/lib/errors';
import type { Result } from '@/lib/result';
import { toJsonSchema, type ToolDefinition } from '../registry';

/**
 * The model side of the MCP evals (`pnpm eval:mcp`): organizer messages,
 * answered by a tool-calling model that sees the server instructions and the
 * tools exactly as `tools/list` describes them.
 *
 * `runAssistant` handles a single message. What the model passes to
 * `create_signup` is what gets scored, and nothing touches the database: the
 * read tools answer as an empty account, and only `create_signup`'s own input
 * schema decides whether a create would have gone through.
 *
 * `openConversation` handles follow-up turns. Every tool call goes to
 * `callTool`, which the runner wires to the real tools (`./followups.ts`), so
 * the model gets real ids and links to act on.
 *
 * Chat Completions shapes, since the evals reuse the Magic Compose
 * `LLM_*` settings and any OpenAI-compatible endpoint takes them.
 */

interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChatToolCall[];
}

export type ToolChatMessage =
  | { role: 'system' | 'user'; content: string }
  | AssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type SendChat = (
  messages: ToolChatMessage[],
  tools: ChatTool[],
) => Promise<Result<AssistantMessage, { code: string; message: string }>>;

interface Trace {
  /** Every tool the model called, in order. */
  toolCalls: string[];
  /** create_signup calls the server would have refused with invalid_input. */
  rejectedCreates: number;
}

export type AssistantOutcome = Trace &
  (
    | { kind: 'created'; args: unknown }
    | { kind: 'replied'; text: string }
    | { kind: 'failed'; code: string; message: string }
  );

const CREATE = 'create_signup';

export function toChatTools(tools: readonly ToolDefinition[]): ChatTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: toJsonSchema(t.inputSchema) as Record<string, unknown>,
    },
  }));
}

/**
 * MCP clients put the server instructions in the model's context and tell
 * it the date; the system message stands in for the client doing both.
 */
export function buildAssistantMessages(prompt: string, instructions: string, now: Date): ToolChatMessage[] {
  const today = now.toISOString().slice(0, 10);
  return [
    {
      role: 'system',
      content: `You are connected to OpenSignup through MCP. Today is ${today}.\n\nThe OpenSignup server's instructions:\n${instructions}`,
    },
    { role: 'user', content: prompt },
  ];
}

/** What a read tool returns for a new account with one workspace and nothing in it. */
function emptyAccountResult(name: string): unknown {
  switch (name) {
    case 'list_workspaces':
      return { workspaces: [{ id: 'ws_eval', name: 'Personal', role: 'owner', isDefault: true }] };
    case 'list_signups':
      return { signups: [] };
    default:
      return { error: { code: 'not_found', message: 'nothing in this account matches that id' } };
  }
}

function parseArguments(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export async function runAssistant(
  prompt: string,
  opts: {
    send: SendChat;
    tools: readonly ToolDefinition[];
    instructions: string;
    now: Date;
    maxRounds?: number;
  },
): Promise<AssistantOutcome> {
  const createDef = opts.tools.find((t) => t.name === CREATE);
  if (!createDef) throw new Error(`mcp evals: no ${CREATE} tool in the list`);
  const chatTools = toChatTools(opts.tools);
  const messages = buildAssistantMessages(prompt, opts.instructions, opts.now);
  const trace: Trace = { toolCalls: [], rejectedCreates: 0 };
  const maxRounds = opts.maxRounds ?? 6;

  for (let round = 0; round < maxRounds; round++) {
    const res = await opts.send(messages, chatTools);
    if (!res.ok) return { kind: 'failed', ...res.error, ...trace };
    const reply = res.value;
    const calls = reply.tool_calls ?? [];
    if (calls.length === 0) return { kind: 'replied', text: reply.content ?? '', ...trace };

    messages.push({ role: 'assistant', content: reply.content, tool_calls: calls });
    for (const c of calls) {
      trace.toolCalls.push(c.function.name);
      let result: unknown;
      if (c.function.name === CREATE) {
        const args = parseArguments(c.function.arguments);
        const parsed = args.ok ? createDef.inputSchema.safeParse(args.value) : null;
        if (args.ok && parsed?.success) return { kind: 'created', args: args.value, ...trace };
        trace.rejectedCreates++;
        result =
          parsed && !parsed.success
            ? errorEnvelope(fromZodError(parsed.error))
            : { error: { code: 'invalid_input', message: 'arguments were not valid JSON' } };
      } else {
        result = emptyAccountResult(c.function.name);
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  return { kind: 'failed', code: 'too_many_rounds', message: `no create after ${maxRounds} rounds`, ...trace };
}

/** Runs one tool call for the model and returns the text a client would hand back. */
export type CallTool = (name: string, args: unknown) => Promise<string>;

interface ToolCallRecord {
  name: string;
  args: unknown;
}

export type TurnOutcome =
  | { kind: 'replied'; text: string; toolCalls: ToolCallRecord[] }
  | { kind: 'failed'; code: string; message: string; toolCalls: ToolCallRecord[] };

/**
 * A conversation with the model, one organizer message at a time. Each
 * `say` keeps answering tool calls through `callTool` until the model
 * replies in words, and the history carries over to the next `say`.
 */
export function openConversation(opts: {
  send: SendChat;
  tools: readonly ToolDefinition[];
  instructions: string;
  now: Date;
  callTool: CallTool;
  maxRounds?: number;
}): { say(message: string): Promise<TurnOutcome> } {
  const chatTools = toChatTools(opts.tools);
  const maxRounds = opts.maxRounds ?? 8;
  let messages: ToolChatMessage[] = [];

  return {
    async say(message) {
      if (messages.length === 0) messages = buildAssistantMessages(message, opts.instructions, opts.now);
      else messages.push({ role: 'user', content: message });
      const toolCalls: ToolCallRecord[] = [];

      for (let round = 0; round < maxRounds; round++) {
        const res = await opts.send(messages, chatTools);
        if (!res.ok) return { kind: 'failed', ...res.error, toolCalls };
        const reply = res.value;
        const calls = reply.tool_calls ?? [];
        if (calls.length === 0) {
          messages.push({ role: 'assistant', content: reply.content });
          return { kind: 'replied', text: reply.content ?? '', toolCalls };
        }

        messages.push({ role: 'assistant', content: reply.content, tool_calls: calls });
        for (const c of calls) {
          const args = parseArguments(c.function.arguments);
          toolCalls.push({ name: c.function.name, args: args.ok ? args.value : c.function.arguments });
          const content = args.ok
            ? await opts.callTool(c.function.name, args.value)
            : JSON.stringify({ error: { code: 'invalid_input', message: 'arguments were not valid JSON' } });
          messages.push({ role: 'tool', tool_call_id: c.id, content });
        }
      }
      return { kind: 'failed', code: 'too_many_rounds', message: `no reply after ${maxRounds} rounds`, toolCalls };
    },
  };
}
