import type { StatsDataPoint } from "spoo.me";

/**
 * Selectors over the stats payload's dynamic `metrics` dict. Typed
 * structurally so both `StatsResponse` and `LinkStatsResponse` fit.
 */

export interface StatsSummary {
  total_clicks: number;
  unique_clicks: number;
  first_click?: string | null;
  last_click?: string | null;
  avg_redirection_time?: number | null;
}

export interface StatsLike {
  summary?: StatsSummary | null;
  metrics?: Record<string, StatsDataPoint[]>;
}

export const EMPTY_SUMMARY: StatsSummary = {
  total_clicks: 0,
  unique_clicks: 0,
  avg_redirection_time: 0,
  first_click: null,
  last_click: null,
};

export function summaryOf(stats: StatsLike | undefined | null): StatsSummary {
  return stats?.summary ?? EMPTY_SUMMARY;
}

export type MetricName = "clicks" | "unique_clicks";
export type DimensionName =
  | "time"
  | "browser"
  | "os"
  | "country"
  | "city"
  | "referrer"
  | "short_code";

export interface BreakdownRow {
  key: string;
  value: number;
  percentage: number;
}

export function getBreakdown(
  stats: StatsLike | undefined,
  metric: MetricName,
  dimension: DimensionName,
): BreakdownRow[] {
  if (!stats) return [];
  const rows = stats.metrics?.[`${metric}_by_${dimension}`] ?? [];
  return rows
    .map((row) => ({
      key: String(row[dimension] ?? ""),
      value: Number(row[metric] ?? 0),
      percentage: Number(row[`${metric}_percentage`] ?? 0),
    }))
    .filter((row) => row.key !== "" || row.value > 0);
}

export function getTimeSeries(
  stats: StatsLike | undefined,
  metric: MetricName = "clicks",
): Array<{ time: string; value: number }> {
  if (!stats) return [];
  const rows = stats.metrics?.[`${metric}_by_time`] ?? [];
  return rows
    .map((row) => ({
      time: String(row.time ?? ""),
      value: Number(row[metric] ?? 0),
    }))
    .filter((row) => row.time !== "");
}
