import { oauthCompactLabel, oauthPrimaryButtonLabel } from "@/lib/auth-provider-labels";
import { ProviderIcon } from "./provider-icons";

export type OAuthProviderInfo = { name: string; loginUrl: string };

/** Server primary SSO first, then rest in API order. */
export function orderProvidersForDisplay(
  providers: OAuthProviderInfo[],
  serverPrimary: string,
): OAuthProviderInfo[] {
  if (serverPrimary === "local") return [...providers];
  const idx = providers.findIndex((p) => p.name === serverPrimary);
  if (idx <= 0) return [...providers];
  const copy = [...providers];
  const [primary] = copy.splice(idx, 1);
  return [primary, ...copy];
}

export function OAuthProviderCompactRow({
  providers,
  persistNextBeforeExternalAuth,
  isLastUsedProvider,
  providerButtonClass,
}: {
  providers: OAuthProviderInfo[];
  persistNextBeforeExternalAuth: () => void;
  isLastUsedProvider: (name: string) => boolean;
  providerButtonClass: (providerName: string, base: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => (
        <a
          key={p.name}
          href={p.loginUrl}
          onClick={() => persistNextBeforeExternalAuth()}
          className={providerButtonClass(
            p.name,
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm text-slate-200",
          )}
        >
          <ProviderIcon provider={p.name} className="h-4 w-4" />
          {oauthCompactLabel(p.name)}
          {isLastUsedProvider(p.name) && <span className="text-[9px] text-primary font-medium">★</span>}
        </a>
      ))}
    </div>
  );
}

export function OAuthProviderStackedList({
  providers,
  persistNextBeforeExternalAuth,
  isLastUsedProvider,
  providerButtonClass,
  size = "md",
  testIdPrefix = "login-oauth-secondary",
}: {
  providers: OAuthProviderInfo[];
  persistNextBeforeExternalAuth: () => void;
  isLastUsedProvider: (name: string) => boolean;
  providerButtonClass: (providerName: string, base: string) => string;
  size?: "md" | "sm";
  /** data-testid suffix per provider: `${prefix}-${name}` */
  testIdPrefix?: string;
}) {
  const pad = size === "md" ? "px-4 py-3" : "px-4 py-2.5";
  const text = size === "md" ? "font-medium text-slate-100" : "text-sm font-medium text-slate-100";
  const iconMd = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <a
          key={p.name}
          data-testid={`${testIdPrefix}-${p.name}`}
          href={p.loginUrl}
          onClick={() => persistNextBeforeExternalAuth()}
          className={providerButtonClass(
            p.name,
            `w-full flex items-center justify-center gap-2 ${pad} rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all ${text}`,
          )}
        >
          <ProviderIcon provider={p.name} className={iconMd} />
          {oauthPrimaryButtonLabel(p.name)}
          {isLastUsedProvider(p.name) && (
            <span className={`text-xs text-primary font-medium ml-1 ${size === "sm" ? "text-[10px]" : ""}`}>
              ★ Last used
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
