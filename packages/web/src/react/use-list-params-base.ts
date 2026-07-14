import { useCallback, useMemo } from "react";

import type { AdapterName, WithFor } from "../adapter";
import type { Resource, ResourceListParams } from "../registry";
import type { ListSchema } from "../schema";
import type { ListPayload, SortInput } from "../types";
import type { UrlConfig } from "../url";
import { readListParams, resetParams, setPage, setParam, setSize, setSort } from "../url";

export interface UseListParamsBaseOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). Memoize it. */
  schema: ListSchema;
  /** Current URL search params (from your router). */
  searchParams: URLSearchParams;
  /** Apply new search params (`(next) => void`). */
  setSearchParams: (next: URLSearchParams) => void;
  /** URL param names (page/size/sortType) — optional. Memoize it. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

export interface UseListParamsResult {
  /** Ready-to-send list payload (built from the URL via the resource's defaults). */
  params: ListPayload;
  searchParams: URLSearchParams;
  /** Set/clear a filter param (resets `page`). */
  setParam: (name: string, value: string | null | undefined) => void;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
  setSort: (sort: SortInput) => void;
  reset: (keep?: string[]) => void;
}

/**
 * Router-agnostic list URL-state hook. Reads the URL via the schema, builds a
 * ready-to-send payload through the `resource` (registry defaults + adapter), and
 * returns URL setters (filter/sort/size changes reset `page`). Bring your own
 * `searchParams`/`setSearchParams` (Next.js, TanStack Router, …).
 */
export function useListParamsBase<T, A extends AdapterName>(resource: Resource<T, A>, options: UseListParamsBaseOptions<A>): UseListParamsResult {
  const { schema, searchParams, setSearchParams, url, with: withRel } = options;

  const params = useMemo(
    () => resource.list({ ...readListParams(schema, searchParams, url), with: withRel } as ResourceListParams<T, A>),
    [resource, schema, searchParams, url, withRel],
  );

  return {
    params,
    searchParams,
    setParam: useCallback((name, value) => setSearchParams(setParam(searchParams, name, value, url)), [searchParams, setSearchParams, url]),
    setPage: useCallback((page: number) => setSearchParams(setPage(searchParams, page, url)), [searchParams, setSearchParams, url]),
    setSize: useCallback((size: number) => setSearchParams(setSize(searchParams, size, url)), [searchParams, setSearchParams, url]),
    setSort: useCallback((sort: SortInput) => setSearchParams(setSort(searchParams, sort, url)), [searchParams, setSearchParams, url]),
    reset: useCallback((keep?: string[]) => setSearchParams(resetParams(searchParams, keep)), [searchParams, setSearchParams]),
  };
}
