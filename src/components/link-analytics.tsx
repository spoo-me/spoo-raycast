import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSpooClient, withAuthRetry } from "@/api/spoo";
import { renderStatsSections } from "@/components/stats-markdown";
import { useStats } from "@/hooks/use-stats";
import { reportError } from "@/lib/errors";
import { formatClicks, formatRelative } from "@/lib/format";
import type { LinkItem } from "@/lib/links";
import { getTimeSeries, summaryOf } from "@/lib/stats-select";
import { getStatusMeta } from "@/lib/status";
import { lineChart, toMarkdownImage } from "@/lib/svg-chart";
import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  Toast,
  showToast,
} from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { useMemo } from "react";
import type { StatsExportFormat } from "spoo.me";

const EXPORT_FORMATS: StatsExportFormat[] = ["csv", "json", "xlsx", "xml"];
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

export function LinkAnalytics({ link }: { link: LinkItem }) {
  const alias = link.alias ?? link.id;
  const statsOptions = useMemo(
    () => ({
      urlId: link.id,
      groupBy: [
        "time",
        "country",
        "browser",
        "os",
        "referrer",
        "city",
      ] as const,
      startDate: new Date(Date.now() - WINDOW_DAYS * DAY_MS)
        .toISOString()
        .slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    }),
    [link.id],
  );
  const { stats, isLoading } = useStats(statsOptions);

  const summary = summaryOf(stats);
  const trendPoints = getTimeSeries(stats, "clicks").map((p) => ({
    label: shortDate(p.time),
    value: p.value,
  }));
  const destinationHost = link.long_url ? safeHostname(link.long_url) : null;

  const sections: string[] = [`# ${alias}`];
  if (trendPoints.length > 1) {
    sections.push(
      "",
      toMarkdownImage(
        lineChart(trendPoints, {
          accent: "#5B7FFF",
          yFormatter: (v) => formatClicks(Math.round(v)),
        }),
        "Daily clicks",
      ),
    );
  }
  const breakdowns = renderStatsSections(stats);
  if (breakdowns) sections.push("", breakdowns);
  const markdown = sections.join("\n");

  const handleExport = async (format: StatsExportFormat) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Exporting as ${format.toUpperCase()}…`,
    });
    try {
      const file = await withAuthRetry(() =>
        getSpooClient().stats.exportForLink(
          link.id,
          {
            startDate: statsOptions.startDate,
            endDate: statsOptions.endDate,
          },
          format,
        ),
      );
      // csv exports arrive as a ZIP archive; trust the server's filename.
      const filename = file.filename;
      const path = join(homedir(), "Downloads", filename);
      const buffer = Buffer.from(await file.data.arrayBuffer());
      await writeFile(path, buffer);
      const size = (file.data.size / 1024).toFixed(1);
      toast.style = Toast.Style.Success;
      toast.title = "Saved to Downloads";
      toast.message = `${filename} (${size} KB)`;
    } catch (err) {
      toast.hide();
      await reportError(err);
    }
  };

  const status = getStatusMeta(link.status);

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={`Analytics · ${alias}`}
      metadata={
        <Detail.Metadata>
          {link.long_url && destinationHost ? (
            <Detail.Metadata.Label
              title="Site"
              icon={getFavicon(link.long_url, { fallback: Icon.Globe })}
              text={destinationHost}
            />
          ) : null}
          <Detail.Metadata.Link
            title="Short URL"
            target={link.short_url}
            text={link.short_url}
          />
          {link.long_url ? (
            <Detail.Metadata.Link
              title="Long URL"
              target={link.long_url}
              text={link.long_url}
            />
          ) : null}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Status"
            icon={{ source: status.icon, tintColor: status.tintColor }}
            text={status.label}
          />
          <Detail.Metadata.Label
            title="Clicks · 30d"
            text={formatClicks(summary.total_clicks)}
            icon={Icon.Eye}
          />
          <Detail.Metadata.Label
            title="Unique · 30d"
            text={formatClicks(summary.unique_clicks)}
            icon={Icon.Person}
          />
          <Detail.Metadata.Separator />
          {link.created_at ? (
            <Detail.Metadata.Label
              title="Created"
              text={formatRelative(link.created_at)}
            />
          ) : null}
          {link.last_click ? (
            <Detail.Metadata.Label
              title="Last click"
              text={formatRelative(link.last_click)}
            />
          ) : null}
          {link.expire_after ? (
            <Detail.Metadata.Label
              title="Expires"
              text={formatRelative(link.expire_after)}
              icon={Icon.Clock}
            />
          ) : null}
          {link.max_clicks ? (
            <Detail.Metadata.Label
              title="Max clicks"
              text={`${link.total_clicks ?? 0} / ${link.max_clicks}`}
            />
          ) : null}
          <Detail.Metadata.TagList title="Flags">
            {link.password_set ? (
              <Detail.Metadata.TagList.Item
                text="Password"
                color={Color.Yellow}
                icon={Icon.Lock}
              />
            ) : null}
            {link.block_bots ? (
              <Detail.Metadata.TagList.Item
                text="Block bots"
                color={Color.Purple}
              />
            ) : null}
            {link.private_stats ? (
              <Detail.Metadata.TagList.Item
                text="Private stats"
                color={Color.Blue}
              />
            ) : null}
          </Detail.Metadata.TagList>
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open Short URL" url={link.short_url} />
          <Action.CopyToClipboard
            title="Copy Short URL"
            content={link.short_url}
          />
          <ActionPanel.Submenu title="Export" icon={Icon.Download}>
            {EXPORT_FORMATS.map((format) => (
              <Action
                key={format}
                title={format.toUpperCase()}
                onAction={() => handleExport(format)}
              />
            ))}
          </ActionPanel.Submenu>
        </ActionPanel>
      }
    />
  );
}

function shortDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate.slice(5, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
