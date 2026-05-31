export const LANDING_CTAS = ['start_signup', 'demo_video'] as const;

export type LandingCta = (typeof LANDING_CTAS)[number];
