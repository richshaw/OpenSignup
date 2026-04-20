import nodemailer from 'nodemailer';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  secure?: boolean;
  from: string;
}

export class SmtpTransport implements EmailTransport {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly cfg: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure ?? cfg.port === 465,
      auth: cfg.user && cfg.password ? { user: cfg.user, pass: cfg.password } : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<EmailResult> {
    const info = await this.transporter.sendMail({
      from: msg.from ?? this.cfg.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: msg.headers,
      replyTo: msg.replyTo,
    });
    return { id: info.messageId, transport: 'smtp' };
  }
}
