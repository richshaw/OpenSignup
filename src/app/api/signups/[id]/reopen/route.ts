import { organizerRoute } from '@/lib/organizer-route';
import { reopenSignup } from '@/services/signups';

export const POST = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  reopenSignup(db, actor, params.id),
);
