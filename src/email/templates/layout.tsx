import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-[#f7f8fa] font-sans text-[#0b1220]">
          <Container className="mx-auto my-10 max-w-[520px] rounded-xl bg-white p-8 shadow-sm">
            <Section className="pb-4">
              <Text className="m-0 text-lg font-semibold">OpenSignup</Text>
            </Section>
            <Hr className="border-[#eef1f5]" />
            <Section className="py-4">{children}</Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/** The email's one heading. */
export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" className="m-0 text-xl font-semibold">
      {children}
    </Heading>
  );
}

/** The paragraph straight under the heading. */
export function EmailIntro({ children }: { children: ReactNode }) {
  return <Text className="mt-2 text-[#5b6474]">{children}</Text>;
}

/** The email's call to action. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      className="mt-6 inline-block rounded-lg bg-[#1f6feb] px-5 py-3 text-sm font-medium text-white no-underline"
    >
      {children}
    </Button>
  );
}

/** The participant's own notes on their sign-up, or nothing when they left none. */
export function NotesText({ notes }: { notes?: string | null | undefined }) {
  if (!notes) return null;
  return (
    <Text className="mt-4 rounded-lg bg-[#f7f8fa] p-3 text-[#0b1220]">
      <strong>Your notes:</strong> {notes}
    </Text>
  );
}
