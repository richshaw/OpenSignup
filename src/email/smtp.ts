import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  /** Unset picks from the port: TLS from the start on 465, otherwise STARTTLS if offered. */
  secure?: boolean;
  /**
   * Whether a connection that doesn't start with TLS must switch to it with
   * STARTTLS before going on. Unset requires it only when a login is set; true
   * requires it even without one; false never does.
   */
  requireTls?: boolean;
  from: string;
}

// A mail host that is down or firewalled has to fail in seconds, not
// nodemailer's 30 s for DNS and 2 min for the connect. Once a server answers,
// its pace is left to nodemailer's defaults (30 s for the greeting, 10 min
// idle): a reminder that times out after the relay took it is retried, and the
// participant gets it twice. The sign-in request sets its own overall limit.
const SMTP_DNS_TIMEOUT_MS = 10_000;
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;

export function smtpTransportOptions(cfg: SmtpConfig): SMTPTransport.Options {
  const secure = cfg.secure ?? cfg.port === 465;
  const auth = cfg.user && cfg.password ? { user: cfg.user, pass: cfg.password } : undefined;
  return {
    host: cfg.host,
    port: cfg.port,
    secure,
    auth,
    // Without TLS from the start, nodemailer encrypts only if the server offers
    // STARTTLS. A server without it, or anyone on the network who strips the
    // offer, would get the login in plain text, then the sign-in link and code;
    // requireTLS fails the send instead. Without a login it stays off unless
    // asked for, deliberately: a local test mail server usually has no TLS.
    requireTLS: !secure && (cfg.requireTls ?? auth !== undefined),
    dnsTimeout: SMTP_DNS_TIMEOUT_MS,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
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
