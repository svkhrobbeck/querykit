import type { AdapterName, WithFor } from "./adapter";
import type { Resource } from "./registry";
import type { ListSchema } from "./schema";
import type { ListPayload, SortInput } from "./types";
import type { UrlConfig } from "./url";
import { resetParams, setPage, setParam, setSize, setSort } from "./url";

export interface ListStateOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). */
  schema: ListSchema;
  /** URL param names (page/size/sortType) — optional. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

export interface ListStateRead {
  /** Ready-to-send list payload (built from the URL via the resource's defaults). */
  params: ListPayload;
  /** The URL's page or sort was past the limits and was clamped (`?page=9999` → the last allowed page). */
  clamped: boolean;
}

/** URL setters: each returns the NEXT search params and never mutates the given ones. */
export interface ListStateActions {
  /** Set/clear a filter param (resets `page`). */
  setParam: (name: string, value: string | null | undefined) => URLSearchParams;
  setPage: (page: number) => URLSearchParams;
  /** Resets `page`. */
  setSize: (size: number) => URLSearchParams;
  /** Resets `page`; an empty sort clears the param. */
  setSort: (sort: SortInput) => URLSearchParams;
  /** Clears every param except `keep`. */
  reset: (keep?: string[]) => URLSearchParams;
}

export interface ListState {
  read: (searchParams: URLSearchParams) => ListStateRead;
  actions: (searchParams: URLSearchParams) => ListStateActions;
}

/**
 * Framework-free list URL state — the logic behind `useListParams` in `@querykitjs/web/react`
 * and `@querykitjs/web/vue`, for any other framework (Svelte, Solid, vanilla). Pure: it reads
 * search params and returns the next ones; navigating is the caller's job.
 *
 * @example
 * ```ts
 * const list = createListState(users, { schema: usersSchema });
 * const { params, clamped } = list.read(new URLSearchParams(location.search));
 * history.pushState(null, "", `?${list.actions(new URLSearchParams(location.search)).setPage(2)}`);
 * ```
 */
export function createListState<T, A extends AdapterName>(resource: Resource<T, A>, options: ListStateOptions<A>): ListState {
  const { schema, url, with: withRel } = options;
  return {
    read(searchParams) {
      const params = resource.fromSearchParams(searchParams, { schema, url, with: withRel });
      return { params, clamped: params.clamped === true };
    },
    actions(searchParams) {
      return {
        setParam: (name, value) => setParam(searchParams, name, value, url),
        setPage: page => setPage(searchParams, page, url),
        setSize: size => setSize(searchParams, size, url),
        setSort: sort => setSort(searchParams, sort, url),
        reset: keep => resetParams(searchParams, keep),
      };
    },
  };
}
