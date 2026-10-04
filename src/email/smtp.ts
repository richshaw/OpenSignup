import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  /**
   * Unset picks from the port: TLS from the start on 465, otherwise STARTTLS,
   * which `requireTls` decides whether to insist on or only use if offered.
   */
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
// nodemailer's 30 s for DNS and 2 min for the connect. The connect limit is
// per address: nodemailer tries each address the host's name resolves to in
// turn and starts the limit again for each, so with three addresses down the
// sign-in request's own 30 s limit (src/auth/magic-link-send.ts) runs out
// first. Once a server answers, its pace is left to nodemailer's defaults
// (30 s for the greeting, 10 min idle): a reminder that times out after the
// relay took it is retried, and the participant gets it twice.
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

/**
 * What nodemailer says when requireTLS is on and the server won't switch to
 * TLS: it refused STARTTLS, or it refused EHLO, without which STARTTLS can't be
 * asked for. Not "Error initiating TLS", also ETLS: there the server agreed and
 * the handshake failed, which SMTP_REQUIRE_TLS=false would not fix.
 */
const STARTTLS_REFUSED = [
  { code: 'ETLS', prefix: 'Error upgrading connection with STARTTLS' },
  { code: 'ECONNECTION', prefix: 'EHLO failed but HELO does not support required STARTTLS' },
] as const;

const STARTTLS_HINT =
  'The mail server did not accept STARTTLS. If it takes a login without encryption on a network you trust, set SMTP_REQUIRE_TLS=false.';

/**
 * With a login set, a server that has no STARTTLS fails every send, and
 * nodemailer's error doesn't name the setting that allows it. The hint goes in
 * the message, which is what the sign-in and reminder logs print; the original
 * error stays as `cause`, and its `code` is kept.
 */
function withStartTlsHint(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const code = (err as Error & { code?: unknown }).code;
  const refused = STARTTLS_REFUSED.some((r) => r.code === code && err.message.startsWith(r.prefix));
  if (!refused) return err;
  const original = err.message.trimEnd().replace(/\.$/, '');
  return Object.assign(new Error(`${original}. ${STARTTLS_HINT}`, { cause: err }), { code });
}

export class SmtpTransport implements EmailTransport {
  private readonly transporter: nodemailer.Transporter;
  private readonly requireTls: boolean;

  constructor(private readonly cfg: SmtpConfig) {
    const options = smtpTransportOptions(cfg);
    this.requireTls = options.requireTLS === true;
    this.transporter = nodemailer.createTransport(options);
  }

  async send(msg: EmailMessage): Promise<EmailResult> {
    try {
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
    } catch (err) {
      throw this.requireTls ? withStartTlsHint(err) : err;
    }
  }
}
