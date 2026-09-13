import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { recordActivity } from './activity';

const db = getDb();
const written: string[] = [];

afterAll(async () => {
  for (const id of written) await db.delete(activity).where(eq(activity.actorId, id));
});

describe('recordActivity attribution', () => {
  it('writes viaClientId into the payload only when the actor names a connected app', async () => {
    const viaId = `org_test_${Date.now()}_via`;
    const plainId = `org_test_${Date.now()}_plain`;
    written.push(viaId, plainId);

    await recordActivity(db, {
      actor: { actorId: viaId, actorType: 'organizer', clientId: 'https://client.example/meta.json' },
      eventType: 'signup.updated',
      payload: { changed: ['title'] },
    });
    await recordActivity(db, {
      actor: { actorId: plainId, actorType: 'organizer' },
      eventType: 'signup.updated',
      payload: { changed: ['title'] },
    });

    const [viaRow] = await db.select().from(activity).where(eq(activity.actorId, viaId));
    const [plainRow] = await db.select().from(activity).where(eq(activity.actorId, plainId));
    expect(viaRow?.payload).toEqual({ changed: ['title'], viaClientId: 'https://client.example/meta.json' });
    expect(plainRow?.payload).toEqual({ changed: ['title'] });
  });
});
