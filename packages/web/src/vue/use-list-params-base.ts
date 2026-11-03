import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from "vue";

import type { AdapterName, WithFor } from "../adapter";
import { createListState } from "../list-state";
import type { Resource } from "../registry";
import type { ListSchema } from "../schema";
import type { ListPayload, SortInput } from "../types";
import type { UrlConfig } from "../url";

export interface UseListParamsBaseOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). */
  schema: ListSchema;
  /** Current URL search params — a ref, a getter or a plain value (from your router). */
  searchParams: MaybeRefOrGetter<URLSearchParams>;
  /** Apply new search params (`(next) => void`). */
  setSearchParams: (next: URLSearchParams) => void;
  /** URL param names (page/size/sortType) — optional. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

export interface UseListParamsResult {
  /** Ready-to-send list payload (built from the URL via the resource's defaults). */
  params: ComputedRef<ListPayload>;
  /**
   * The URL's page or sort was past the limits and was clamped (`?page=9999` → the last
   * allowed page). The app may rewrite the URL (`setPage(params.value.page)`).
   */
  clamped: ComputedRef<boolean>;
  searchParams: ComputedRef<URLSearchParams>;
  /** Set/clear a filter param (resets `page`). */
  setParam: (name: string, value: string | null | undefined) => void;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
  setSort: (sort: SortInput) => void;
  reset: (keep?: string[]) => void;
}

/**
 * Router-agnostic list URL-state composable — the Vue twin of the React
 * `useListParamsBase`: the same reads, clamping and setters, as computed refs. Bring your
 * own `searchParams`/`setSearchParams` (Nuxt `useRoute`, a custom router, …).
 */
export function useListParamsBase<T, A extends AdapterName>(resource: Resource<T, A>, options: UseListParamsBaseOptions<A>): UseListParamsResult {
  const { schema, setSearchParams, url, with: withRel } = options;
  const state = createListState(resource, { schema, url, with: withRel });
  const searchParams = computed(() => toValue(options.searchParams));
  const read = computed(() => state.read(searchParams.value));
  const actions = () => state.actions(searchParams.value);

  return {
    params: computed(() => read.value.params),
    clamped: computed(() => read.value.clamped),
    searchParams,
    setParam: (name, value) => setSearchParams(actions().setParam(name, value)),
    setPage: page => setSearchParams(actions().setPage(page)),
    setSize: size => setSearchParams(actions().setSize(size)),
    setSort: sort => setSearchParams(actions().setSort(sort)),
    reset: keep => setSearchParams(actions().reset(keep)),
  };
}
