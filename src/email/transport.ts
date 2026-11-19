export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /**
   * Sends this email from another address than `EMAIL_FROM`, such as a
   * person's own on the same domain. It has to be one the transport may send
   * from: for Resend, an address on a domain verified there.
   */
  from?: string;
  /** Where replies go, as the Reply-To header. Without one they go to the From address. */
  replyTo?: string;
}

export interface EmailResult {
  id: string;
  transport: 'console' | 'smtp' | 'resend';
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailResult>;
}
