import { fail, ok, readJson, respond } from '@/lib/api-response';
import { link } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { getSignupRowForOrganizer } from '@/services/locks';
import { addSlot, listSlotsForSignup } from '@/services/slots';

export const GET = organizerRoute<{ id: string }>(async ({ db, actor, params: { id } }) => {
  const loaded = await getSignupRowForOrganizer(db, actor, id);
  if (!loaded.ok) return fail(loaded.error);
  return ok(await listSlotsForSignup(db, id));
});

export const POST = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  respond(await addSlot(db, actor, params.id, await readJson(req)), (slot) => ({
    self: link(`/api/slots/${slot.id}`),
    update: link(`/api/slots/${slot.id}`, 'PATCH'),
    delete: link(`/api/slots/${slot.id}`, 'DELETE'),
    commit: link(`/api/slots/${slot.id}/commitments`, 'POST'),
  })),
);
