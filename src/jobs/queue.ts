import PgBoss from 'pg-boss';
import { getEnv } from '@/lib/env';

declare global {
  // eslint-disable-next-line no-var
  var __signup_pgboss__: PgBoss | undefined;
}

export const QUEUES = {
  reminderDispatch: 'reminders.dispatch',
  reminderSend: 'reminders.send',
} as const;

export async function getBoss(): Promise<PgBoss> {
  if (!globalThis.__signup_pgboss__) {
    const env = getEnv();
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      retentionDays: 14,
    });
    await boss.start();
    for (const name of Object.values(QUEUES)) {
      await boss.createQueue(name);
    }
    globalThis.__signup_pgboss__ = boss;
  }
  return globalThis.__signup_pgboss__;
}

export interface ReminderSendPayload {
  commitmentId: string;
}
