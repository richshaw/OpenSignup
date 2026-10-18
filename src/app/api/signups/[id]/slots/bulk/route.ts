import { readJson } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { addSlotsBulk } from '@/services/slots';

export const POST = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  addSlotsBulk(db, actor, params.id, await readJson(req)),
);
