import { Text } from '@react-email/components';
import { formatDuration } from '@/lib/format-duration';
import { EmailButton, EmailHeading, EmailIntro, EmailLayout } from './layout';

export interface MagicLinkEmailProps {
  url: string;
  email: string;
  expiresInMinutes?: number;
  /** Six-digit code that can be typed into the window that requested the link. */
  code?: string;
}

export function MagicLinkEmail({ url, email, expiresInMinutes = 60, code }: MagicLinkEmailProps) {
  return (
    <EmailLayout preview={`Sign in to OpenSignup as ${email}`}>
      <EmailHeading>Sign in to OpenSignup</EmailHeading>
      <EmailIntro>
        Click the button below to sign in as <strong>{email}</strong>. This link will expire in{' '}
        {formatDuration(expiresInMinutes)}.
      </EmailIntro>
      <EmailButton href={url}>Sign in</EmailButton>
      {code ? (
        <>
          <Text className="mt-6 text-[#5b6474]">
            Reading this on a different device? Type this code into the window where you started
            signing in instead. It works for 15 minutes:
          </Text>
          <Text className="m-0 font-mono text-2xl font-semibold tracking-[0.3em] text-[#0b1220]">
            {code}
          </Text>
        </>
      ) : null}
      <Text className="mt-6 break-all text-xs text-[#8a93a4]">
        Or copy this URL: <br />
        {url}
      </Text>
    </EmailLayout>
  );
}

export default MagicLinkEmail;
