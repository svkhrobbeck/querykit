import { useCallback, useMemo } from "react";

import type { ListSchema } from "../schema";
import type { ListPayload, SortInput } from "../types";
import type { UrlConfig } from "../url";
import { resetParams, searchParamsToPayload, setPage, setParam, setSize, setSort } from "../url";

export interface UseListParamsOptions {
  /** Joriy URL search params (react-router `useSearchParams` yoki boshqa manba). */
  searchParams: URLSearchParams;
  /** Yangi search params'ni qo'llovchi setter (`(next) => void`). */
  setSearchParams: (next: URLSearchParams) => void;
  /** List filter schema'si ({@link defineListSchema}). Memoize qiling. */
  schema: ListSchema;
  /** URL param nomlari (page/size/sortType) — ixtiyoriy. Memoize qiling. */
  url?: UrlConfig;
}

export interface UseListParamsResult {
  /** Yuborishga tayyor normalizatsiyalangan payload. */
  params: ListPayload;
  searchParams: URLSearchParams;
  /** Filter param'ini o'rnatadi/o'chiradi (`page` reset). */
  setParam: (name: string, value: string | null | undefined) => void;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
  setSort: (sort: SortInput) => void;
  reset: (keep?: string[]) => void;
}

/**
 * List sahifasi uchun URL-state sync hook'i. `searchParams`ni tashqaridan oladi
 * (router-agnostik), schema'dan yuborishga tayyor `params` quradi va URL'ga
 * yozuvchi setter'lar beradi (filter/sort o'zgarsa `page` avtomatik reset).
 *
 * @example
 * ```tsx
 * const [searchParams, setSearchParams] = useSearchParams(); // react-router
 * const { params, setParam, setPage, setSort } = useListParams({
 *   searchParams, setSearchParams, schema: buyersSchema,
 * });
 * // params -> http.post("/buyers/list", params)
 * ```
 */
export function useListParams(options: UseListParamsOptions): UseListParamsResult {
  const { searchParams, setSearchParams, schema, url } = options;

  const params = useMemo(() => searchParamsToPayload(schema, searchParams, url), [schema, searchParams, url]);

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
