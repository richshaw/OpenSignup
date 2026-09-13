import { Button, Heading, Text } from '@react-email/components';
import { formatDuration } from '@/lib/format-duration';
import { EmailLayout } from './layout';

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
      <Heading as="h1" className="m-0 text-xl font-semibold">
        Sign in to OpenSignup
      </Heading>
      <Text className="mt-2 text-[#5b6474]">
        Click the button below to sign in as <strong>{email}</strong>. This link will expire in{' '}
        {formatDuration(expiresInMinutes)}.
      </Text>
      <Button
        href={url}
        className="mt-6 inline-block rounded-lg bg-[#1f6feb] px-5 py-3 text-sm font-medium text-white no-underline"
      >
        Sign in
      </Button>
      {code ? (
        <>
          <Text className="mt-6 text-[#5b6474]">
            Reading this on a different device? Type this code into the window where you
            started signing in instead:
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
