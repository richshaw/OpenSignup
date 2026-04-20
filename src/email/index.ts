import { getEnv } from '@/lib/env';
import { ConsoleTransport } from './console';
import { ResendTransport } from './resend';
import { SmtpTransport } from './smtp';
import type { EmailTransport } from './transport';

let cached: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (cached) return cached;
  const env = getEnv();
  switch (env.EMAIL_TRANSPORT) {
    case 'console':
      cached = new ConsoleTransport(env.EMAIL_FROM);
      break;
    case 'resend':
      if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY required for resend transport');
      cached = new ResendTransport(env.RESEND_API_KEY, env.EMAIL_FROM);
      break;
    case 'smtp':
      if (!env.SMTP_HOST || !env.SMTP_PORT) throw new Error('SMTP_HOST and SMTP_PORT required');
      cached = new SmtpTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        secure: env.SMTP_SECURE ?? false,
        from: env.EMAIL_FROM,
      });
      break;
  }
  return cached;
}

export function resetEmailTransport() {
  cached = null;
}

export * from './transport';
