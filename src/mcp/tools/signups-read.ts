import { z } from 'zod';
import { ok } from '@/lib/result';
import { SIGNUP_STATUSES } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { getSignupForOrganizer, listSignupsForWorkspace, type SignupWithSlots } from '@/services/signups';
import { resolveWorkspaceId } from '../context';
import { signupLinks } from '../links';
import { defineTool } from '../registry';

type SignupRow = Omit<SignupWithSlots, 'slots' | 'fields'>;
type SlotRow = SignupWithSlots['slots'][number];

/** A field as every tool shows it. */
export function fieldOut(f: SlotFieldDefinition) {
  return { id: f.id, ref: f.ref, label: f.label, fieldType: f.fieldType, sortOrder: f.sortOrder, config: f.config };
}

/** A slot as every tool shows it; `filled` is added where the count is known. */
export function slotOut(s: SlotRow) {
  return { id: s.id, values: s.values, capacity: s.capacity, status: s.status, sortOrder: s.sortOrder };
}

function signupCore(row: SignupRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    closesAt: row.closesAt ? row.closesAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The list shape: enough to pick a signup, small enough for 200 rows. */
export function signupSummary(row: SignupRow) {
  return { ...signupCore(row), links: signupLinks(row) };
}

/** The detail shape plus links: what every tool that changes a signup returns. */
export function signupWithLinks(row: SignupRow) {
  return { signup: signupDetail(row), links: signupLinks(row) };
}

/** The detail shape: everything the organizer can edit. */
export function signupDetail(row: SignupRow) {
  return {
    ...signupCore(row),
    description: row.description,
    tags: row.tags,
    settings: row.settings,
    workspaceId: row.workspaceId,
  };
}

export const listSignups = defineTool({
  name: 'list_signups',
  scope: 'signups:read',
  title: 'List signups',
  description:
    'Signups in a workspace, newest first, up to 200. Filter by status: draft (not yet visible to participants), open (taking signups), closed, archived. Use get_signup for fields, slots and the description.',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({
    workspaceId: z.string().min(1).optional().describe('Defaults to the account default workspace.'),
    status: z.enum(SIGNUP_STATUSES).optional(),
  }),
  handler: async (ctx, input) => {
    const ws = resolveWorkspaceId(ctx, input.workspaceId);
    if (!ws.ok) return ws;
    const rows = await listSignupsForWorkspace(
      ctx.db,
      ctx.actor,
      ws.value,
      input.status ? { status: input.status } : {},
    );
    if (!rows.ok) return rows;
    return ok({ signups: rows.value.map(signupSummary) });
  },
});

export const getSignup = defineTool({
  name: 'get_signup',
  scope: 'signups:read',
  title: 'Get signup',
  description:
    'One signup with its fields (the columns every slot has), its slots (each with values keyed by field ref, capacity, and how many places are filled), and links to the build page and the public page. Never includes who signed up.',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({ signupId: z.string() }),
  handler: async (ctx, input) => {
    const found = await getSignupForOrganizer(ctx.db, ctx.actor, input.signupId, { includeFilled: true });
    if (!found.ok) return found;
    const { slots, fields, committedBySlot: filled = {}, ...row } = found.value;
    return ok({
      signup: signupDetail(row),
      fields: fields.map(fieldOut),
      slots: slots.map((s) => ({ ...slotOut(s), filled: filled[s.id] ?? 0 })),
      links: signupLinks(row),
    });
  },
});
