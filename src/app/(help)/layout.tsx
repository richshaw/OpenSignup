import { PublicPageFrame } from '@/components/public-page-frame';

export const dynamic = 'force-static';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <PublicPageFrame>{children}</PublicPageFrame>;
}
