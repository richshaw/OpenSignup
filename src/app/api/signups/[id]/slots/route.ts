import { readJson, respond } from '@/lib/api-response';
import { link } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { addSlot, listSlots } from '@/services/slots';

export const GET = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  listSlots(db, actor, params.id),
);

export const POST = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  respond(await addSlot(db, actor, params.id, await readJson(req)), (slot) => ({
    self: link(`/api/slots/${slot.id}`),
    update: link(`/api/slots/${slot.id}`, 'PATCH'),
    delete: link(`/api/slots/${slot.id}`, 'DELETE'),
    commit: link(`/api/slots/${slot.id}/commitments`, 'POST'),
  })),
);
