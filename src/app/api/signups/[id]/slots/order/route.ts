import { readJson } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { reorderSlots } from '@/services/slots';

/**
 * Put every slot of the signup in the order `slotIds` gives, in one
 * transaction. The builder sends this when a slot is dragged, so a failure
 * never leaves the order half-applied.
 */
export const PUT = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  reorderSlots(db, actor, params.id, await readJson(req)),
);
