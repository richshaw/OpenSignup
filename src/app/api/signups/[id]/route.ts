import { readJson, respond } from '@/lib/api-response';
import { link, publicSignupUrl } from '@/lib/links';
import { organizerRoute } from '@/lib/organizer-route';
import { getSignupForOrganizer, updateSignup } from '@/services/signups';

export const GET = organizerRoute<{ id: string }>(async ({ db, actor, params: { id } }) =>
  respond(await getSignupForOrganizer(db, actor, id), (signup) => ({
    self: link(`/api/signups/${id}`),
    update: link(`/api/signups/${id}`, 'PATCH'),
    addSlot: link(`/api/signups/${id}/slots`, 'POST'),
    publish: link(`/api/signups/${id}/publish`, 'POST'),
    close: link(`/api/signups/${id}/close`, 'POST'),
    archive: link(`/api/signups/${id}/archive`, 'POST'),
    activity: link(`/api/signups/${id}/activity`),
    exportCsv: link(`/api/signups/${id}/export.csv`),
    public: link(publicSignupUrl(signup.slug)),
  })),
);

export const PATCH = organizerRoute<{ id: string }>(async ({ req, db, actor, params }) =>
  updateSignup(db, actor, params.id, await readJson(req)),
);
