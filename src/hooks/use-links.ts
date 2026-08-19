import { getSpooClient, withAuthRetry } from "@/api/spoo";
import { CACHE_KEYS, CACHE_TTL } from "@/constants";
import { readCached, writeCached } from "@/lib/cache";
import {
  type LinkItem,
  type LinkStatus,
  type LinksSnapshot,
  toLinkItem,
} from "@/lib/links";
import { useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";

export type SortField = "created_at" | "last_click" | "total_clicks";
export type SortOrder = "ascending" | "descending";

export interface ListLinksQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LinkStatus;
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

interface UseLinksResult {
  links: LinkItem[];
  total: number;
  hasNext: boolean;
  isLoading: boolean;
  error: Error | undefined;
  revalidate: () => void;
  mutate: (
    updater: Promise<unknown>,
    opts?: {
      optimisticUpdate?: (current: LinksSnapshot | undefined) => LinksSnapshot;
      rollbackOnError?: boolean;
    },
  ) => Promise<unknown>;
}

function getInitialData(): LinksSnapshot | undefined {
  return readCached<LinksSnapshot>(CACHE_KEYS.links, CACHE_TTL.links);
}

/** Only include the filter when something is actually set. */
function buildFilter(query: ListLinksQuery) {
  if (!query.search && !query.status) return undefined;
  return {
    ...(query.search ? { search: query.search } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
}

async function fetchLinks(query: ListLinksQuery): Promise<LinksSnapshot> {
  const spoo = getSpooClient();
  const page = await withAuthRetry(() =>
    spoo.links.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 50,
      sortBy: query.sortBy ?? "created_at",
      sortOrder: query.sortOrder ?? "descending",
      filter: buildFilter(query),
    }),
  );
  // Plain DTO at the cache boundary: never let the SDK's Page (methods) or
  // Date instances hit JSON serialization in Cache/useCachedPromise.
  const snapshot: LinksSnapshot = {
    items: page.items.map(toLinkItem),
    total: page.total,
    hasNext: page.hasNextPage(),
  };
  // Only persist the baseline query (unfiltered first page, default sort and
  // size) to shared cache so other commands read a consistent snapshot; the
  // dashboard's total_clicks/100 query must not overwrite it.
  const isBaseline =
    !query.search &&
    !query.status &&
    (query.page ?? 1) === 1 &&
    (query.pageSize ?? 50) === 50 &&
    (query.sortBy ?? "created_at") === "created_at" &&
    (query.sortOrder ?? "descending") === "descending";
  if (isBaseline) {
    writeCached(CACHE_KEYS.links, snapshot);
  }
  return snapshot;
}

export function useLinks(query: ListLinksQuery = {}): UseLinksResult {
  const key = useMemo(() => JSON.stringify(query), [query]);
  const { data, isLoading, error, revalidate, mutate } = useCachedPromise(
    async (serialized: string) =>
      fetchLinks(JSON.parse(serialized) as ListLinksQuery),
    [key],
    {
      initialData: getInitialData(),
      keepPreviousData: true,
    },
  );

  return {
    links: data?.items ?? [],
    total: data?.total ?? 0,
    hasNext: data?.hasNext ?? false,
    isLoading,
    error,
    revalidate,
    mutate,
  };
}
