import type { EmailMessage, EmailResult, EmailTransport } from './transport';

export class ResendTransport implements EmailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage): Promise<EmailResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: msg.from ?? this.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: msg.headers,
        reply_to: msg.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`resend send failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as { id: string };
    return { id: json.id, transport: 'resend' };
  }
}
