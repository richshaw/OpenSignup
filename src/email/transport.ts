export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /**
   * Sends this email from another address than `EMAIL_FROM`, such as a
   * support address on the same domain: an address, or `Name <address>`. It has
   * to be one the transport may send from: for Resend, an address on a domain
   * verified there. Bounces still go where `EMAIL_FROM`'s do (with SMTP, the
   * envelope sender stays `EMAIL_FROM`). Blank, or only spaces, counts as
   * none.
   */
  from?: string;
  /**
   * Where replies go, as the Reply-To header: an address, or `Name <address>`.
   * Without one, or with a blank one, replies go to the From address.
   * Spaces around an address are dropped.
   */
  replyTo?: string;
}

/**
 * An email's own `from` or `replyTo`, without the spaces around it, or
 * undefined if it has none, is blank or is only spaces, so every transport
 * falls back on the same rule.
 */
export function addressOf(value: string | undefined): string | undefined {
  const address = value?.trim();
  return address ? address : undefined;
}

export interface EmailResult {
  id: string;
  transport: 'console' | 'smtp' | 'resend';
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailResult>;
}
