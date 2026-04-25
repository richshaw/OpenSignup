import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout';

export interface MagicLinkEmailProps {
  url: string;
  email: string;
  expiresInMinutes?: number;
}

export function MagicLinkEmail({ url, email, expiresInMinutes = 15 }: MagicLinkEmailProps) {
  return (
    <EmailLayout preview={`Sign in to Signups as ${email}`}>
      <Heading as="h1" className="m-0 text-xl font-semibold">
        Sign in to Signups
      </Heading>
      <Text className="mt-2 text-[#5b6474]">
        Click the button below to sign in as <strong>{email}</strong>. This link will expire in
        {` ${expiresInMinutes} minutes`}.
      </Text>
      <Button
        href={url}
        className="mt-6 inline-block rounded-lg bg-[#1f6feb] px-5 py-3 text-sm font-medium text-white no-underline"
      >
        Sign in
      </Button>
      <Text className="mt-6 break-all text-xs text-[#8a93a4]">
        Or copy this URL: <br />
        {url}
      </Text>
    </EmailLayout>
  );
}

export default MagicLinkEmail;
