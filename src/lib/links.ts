import { getApiBaseUrl } from "@/constants";
import type { ApiSchema, CreatedLink, Link, UrlId } from "spoo.me";

export type LinkStatus = ApiSchema["schemas"]["UrlStatus"];

/**
 * Plain-JSON projection of the SDK's `Link` used everywhere in the UI and in
 * Raycast's Cache. Dates are ISO strings so the object survives the
 * serialize/deserialize round trip of `Cache`/`useCachedPromise` unchanged
 * (`toDate()` in lib/format tolerates strings).
 */
export interface LinkItem {
  id: UrlId;
  alias: string | null;
  short_url: string;
  long_url: string | null;
  status: LinkStatus | null;
  created_at: string | null;
  expire_after: string | null;
  max_clicks: number | null;
  private_stats: boolean | null;
  block_bots: boolean | null;
  password_set: boolean;
  total_clicks: number | null;
  last_click: string | null;
  domain: string | null;
}

/** Plain-JSON snapshot of one page of links, safe for Raycast's Cache. */
export interface LinksSnapshot {
  items: LinkItem[];
  total: number;
  hasNext: boolean;
}

/**
 * Map an SDK link to the UI DTO, synthesizing `short_url` (the list endpoint
 * does not return one). Links on a custom domain resolve against that domain
 * instead of the configured base URL.
 */
export function toLinkItem(link: Link): LinkItem {
  const origin = link.domain ? domainOrigin(link.domain) : getApiBaseUrl();
  return {
    id: link.id,
    alias: link.alias ?? null,
    short_url: `${origin}/${encodeURIComponent(link.alias ?? link.id)}`,
    long_url: link.long_url ?? null,
    status: link.status ?? null,
    created_at: link.created_at?.toISOString() ?? null,
    expire_after: link.expire_after?.toISOString() ?? null,
    max_clicks: link.max_clicks ?? null,
    private_stats: link.private_stats ?? null,
    block_bots: link.block_bots ?? null,
    password_set: link.password_set,
    total_clicks: link.total_clicks ?? null,
    last_click: link.last_click?.toISOString() ?? null,
    domain: link.domain ?? null,
  };
}

interface CreatedLinkOverrides {
  passwordSet?: boolean;
  blockBots?: boolean;
  privateStats?: boolean;
  maxClicks?: number;
  expiresAt?: Date;
}

/** Shape a freshly created link like a list item so detail views can render it. */
export function createdToLinkItem(
  created: CreatedLink,
  overrides: CreatedLinkOverrides = {},
): LinkItem {
  return {
    id: created.id,
    alias: created.alias,
    short_url: created.short_url,
    long_url: created.long_url,
    status: created.status ?? "ACTIVE",
    created_at: created.created_at.toISOString(),
    expire_after: overrides.expiresAt?.toISOString() ?? null,
    max_clicks: overrides.maxClicks ?? null,
    private_stats: overrides.privateStats ?? created.private_stats ?? false,
    block_bots: overrides.blockBots ?? false,
    password_set: overrides.passwordSet ?? false,
    total_clicks: 0,
    last_click: null,
    domain: null,
  };
}

function domainOrigin(domain: string): string {
  if (/^https?:\/\//i.test(domain)) return domain.replace(/\/+$/, "");
  return `https://${domain}`;
}
