import { organizerRoute } from '@/lib/organizer-route';
import { closeSignup } from '@/services/signups';

export const POST = organizerRoute<{ id: string }>(({ db, actor, params }) =>
  closeSignup(db, actor, params.id),
);
