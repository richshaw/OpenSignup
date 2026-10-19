import { organizerRoute } from '@/lib/organizer-route';
import { archiveSignup } from '@/services/signups';

export const POST = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  archiveSignup(db, actor, params.id),
);
