import { z } from 'zod';
import { log } from '@/lib/log';
import { FullDraftSchema } from '@/lib/magic-compose/prompt';
import { buildWarnings, hasDropped, magicComposeToTemplate } from '@/lib/magic-compose/to-template';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import { err, ok } from '@/lib/result';
import { SignupSettingsSchema, SignupUpdateInputSchema } from '@/schemas/signups';
import {
  archiveSignup,
  closeSignup,
  createSignup,
  deleteSignup,
  getSignupForOrganizer,
  publishSignup,
  updateSignup,
} from '@/services/signups';
import { resolveWorkspaceId } from '../context';
import { signupLinks } from '../links';
import { defineTool } from '../registry';
import { signupDetail } from './signups-read';

const FIELD_GUIDE =
  'Field types: text, date (values are ISO dates like 2026-10-03), time (values are HH:MM), number, enum (give choices). Slot values are keyed by field ref. capacity null means unlimited.';

export const createSignupTool = defineTool({
  name: 'create_signup',
  scope: 'signups:write',
  title: 'Create signup',
  description: `Create a signup with its fields and slots in one step. It starts as a draft nobody can see; call publish_signup when the organizer is ready. ${FIELD_GUIDE} groupBy names a field ref to group slots by on the public page. Values that do not fit their field are dropped and reported in warnings.`,
  annotations: {},
  inputSchema: FullDraftSchema.extend({
    workspaceId: z.string().optional().describe('Defaults to the account default workspace.'),
  }),
  handler: async (ctx, input) => {
    const { workspaceId, ...draft } = input;
    const ws = resolveWorkspaceId(ctx, workspaceId);
    if (!ws.ok) return ws;
    await consumeRateLimit(ctx.db, RateLimits.signupCreatePerOrganizer, ctx.actor.id);
    const { template, groupByFieldRefs, dropped } = magicComposeToTemplate(draft, { templateId: 'mcp' });
    if (hasDropped(dropped)) {
      log.warn({ dropped, clientId: ctx.clientId }, 'mcp create_signup adjusted or dropped values');
    }
    const created = await createSignup(
      ctx.db,
      ctx.actor,
      ws.value,
      {
        title: draft.title,
        description: draft.description,
        visibility: 'unlisted',
        settings: groupByFieldRefs.length > 0 ? { groupByFieldRefs } : {},
      },
      { template },
    );
    if (!created.ok) return created;
    return ok({
      signup: signupDetail(created.value),
      summary: { fieldsAdded: template.fields.length, slotsAdded: template.slots.length, groupByFieldRefs },
      warnings: buildWarnings(dropped),
      links: signupLinks(created.value),
    });
  },
});

/** Settings arrive sparse (no defaults filled in) so they can be merged over the current row. */
const SparseSettingsSchema = SignupSettingsSchema.removeDefault().partial();

export const updateSignupTool = defineTool({
  name: 'update_signup',
  scope: 'signups:write',
  title: 'Update signup',
  description:
    'Change a signup title, description, tags, closing time (ISO datetime), visibility (public, unlisted, password) or settings. Only the settings you pass change; the rest stay as they are. Use the field and slot tools to change what participants sign up for.',
  annotations: {},
  inputSchema: SignupUpdateInputSchema.omit({ settings: true }).extend({
    signupId: z.string(),
    settings: SparseSettingsSchema.optional(),
  }),
  handler: async (ctx, input) => {
    const { signupId, settings, ...rest } = input;
    let merged: Record<string, unknown> | undefined;
    if (settings) {
      const current = await getSignupForOrganizer(ctx.db, ctx.actor, signupId);
      if (!current.ok) return current;
      merged = { ...(current.value.settings as Record<string, unknown>), ...settings };
    }
    const updated = await updateSignup(ctx.db, ctx.actor, signupId, merged ? { ...rest, settings: merged } : rest);
    if (!updated.ok) return updated;
    return ok({ signup: signupDetail(updated.value), links: signupLinks(updated.value) });
  },
});

function statusTool(
  name: string,
  title: string,
  description: string,
  annotations: { destructiveHint?: boolean },
  fn: typeof publishSignup,
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
      if (!r.ok) return err(r.error);
      return ok({ signup: signupDetail(r.value), links: signupLinks(r.value) });
    },
  });
}

export const publishSignupTool = statusTool(
  'publish_signup',
  'Publish signup',
  'Make a draft signup live so participants can sign up at the public link. Only a draft can be published. Confirm with the organizer first.',
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
  'Hide a signup from participants and from the main list. Its data is kept.',
  { destructiveHint: true },
  archiveSignup,
);
export const deleteSignupTool = statusTool(
  'delete_signup',
  'Delete signup',
  'Delete a signup and everything in it. Ask the organizer before calling this.',
  { destructiveHint: true },
  deleteSignup,
);
