import { readJson } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { deleteSlot, updateSlot } from '@/services/slots';

export const PATCH = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  updateSlot(db, actor, params.id, await readJson(req)),
);

// The organizer is at the keyboard; the browser already asked them.
export const DELETE = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  deleteSlot(db, actor, params.id, { force: true }),
);
