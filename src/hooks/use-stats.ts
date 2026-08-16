import { useMemo } from "react";
import { useCachedPromise, withCache } from "@raycast/utils";
import {
  getLinkStats,
  getStats,
  type LinkStatsOptions,
  type StatsOptions,
} from "@/api/stats";

/**
 * Account-wide stats by default; set `urlId` to read a single owned link.
 * Per-link queries take the narrower options (no `short_code` grouping).
 */
export type StatsQuery =
  | (StatsOptions & { urlId?: undefined })
  | (LinkStatsOptions & { urlId: string });

const STATS_TTL_MS = 60_000;

const fetchStatsCached = withCache(
  (query: StatsQuery) =>
    query.urlId === undefined
      ? getStats(query)
      : getLinkStats(query.urlId, query),
  { maxAge: STATS_TTL_MS },
);

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
