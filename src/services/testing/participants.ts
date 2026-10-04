import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { participants } from '@/db/schema/participants';

/**
 * Turns a participant into one who signed up without an email. Nothing in the
 * app writes such a participant yet, so tests sign up with an email and then
 * take it away here.
 */
export async function removeParticipantEmail(db: Db, participantId: string): Promise<void> {
  const changed = await db
    .update(participants)
    .set({ email: null, emailLower: null })
    .where(eq(participants.id, participantId))
    .returning({ id: participants.id });
  if (changed.length !== 1) throw new Error(`participant ${participantId} not found`);
}
