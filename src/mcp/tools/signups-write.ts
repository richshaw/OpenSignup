import { z } from 'zod';
import { log } from '@/lib/log';
import { persistDraft } from '@/lib/magic-compose/persist';
import { FullDraftSchema } from '@/lib/magic-compose/prompt';
import { requireWorkspaceWrite } from '@/lib/policy';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import { ok } from '@/lib/result';
import { SignupSettingsSchema, SignupUpdateInputSchema } from '@/schemas/signups';
import {
  archiveSignup,
  closeSignup,
  deleteSignup,
  getSignupForOrganizer,
  publishSignup,
  updateSignup,
} from '@/services/signups';
import { resolveWorkspaceId } from '../context';
import { defineTool } from '../registry';
import { FIELD_GUIDE } from './guides';
import { signupDetail, signupWithContents, signupWithLinks } from './signups-read';


export const createSignupTool = defineTool({
  name: 'create_signup',
  scope: 'signups:write',
  title: 'Create signup',
  description: `Create a signup with its fields and slots in one step. It starts as a draft that participants cannot see; call publish_signup when the organizer is ready. The result lists every field and slot with its id, so a slot id can go straight to update_slot or delete_slot without calling get_signup. Afterwards show the organizer the slots as a table, with links.edit to change them and links.preview to see what participants will see; links.public only says the signup is not ready yet until it is published. ${FIELD_GUIDE} groupBy names a field ref to group slots by on the public page. A value that does not fit its field makes the whole call fail with invalid_input and nothing is created, so fix the value and call again.`,
  annotations: {},
  inputSchema: FullDraftSchema.extend({
    workspaceId: z.string().min(1).optional().describe('Defaults to the account default workspace.'),
  }),
  handler: async (ctx, input) => {
    const { workspaceId, ...draft } = input;
    const ws = resolveWorkspaceId(ctx, workspaceId);
    if (!ws.ok) return ws;
    // Policy first: a viewer's attempt must not cost a create-quota unit.
    requireWorkspaceWrite(ctx.actor, ws.value);
    await consumeRateLimit(ctx.db, RateLimits.signupCreatePerOrganizer, ctx.actor.id);
    const persisted = await persistDraft(ctx.db, ctx.actor, ws.value, draft, {
      templateId: 'mcp',
      strict: true,
      logContext: { clientId: ctx.clientId },
    });
    if (!persisted.ok) return persisted;
    // Read it back so ids and order are the stored ones, exactly as get_signup
    // shows them. No `warnings`: a strict create refuses anything it cannot
    // represent, so there is never a dropped value left to report.
    const { signup } = persisted.value;
    const found = await getSignupForOrganizer(ctx.db, ctx.actor, signup.id).catch(
      (error: unknown) => ({ ok: false as const, error }),
    );
    if (found.ok) return ok(signupWithContents(found.value));
    // The signup exists by now. An error here would invite a retry that creates
    // it twice, so report the create and point at get_signup for the rest.
    log.warn({ err: found.error, signupId: signup.id }, 'mcp: create_signup read-back failed');
    return ok({
      ...signupWithLinks(signup),
      note: 'Created. Call get_signup with this id for its fields and slots.',
    });
  },
});

/**
 * Settings arrive sparse: only the keys the model wants to change, with
 * `null` clearing an optional one. The service merges them over the row.
 */
const SparseSettingsSchema = SignupSettingsSchema.removeDefault()
  .partial()
  .extend({
    maxCommitmentsPerParticipant: z.number().int().positive().nullable().optional(),
    confirmationMessage: z.string().max(500).nullable().optional(),
  });

export const updateSignupTool = defineTool({
  name: 'update_signup',
  scope: 'signups:write',
  title: 'Update signup',
  description:
    'Change a signup title, description, tags, closing time (ISO datetime, or null to remove it), visibility (public or unlisted) or settings. Only the settings you pass change; pass null to clear maxCommitmentsPerParticipant or confirmationMessage. Use the field and slot tools to change what participants sign up for.',
  annotations: {},
  // organizerDisplayName is omitted on purpose: no column stores it, so
  // accepting it would report a change that never happened.
  inputSchema: SignupUpdateInputSchema.omit({ settings: true, visibility: true, organizerDisplayName: true }).extend({
    signupId: z.string(),
    visibility: z.enum(['public', 'unlisted']).optional(),
    settings: SparseSettingsSchema.optional(),
  }),
  handler: async (ctx, input) => {
    const { signupId, ...rest } = input;
    const updated = await updateSignup(ctx.db, ctx.actor, signupId, rest, { mergeSettings: true });
    return updated.ok ? ok(signupWithLinks(updated.value)) : updated;
  },
});

function statusTool(
  name: string,
  title: string,
  description: string,
  annotations: { destructiveHint?: boolean },
  fn: typeof publishSignup,
  shape: (row: Parameters<typeof signupDetail>[0]) => Record<string, unknown> = signupWithLinks,
) {
  return defineTool({
    name,
    scope: 'signups:write',
    title,
    description,
    annotations,
    inputSchema: z.object({ signupId: z.string() }),
    handler: async (ctx, input) => {
      const r = await fn(ctx.db, ctx.actor, input.signupId);
      return r.ok ? ok(shape(r.value)) : r;
    },
  });
}

export const publishSignupTool = statusTool(
  'publish_signup',
  'Publish signup',
  'Make a draft signup live so participants can sign up at the public link. Only a draft can be published. Confirm with the organizer first. Once it is published, links.public is the link to share with participants.',
  {},
  publishSignup,
);
export const closeSignupTool = statusTool(
  'close_signup',
  'Close signup',
  'Stop taking signups. Existing commitments stay. This cannot be undone from here.',
  { destructiveHint: true },
  closeSignup,
);
export const archiveSignupTool = statusTool(
  'archive_signup',
  'Archive signup',
  "Take a signup out of use. Anyone opening the public link is told it is archived, and reminders stop. It stays in the organizer's list marked archived, with its data. This cannot be undone.",
  { destructiveHint: true },
  archiveSignup,
);
export const deleteSignupTool = statusTool(
  'delete_signup',
  'Delete signup',
  'Remove a signup from the account: it stops appearing in lists and its public link stops working. The record is marked deleted rather than erased, so erasing it for good is a separate request to the site owner. Ask the organizer before calling this.',
  { destructiveHint: true },
  deleteSignup,
  // No links: nothing to open after a delete.
  (row) => ({ signup: signupDetail(row) }),
);
