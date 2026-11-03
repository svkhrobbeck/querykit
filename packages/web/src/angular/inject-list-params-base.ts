import { computed, type Signal } from "@angular/core";

import type { AdapterName, WithFor } from "../adapter";
import { createListState } from "../list-state";
import type { Resource } from "../registry";
import type { ListSchema } from "../schema";
import type { ListPayload, SortInput } from "../types";
import type { UrlConfig } from "../url";

export interface InjectListParamsBaseOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). */
  schema: ListSchema;
  /** Current URL search params as a signal (from your router). */
  searchParams: Signal<URLSearchParams>;
  /** Apply new search params (`(next) => void`). */
  setSearchParams: (next: URLSearchParams) => void;
  /** URL param names (page/size/sortType) — optional. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

export interface InjectListParamsResult {
  /** Ready-to-send list payload (built from the URL via the resource's defaults). */
  params: Signal<ListPayload>;
  /**
   * The URL's page or sort was past the limits and was clamped (`?page=9999` → the last
   * allowed page). The app may rewrite the URL (`setPage(params().page)`).
   */
  clamped: Signal<boolean>;
  searchParams: Signal<URLSearchParams>;
  /** Set/clear a filter param (resets `page`). */
  setParam: (name: string, value: string | null | undefined) => void;
  setPage: (page: number) => void;
  /** Resets `page`. */
  setSize: (size: number) => void;
  /** Resets `page`; an empty sort clears the param. */
  setSort: (sort: SortInput) => void;
  /** Clears every param except `keep`. */
  reset: (keep?: string[]) => void;
}

/**
 * Router-agnostic list URL state as signals — the Angular twin of the React and Vue
 * `useListParamsBase`: the same reads, clamping and setters. Bring your own
 * `searchParams` signal and `setSearchParams`.
 */
export function injectListParamsBase<T, A extends AdapterName>(resource: Resource<T, A>, options: InjectListParamsBaseOptions<A>): InjectListParamsResult {
  const { schema, searchParams, setSearchParams, url, with: withRel } = options;
  const state = createListState(resource, { schema, url, with: withRel });
  const read = computed(() => state.read(searchParams()));
  const actions = () => state.actions(searchParams());

  return {
    params: computed(() => read().params),
    clamped: computed(() => read().clamped),
    searchParams,
    setParam: (name, value) => setSearchParams(actions().setParam(name, value)),
    setPage: page => setSearchParams(actions().setPage(page)),
    setSize: size => setSearchParams(actions().setSize(size)),
    setSort: sort => setSearchParams(actions().setSort(sort)),
    reset: keep => setSearchParams(actions().reset(keep)),
  };
}
