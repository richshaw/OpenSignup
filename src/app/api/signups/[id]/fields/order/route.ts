import { readJson } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { reorderFields } from '@/services/slot-fields';

/**
 * Put every field of the signup in the order `fieldIds` gives, in one
 * transaction. The builder sends this when a field is dragged, so a failure
 * never leaves the order half-applied.
 */
export const PUT = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  reorderFields(db, actor, params.id, await readJson(req)),
);
