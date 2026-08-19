import { getSpooClient, withAuthRetry } from "@/api/spoo";
import { onSessionCacheClear } from "@/lib/cache";
import { useCachedPromise, withCache } from "@raycast/utils";
import { useMemo } from "react";
import type { LinkStatsResponse, StatsResponse } from "spoo.me";

/** Dimensions every stats endpoint accepts. */
export type LinkStatsDimension =
  | "time"
  | "browser"
  | "os"
  | "country"
  | "city"
  | "referrer";

/** The account-wide endpoint can additionally group across links. */
export type StatsDimension = LinkStatsDimension | "short_code";

interface BaseStatsQuery {
  metrics?: ReadonlyArray<"clicks" | "unique_clicks">;
  startDate?: string;
  endDate?: string;
  timezone?: string;
}

/**
 * Account-wide stats by default; set `urlId` to read a single owned link.
 * Per-link queries take the narrower dimensions (`short_code` grouping is a
 * 422 on the per-link endpoint).
 */
export type StatsQuery =
  | (BaseStatsQuery & {
      urlId?: undefined;
      groupBy?: ReadonlyArray<StatsDimension>;
    })
  | (BaseStatsQuery & {
      urlId: string;
      groupBy?: ReadonlyArray<LinkStatsDimension>;
    });

const STATS_TTL_MS = 60_000;

async function fetchStats(
  query: StatsQuery,
): Promise<StatsResponse | LinkStatsResponse> {
  const spoo = getSpooClient();
  const params = {
    groupBy: query.groupBy ? [...query.groupBy] : undefined,
    metrics: query.metrics ? [...query.metrics] : undefined,
    startDate: query.startDate,
    endDate: query.endDate,
    timezone: query.timezone,
  };
  return withAuthRetry(() =>
    query.urlId === undefined
      ? spoo.stats.get(params)
      : spoo.stats.getForLink(query.urlId, params),
  );
}

const fetchStatsCached = withCache(fetchStats, { maxAge: STATS_TTL_MS });
onSessionCacheClear(() => fetchStatsCached.clearCache());

export function useStats(query: StatsQuery) {
  // Stable string key — same contents → same key → no re-fire across renders.
  const key = useMemo(() => JSON.stringify(query), [query]);

  const { data, isLoading, error, revalidate } = useCachedPromise(
    async (serialized: string) =>
      fetchStatsCached(JSON.parse(serialized) as StatsQuery),
    [key],
    { keepPreviousData: true },
  );

  return {
    stats: data,
    isLoading: isLoading && !data,
    error,
    revalidate,
  };
}
