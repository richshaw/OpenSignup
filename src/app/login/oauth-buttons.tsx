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
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-sunk bg-white px-5 py-3 font-medium text-ink shadow-sm transition hover:bg-surface-raised"
            >
              Continue with {provider.label}
            </button>
          </form>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-surface-sunk" />
        or
        <span className="h-px flex-1 bg-surface-sunk" />
      </div>
    </div>
  );
}
