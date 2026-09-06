import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
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
