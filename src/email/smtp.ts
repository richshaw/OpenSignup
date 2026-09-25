import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  /** Unset picks from the port: TLS from the start on 465, STARTTLS elsewhere. */
  secure?: boolean;
  from: string;
}

// The magic-link send is awaited inside the sign-in request, so a mail server
// that never answers has to fail in seconds. nodemailer's defaults are 2 min
// to connect, 30 s for the greeting and 10 min of silence mid-send.
export const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
export const SMTP_GREETING_TIMEOUT_MS = 10_000;
export const SMTP_SOCKET_TIMEOUT_MS = 30_000;

export function smtpTransportOptions(cfg: SmtpConfig): SMTPTransport.Options {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure ?? cfg.port === 465,
    auth: cfg.user && cfg.password ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    // Every message is a string we rendered. Refusing file paths and URLs as
    // content means nothing built from organizer or participant input can make
    // nodemailer read a local file or fetch an internal address into an email.
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export class SmtpTransport implements EmailTransport {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly cfg: SmtpConfig) {
    this.transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
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
