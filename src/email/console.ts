import { randomUUID } from 'node:crypto';
import { log } from '@/lib/log';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

export class ConsoleTransport implements EmailTransport {
  constructor(private readonly from: string) {}

  async send(msg: EmailMessage): Promise<EmailResult> {
    const id = randomUUID();
    const from = msg.from ?? this.from;
    log.info(
      {
        emailId: id,
        to: msg.to,
        from,
        subject: msg.subject,
        textPreview: msg.text.slice(0, 600),
      },
      '[email:console] 📬 would send',
    );
    return { id, transport: 'console' };
  }
}
