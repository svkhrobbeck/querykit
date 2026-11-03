/**
 * `@querykitjs/tanstack-query` — ready TanStack Query options from a querykit
 * `resource`: the query key (`resource.keys`), the fetch through your own
 * `fetcher`, the meta parsing (`resource.parse*`) and the page params. Plain
 * option objects, no hooks, so one call works with React, Vue, Solid and
 * Svelte Query and with `queryClient.fetchQuery` alike.
 */
import type {
  AdapterName,
  CursorPayload,
  CursorResult,
  InfinitePayload,
  InfiniteResult,
  ListPayload,
  ListResult,
  Resource,
  ResourceCursorParams,
  ResourceInfiniteParams,
  ResourceListParams,
} from "@querykitjs/web";
import type { QueryFunctionContext } from "@tanstack/query-core";

/** Which edge an infinite query is fetching; query-core sets it on the context but does not export the type. */
type FetchDirection = "forward" | "backward";

/** Sends one request: your HTTP client, your base URL, your auth. Pass `signal` on so TanStack can cancel it. */
export type Fetcher<P, R> = (payload: P, ctx: { signal: AbortSignal }) => Promise<R>;

/** The raw server body each `resource.parse*` accepts. */
export type RawList<T, A extends AdapterName> = Parameters<Resource<T, A>["parseList"]>[0];
export type RawInfinite<T, A extends AdapterName> = Parameters<Resource<T, A>["parseInfinite"]>[0];
export type RawCursor<T, A extends AdapterName> = Parameters<Resource<T, A>["parseCursor"]>[0];

type Key = readonly unknown[];

export interface ListQueryOptions<T> {
  queryKey: Key;
  queryFn: (ctx: QueryFunctionContext<Key>) => Promise<ListResult<T>>;
}

export interface InfiniteQueryOptions<T> {
  queryKey: Key;
  queryFn: (ctx: QueryFunctionContext<Key, number>) => Promise<InfiniteResult<T>>;
  initialPageParam: number;
  getNextPageParam: (lastPage: InfiniteResult<T>) => number | undefined;
}

export interface CursorQueryOptions<T> {
  queryKey: Key;
  queryFn: (ctx: QueryFunctionContext<Key, string | null>) => Promise<CursorResult<T>>;
  initialPageParam: string | null;
  getNextPageParam: (lastPage: CursorResult<T>) => string | undefined;
  getPreviousPageParam: (firstPage: CursorResult<T>) => string | undefined;
}

export interface DetailQueryOptions<R> {
  queryKey: Key;
  queryFn: (ctx: QueryFunctionContext<Key>) => Promise<R>;
}

/**
 * An offset (page) query. `input` is what `resource.list()` takes — or a payload
 * `useListParams` already built.
 *
 * @example
 * ```ts
 * const { data } = useQuery(listOptions(users, { page: 2 }, (body, { signal }) => api.post("/users/list", body, { signal }).then(r => r.data)));
 * ```
 */
export function listOptions<T, A extends AdapterName>(
  resource: Resource<T, A>,
  input: ResourceListParams<T, A> | ListPayload | undefined,
  fetcher: Fetcher<ListPayload, RawList<T, A>>,
): ListQueryOptions<T> {
  const payload = resource.list(input as ResourceListParams<T, A> | undefined);
  return {
    queryKey: resource.keys.list(payload),
    queryFn: async ({ signal }) => resource.parseList(await fetcher(payload, { signal })),
  };
}

/**
 * An infinite (limit / offset) query for `useInfiniteQuery`. The key leaves
 * `offset` out — it is the page param — so every page lands in one cache entry.
 */
export function infiniteOptions<T, A extends AdapterName>(
  resource: Resource<T, A>,
  input: ResourceInfiniteParams<T, A> | InfinitePayload | undefined,
  fetcher: Fetcher<InfinitePayload, RawInfinite<T, A>>,
): InfiniteQueryOptions<T> {
  const { offset, ...keyed } = resource.infinite(input as ResourceInfiniteParams<T, A> | undefined);
  return {
    queryKey: resource.keys.infinite(keyed),
    queryFn: async ({ signal, pageParam }) => resource.parseInfinite(await fetcher({ ...keyed, offset: pageParam }, { signal })),
    initialPageParam: offset,
    getNextPageParam: last => last.meta.nextOffset ?? undefined,
  };
}

/**
 * A cursor (keyset) query for `useInfiniteQuery`, both ways: `fetchNextPage`
 * follows `nextCursor`, `fetchPreviousPage` follows `prevCursor` with
 * `direction: "backward"`. The key leaves `cursor` out — it is the page param.
 */
export function cursorOptions<T, A extends AdapterName>(
  resource: Resource<T, A>,
  input: ResourceCursorParams<T, A> | CursorPayload | undefined,
  fetcher: Fetcher<CursorPayload, RawCursor<T, A>>,
): CursorQueryOptions<T> {
  const { cursor, ...keyed } = resource.cursor(input as ResourceCursorParams<T, A> | undefined);
  // TanStack's `direction` says which edge is being fetched; v5 marks it deprecated but still sets it
  const pageDirection = (ctx: { direction?: FetchDirection }): CursorPayload["direction"] => (ctx.direction === "backward" ? "backward" : keyed.direction);
  return {
    queryKey: resource.keys.cursor(keyed),
    queryFn: async ctx =>
      resource.parseCursor(
        await fetcher({ ...keyed, cursor: ctx.pageParam, direction: pageDirection(ctx as { direction?: FetchDirection }) }, { signal: ctx.signal }),
      ),
    initialPageParam: cursor,
    getNextPageParam: last => last.meta.nextCursor ?? undefined,
    getPreviousPageParam: first => first.meta.prevCursor ?? undefined,
  };
}

/** One record: `resource.keys.detail(id)`; the fetcher's result is the data as it is. */
export function detailOptions<T, A extends AdapterName, R = T>(
  resource: Resource<T, A>,
  id: string | number,
  fetcher: Fetcher<string | number, R>,
): DetailQueryOptions<R> {
  return {
    queryKey: resource.keys.detail(id),
    queryFn: ({ signal }) => fetcher(id, { signal }),
  };
}
