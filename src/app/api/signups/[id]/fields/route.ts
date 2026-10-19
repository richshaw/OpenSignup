import { readJson, respond } from '@/lib/api-response';
import { link } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { addField, listFields } from '@/services/slot-fields';

export const GET = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  listFields(db, actor, params.id),
);

export const POST = organizerRoute<{ id: string }>(async ({ req, db, actor, params: { id } }) =>
  respond(await addField(db, actor, id, await readJson(req)), (field) => ({
    self: link(`/api/signups/${id}/fields/${field.id}`),
    update: link(`/api/signups/${id}/fields/${field.id}`, 'PATCH'),
    delete: link(`/api/signups/${id}/fields/${field.id}`, 'DELETE'),
  })),
);
