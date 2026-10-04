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
import { UNREAD_SETTINGS, signupDetail, signupWithContents, signupWithLinks } from './signups-read';


export const createSignupTool = defineTool({
  name: 'create_signup',
  scope: 'signups:write',
  title: 'Create signup',
  description: `Create a signup with its fields and slots in one step. It starts as a draft that participants cannot see until publish_signup. The result lists every field and slot with its id, so a slot id can go straight to update_slot or delete_slot without calling get_signup. If the result has a note instead of fields and slots, the signup was still created, and get_signup with its id returns it. The result includes links.edit to change the signup and links.preview to see what participants will see; links.public only says the signup is not ready yet until it is published. ${FIELD_GUIDE} groupBy names a field ref to group slots by on the public page. A value that does not fit its field makes the whole call fail with invalid_input and nothing is created, so fix the value and call again.`,
  annotations: { readOnlyHint: false, destructiveHint: false },
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
      note:
        'Created, but its fields and slots could not be read back. ' +
        'Call get_signup with this id; do not create it again.',
    });
  },
});

/**
 * Settings arrive sparse: only the keys the model wants to change. The service
 * merges them over the row.
 *
 * Every setting in UNREAD_SETTINGS is left out until something reads it.
 * Accepting maxCommitmentsPerParticipant told the organizer a limit was in
 * place when anyone could still take every spot. The others would do the same
 * for a hidden notes box, names on the public page or a confirmation message.
 * Strict, so a client that sends one anyway is refused rather than told the
 * change went through.
 *
 * No defaults either: `.partial()` keeps each setting's `.default()`, which the
 * JSON Schema advertises, and a client that fills in defaults would send
 * `requireEmail: true` with an unrelated change and quietly undo the
 * organizer's choice.
 */
const settingsShape = SignupSettingsSchema.removeDefault().omit(UNREAD_SETTINGS).shape;
type WithoutDefaults<T extends z.ZodRawShape> = {
  [K in keyof T]: T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K];
};
const SparseSettingsSchema = z
  .object(
    Object.fromEntries(
      Object.entries(settingsShape).map(([key, field]) => [
        key,
        field instanceof z.ZodDefault ? field.removeDefault() : field,
      ]),
    ) as WithoutDefaults<typeof settingsShape>,
  )
  .partial()
  .strict();

export const updateSignupTool = defineTool({
  name: 'update_signup',
  scope: 'signups:write',
  title: 'Update signup',
  description:
    'Change a signup title, description, tags, closing time (ISO datetime, or null to remove it), visibility (public or unlisted) or settings. Only the settings you pass change. settings.requireEmail is true by default, and every participant must give an email address. Set to false, the email is optional: someone who leaves it blank gets no confirmation or reminder emails. Their link to change or cancel their spot is shown on screen, and only the browser they signed up in remembers it. Setting it back to true asks only new sign-ups; anyone who already signed up without an email keeps their spot. There is no setting to limit how many spots one person can take, turn off notes, list who signed up on the public page (it shows only how full each slot is) or add a confirmation message. Use the field and slot tools to change what participants sign up for.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  // organizerDisplayName is omitted on purpose: no column stores it, so
  // accepting it would report a change that never happened.
  inputSchema: SignupUpdateInputSchema.omit({ settings: true, visibility: true, organizerDisplayName: true }).extend({
    signupId: z.string(),
    visibility: z.enum(['public', 'unlisted']).optional(),
    settings: SparseSettingsSchema.optional(),
  }),
  handler: async (ctx, input) => {
    const { signupId, ...rest } = input;
    const updated = await updateSignup(ctx.db, ctx.actor, signupId, rest);
    return updated.ok ? ok(signupWithLinks(updated.value)) : updated;
  },
});

function statusTool(
  name: string,
  title: string,
  description: string,
  askFirst: boolean,
  fn: typeof publishSignup,
  shape: (row: Parameters<typeof signupDetail>[0]) => Record<string, unknown> = signupWithLinks,
) {
  return defineTool({
    name,
    scope: 'signups:write',
    title,
    description,
    // Every status change is destructive: publishing puts a draft in front
    // of participants, and the rest end or hide it.
    annotations: { readOnlyHint: false, destructiveHint: true },
    ...(askFirst ? { askFirst: true as const } : {}),
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
  'Make a draft signup live so participants can sign up at the public link. Only a draft can be published. Once it is published, links.public is the link to share with participants.',
  // Not in the ask-first line: the instructions give publishing a sentence of its own.
  false,
  publishSignup,
);
export const closeSignupTool = statusTool(
  'close_signup',
  'Close signup',
  'Stop taking signups. Existing commitments stay. This cannot be undone from here.',
  true,
  closeSignup,
);
export const archiveSignupTool = statusTool(
  'archive_signup',
  'Archive signup',
  "Take a signup out of use. Anyone opening the public link is told it is archived, and reminders stop. It stays in the organizer's list marked archived, with its data. This cannot be undone.",
  true,
  archiveSignup,
);
export const deleteSignupTool = statusTool(
  'delete_signup',
  'Delete signup',
  'Remove a signup from the account: it stops appearing in lists and its public link stops working. The record is marked deleted rather than erased, so erasing it for good is a separate request to the site owner. A delete leaves the signup status as it was, so deleted and deletedAt in the result show that it worked, not status.',
  true,
  deleteSignup,
  // No links: nothing to open after a delete. `deleted` makes the outcome explicit
  // even though status stays as it was (e.g. draft). deleteSignup sets deletedAt on
  // every ok() path, the idempotent re-delete included, so the fallback is only here
  // because the column is nullable in the schema.
  (row) => ({
    signup: signupDetail(row),
    deleted: true,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }),
);
