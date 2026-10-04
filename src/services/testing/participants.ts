import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { participants } from '@/db/schema/participants';

/**
 * Turns a participant into one who signed up without an email, so a test can
 * sign up the usual way and then check the same commitment with and without
 * one. A test that only needs such a participant can sign up without an email
 * on a signup whose `requireEmail` is false.
 */
export async function removeParticipantEmail(db: Db, participantId: string): Promise<void> {
  const changed = await db
    .update(participants)
    .set({ email: null, emailLower: null })
    .where(eq(participants.id, participantId))
    .returning({ id: participants.id });
  if (changed.length !== 1) throw new Error(`participant ${participantId} not found`);
}
