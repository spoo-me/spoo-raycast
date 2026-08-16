import { apiDownload, apiFetch } from "@/api/client";
import {
  StatsResponseSchema,
  type ExportFormat,
  type StatsResponse,
} from "@/schemas/stats";

/** Dimensions every stats endpoint accepts. */
type LinkStatsDimension =
  | "time"
  | "browser"
  | "os"
  | "country"
  | "city"
  | "referrer";

/** The account-wide endpoint can additionally group across links. */
type StatsDimension = LinkStatsDimension | "short_code";

interface BaseStatsOptions {
  metrics?: Array<"clicks" | "unique_clicks">;
  startDate?: string;
  endDate?: string;
  timezone?: string;
}

export interface StatsOptions extends BaseStatsOptions {
  groupBy?: ReadonlyArray<StatsDimension>;
}

/** Per-link stats reject `short_code` grouping (422 from the backend). */
export interface LinkStatsOptions extends BaseStatsOptions {
  groupBy?: ReadonlyArray<LinkStatsDimension>;
}

function toQuery(options: StatsOptions) {
  return {
    group_by: options.groupBy?.join(","),
    metrics: options.metrics?.join(","),
    start_date: options.startDate,
    end_date: options.endDate,
    timezone: options.timezone,
  };
}

/** Account-wide analytics across all of the user's links. */
export async function getStats(
  options: StatsOptions = {},
): Promise<StatsResponse> {
  return apiFetch("/api/v1/stats", {
    query: toQuery(options),
    schema: StatsResponseSchema,
  });
}

/** Analytics for a single owned link, addressed by its url id. */
export async function getLinkStats(
  urlId: string,
  options: LinkStatsOptions = {},
): Promise<StatsResponse> {
  return apiFetch(`/api/v1/stats/links/${encodeURIComponent(urlId)}`, {
    query: toQuery(options),
    schema: StatsResponseSchema,
  });
}

/** Export a single owned link's analytics, addressed by its url id. */
export async function exportLinkStats(
  urlId: string,
  format: ExportFormat,
): Promise<Blob> {
  return apiDownload(`/api/v1/export/links/${encodeURIComponent(urlId)}`, {
    format,
  });
}
