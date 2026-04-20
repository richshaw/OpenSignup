export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  replyTo?: string;
  from?: string;
}

export interface EmailResult {
  id: string;
  transport: 'console' | 'smtp' | 'resend';
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailResult>;
}
