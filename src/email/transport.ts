export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /**
   * Sends this email from another address than `EMAIL_FROM`, such as a
   * person's own on the same domain: an address, or `Name <address>`. It has
   * to be one the transport may send from: for Resend, an address on a domain
   * verified there. Bounces still go where `EMAIL_FROM`'s do (with SMTP, the
   * envelope sender stays `EMAIL_FROM`). Blank counts as none.
   */
  from?: string;
  /**
   * Where replies go, as the Reply-To header: an address, or `Name <address>`.
   * Without one, or with a blank one, replies go to the From address.
   */
  replyTo?: string;
}

export interface EmailResult {
  id: string;
  transport: 'console' | 'smtp' | 'resend';
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailResult>;
}
