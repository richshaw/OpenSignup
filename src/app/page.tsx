import { headers } from 'next/headers';
import Link from 'next/link';
import { after } from 'next/server';
import { SiteFooter } from '@/components/site-footer';
import { INSTANCE_NAME } from '@/lib/site-config';
import { readRequestSignals, recordLandingView } from '@/lib/view-tracker';
import { DemoVideoCta } from './_components/DemoVideoCta';
import { HomeExampleCard } from './_components/HomeExampleCard';
import { StartSignupCta } from './_components/StartSignupCta';

export default async function LandingPage() {
  const demoUrl = process.env.NEXT_PUBLIC_DEMO_URL;
  const demoVideoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  const demoVideoPoster = process.env.NEXT_PUBLIC_DEMO_VIDEO_POSTER;

  const signals = readRequestSignals(await headers());
  after(() => recordLandingView({ signals }));

  return (
    <div className="bg-surface text-ink flex min-h-[100svh] flex-col">
      <header className="flex items-center justify-between px-5 py-5 lg:px-12 lg:py-6">
        <span className="text-lg font-semibold tracking-tight lg:text-xl">{INSTANCE_NAME}</span>
        <Link href="/login" className="text-sm font-medium hover:underline">
          Organizer sign in
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 items-center gap-10 px-5 pb-12 pt-2 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-12 lg:pb-16 lg:pt-4">
        <div className="flex flex-col gap-6 lg:gap-7">
          <span className="border-surface-sunk text-ink-muted inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-medium">
            <span aria-hidden="true" className="bg-success h-1.5 w-1.5 rounded-full" />
            Ad-free · No accounts for participants
          </span>

          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight lg:text-[3.5rem]">
            Sign-up sheets,
            <br />
            <span className="text-ink-muted">redone.</span>
          </h1>

          <p className="text-ink-muted max-w-[520px] text-base leading-normal lg:text-lg">
            Coordinate snack rotations, potlucks, volunteer shifts, and carpools. Made for school
            parents, coaches, and community organizers.
          </p>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <StartSignupCta
              href="/app/signups/new"
              className="bg-brand inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-base font-semibold text-white transition hover:brightness-110 lg:text-[15px]"
            >
              Start a signup
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </StartSignupCta>
            {demoVideoUrl ? (
              <DemoVideoCta videoUrl={demoVideoUrl} posterUrl={demoVideoPoster} />
            ) : demoUrl ? (
              <a
                href={demoUrl}
                className="bg-surface border-surface-sunk text-ink hover:bg-surface-raised inline-flex items-center justify-center gap-2 rounded-[14px] border px-5 py-3 text-base font-medium transition lg:text-[15px]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
                </svg>
                Watch demo
              </a>
            ) : null}
          </div>

          <p className="text-ink-soft text-center text-sm lg:text-left">
            Free · publish in minutes · no credit card.
          </p>
        </div>

        <div className="relative flex justify-center lg:justify-start">
          <div
            aria-hidden="true"
            className="bg-surface-raised pointer-events-none absolute -inset-y-8 -left-4 -right-12 hidden rounded-full opacity-70 blur-2xl lg:block"
          />
          <div className="relative z-10 w-full max-w-[560px]">
            <HomeExampleCard />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
