import { readJson } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { deleteField, updateField } from '@/services/slot-fields';

type Params = { id: string; fieldId: string };

export const PATCH = organizerRoute<Params>(async ({ req, db, actor, params }) =>
  updateField(db, actor, params.fieldId, await readJson(req), params.id),
);

export const DELETE = organizerRoute<Params>(({ db, actor, params }) =>
  deleteField(db, actor, params.fieldId, params.id),
);
