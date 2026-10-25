import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { ToolDefinition } from '../registry';
import { connectTestClient } from '../testing/client';
import { contextForOrganizer } from '../testing/context';
import { openConversation, type CallTool, type SendChat, type TurnOutcome } from './assistant';
import type { FollowupState, SlotState } from './followup-checks';

/**
 * The database side of the MCP follow-up evals: a case's messages, sent to
 * the model one at a time, with every tool call answered by the real tools
 * against a local Postgres, the way `tools.db.test.ts` drives them. Each case
 * gets its own organizer and workspace, removed afterwards, so one case's
 * signups never show up in another's `list_signups`.
 */

type Client = Awaited<ReturnType<typeof connectTestClient>>;

interface FollowupTurn {
  message: string;
  outcome: TurnOutcome;
}

export type FollowupRun =
  | { ok: true; state: FollowupState; turns: FollowupTurn[] }
  | { ok: false; code: string; message: string; turns: FollowupTurn[] };

async function withEvalOrganizer<T>(db: Db, fn: (organizerId: string) => Promise<T>): Promise<T> {
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  await db.insert(organizers).values({ id: organizerId, email: `${organizerId}@example.com`, defaultWorkspaceId: workspaceId });
  await db.insert(workspaces).values({
    id: workspaceId,
    slug: organizerId.toLowerCase(),
    name: 'Personal',
    type: 'personal',
    plan: 'free',
  });
  await db.insert(workspaceMembers).values({ id: makeId('mem'), workspaceId, organizerId, role: 'owner', status: 'active' });
  try {
    return await fn(organizerId);
  } finally {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  }
}

/** What an MCP client hands the model: the tool result's text content. */
function callThrough(client: Client): CallTool {
  return async (name, args) => {
    const r = await client.callTool({ name, arguments: args as Record<string, unknown> });
    const content = Array.isArray(r.content) ? r.content : [];
    return content
      .map((c: { type: string; text?: string }) => (c.type === 'text' ? (c.text ?? '') : ''))
      .join('\n');
  };
}

/** The one signup in the case's workspace, read through the tools. */
async function readSignup(client: Client): Promise<{ slots: SlotState[]; editLink: string } | null> {
  const list = await client.callTool({ name: 'list_signups', arguments: {} });
  const signups = (list.structuredContent as { signups?: { id: string }[] } | undefined)?.signups ?? [];
  const id = signups[0]?.id;
  if (!id) return null;
  const got = await client.callTool({ name: 'get_signup', arguments: { signupId: id } });
  const body = got.structuredContent as {
    slots: (SlotState & { sortOrder: number })[];
    links: { edit: string };
  };
  const slots = [...body.slots]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id: slotId, values, capacity }) => ({ id: slotId, values, capacity }));
  return { slots, editLink: body.links.edit };
}

export async function runFollowupCase(
  db: Db,
  c: { prompt: string; followUps: readonly string[] },
  opts: { send: SendChat; tools: readonly ToolDefinition[]; instructions: string; now: Date },
): Promise<FollowupRun> {
  return withEvalOrganizer(db, async (organizerId) => {
    const client = await connectTestClient(await contextForOrganizer(db, organizerId), opts.tools);
    const convo = openConversation({ ...opts, callTool: callThrough(client) });
    const turns: FollowupTurn[] = [];
    const say = async (message: string) => {
      const outcome = await convo.say(message);
      turns.push({ message, outcome });
      return outcome;
    };

    const first = await say(c.prompt);
    if (first.kind === 'failed') return { ok: false, code: first.code, message: first.message, turns };
    const before = await readSignup(client);
    if (!before) {
      return { ok: false, code: 'no_signup', message: `no signup after the first message: "${first.text.slice(0, 200)}"`, turns };
    }

    let last: TurnOutcome = first;
    for (const message of c.followUps) {
      last = await say(message);
      if (last.kind === 'failed') return { ok: false, code: last.code, message: last.message, turns };
    }
    const after = await readSignup(client);
    if (!after) return { ok: false, code: 'no_signup', message: 'the signup was gone after the follow-ups', turns };

    return {
      ok: true,
      turns,
      state: {
        before: before.slots,
        after: after.slots,
        editLink: after.editLink,
        followUpToolCalls: turns.slice(1).flatMap((t) => t.outcome.toolCalls.map((tc) => tc.name)),
        reply: last.kind === 'replied' ? last.text : '',
      },
    };
  });
}
