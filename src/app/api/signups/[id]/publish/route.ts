import { organizerRoute } from '@/lib/organizer-route';
import { publishSignup } from '@/services/signups';

export const POST = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  publishSignup(db, actor, params.id),
);
