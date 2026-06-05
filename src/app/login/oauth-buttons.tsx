import { signIn } from '@/auth/config';
import type { OAuthProviderMeta } from '@/auth/oauth-providers';

type Props = {
  providers: OAuthProviderMeta[];
  callbackUrl: string;
};

/**
 * Renders a "Continue with {provider}" button per enabled OAuth provider, plus
 * an "or" divider above the magic-link form. Returns null when no provider is
 * configured, so the login page is unchanged by default (no vendor lock-in).
 */
export function OAuthButtons({ providers, callbackUrl }: Props) {
  if (providers.length === 0) return null;
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {providers.map((provider) => (
          <form
            key={provider.id}
            action={async () => {
              'use server';
              await signIn(provider.id, { redirectTo: callbackUrl });
            }}
          >
            <button
              type="submit"
              className="border-surface-sunk text-ink hover:bg-surface-raised flex w-full items-center justify-center gap-2 rounded-lg border bg-white px-5 py-3 font-medium shadow-sm transition"
            >
              Continue with {provider.label}
            </button>
          </form>
        ))}
      </div>
      <div className="text-ink-muted flex items-center gap-3 text-xs">
        <span className="bg-surface-sunk h-px flex-1" />
        or
        <span className="bg-surface-sunk h-px flex-1" />
      </div>
    </div>
  );
}
