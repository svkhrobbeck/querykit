import { createQuery, type QueryConfig } from "./query";
import { createFilters, f as rawF } from "./filters";
import { mapMeta, mapInfiniteMeta, mapCursorMeta } from "./meta";
import { defineListSchema, type ListSchema } from "./schema";
import { decodeSort, readListParams, type UrlConfig } from "./url";
import type { AdapterName, WithFor } from "./adapter";
import type {
  CursorMeta,
  CursorParams,
  CursorPayload,
  FieldKey,
  Filter,
  InfiniteMeta,
  InfiniteParams,
  InfinitePayload,
  ListParams,
  ListPayload,
  Meta,
  Params,
  QueryPayload,
  RawCursorMeta,
  RawInfiniteMeta,
  RawMeta,
  Sort,
  SortDirection,
  SortInput,
} from "./types";

/* ---------------- resource inputs: entity-typed, adapter-aware `with` ------ */

export type ResourceListParams<T, A extends AdapterName> = Omit<ListParams<T>, "with"> & { with?: WithFor<A> };
export type ResourceInfiniteParams<T, A extends AdapterName> = Omit<InfiniteParams<T>, "with"> & { with?: WithFor<A> };
export type ResourceCursorParams<T, A extends AdapterName> = Omit<CursorParams<T>, "with"> & { with?: WithFor<A> };
export type ResourceParams<T, A extends AdapterName> = Omit<Params<T>, "with"> & { with?: WithFor<A> };

/* ---------------------------- responses / results ------------------------- */

interface RawResponse<T, M> {
  data?: T[];
  meta?: M | null;
}
export interface ListResult<T> {
  data: T[];
  meta: Meta;
}
export interface InfiniteResult<T> {
  data: T[];
  meta: InfiniteMeta;
}
export interface CursorResult<T> {
  data: T[];
  meta: CursorMeta;
}

/* -------------------------------- query keys ------------------------------ */

export interface ResourceKeys {
  all: readonly unknown[];
  list(payload: unknown): readonly unknown[];
  infinite(payload: unknown): readonly unknown[];
  cursor(payload: unknown): readonly unknown[];
  detail(id: unknown): readonly unknown[];
}

/* -------------------------------- resource -------------------------------- */

export interface Resource<T, A extends AdapterName> {
  /** Build an offset (page) payload. */
  list(input?: ResourceListParams<T, A>): ListPayload;
  /** Build an infinite (limit/offset) payload. */
  infinite(input?: ResourceInfiniteParams<T, A>): InfinitePayload;
  /** Build a cursor (keyset) payload. */
  cursor(input?: ResourceCursorParams<T, A>): CursorPayload;
  /** Build a paginationless payload (filter/sort/columns/with). */
  params(input?: ResourceParams<T, A>): QueryPayload;
  /** Filter builder typed to `T`'s fields. */
  f: ReturnType<typeof createFilters<T>>;
  /** Search preset — OR of `contains` across `fields` (e.g. one input → many columns). */
  search(term: string, fields: FieldKey<T>[]): Filter<T>;
  /** Declare a URL↔filter schema (identity helper). */
  schema<S extends ListSchema>(s: S): S;
  /** Build a list payload from URL search params (SSR — the non-hook `useListParams`). */
  fromSearchParams(searchParams: URLSearchParams, options: { schema: ListSchema; url?: UrlConfig; with?: WithFor<A> }): ListPayload;
  /** Stable query keys for TanStack/SWR caches. */
  keys: ResourceKeys;
  /** Map a list response's meta to camelCase (`data` typed to `T`). */
  parseList(raw?: RawResponse<T, RawMeta> | null): ListResult<T>;
  parseInfinite(raw?: RawResponse<T, RawInfiniteMeta> | null): InfiniteResult<T>;
  parseCursor(raw?: RawResponse<T, RawCursorMeta> | null): CursorResult<T>;
}

/* -------------------------------- registry -------------------------------- */

export interface RegistryDefaults {
  /** `list` page size. */
  perPage?: number;
  /** `infinite` + `cursor` page size. */
  limit?: number;
  /** `list`/`infinite` sort (`"-createdAt"` or `{name,direction}`). */
  sort?: SortInput;
  /** Cursor-only defaults. */
  cursor?: { order?: SortDirection };
}

export interface RegistryConfig<A extends AdapterName> {
  adapter: A;
  defaults?: RegistryDefaults;
  /** Drop empty filter values built from form inputs (default `true`). */
  pruneEmpty?: boolean;
}

export interface Registry<A extends AdapterName> {
  readonly adapter: A;
  /** Entity-typed builders + filters + schema + keys + parsers. `name` = cache-key namespace (required, must be unique). */
  resource<T>(name: string): Resource<T, A>;
  /** Registry-level meta parsing (entity-agnostic — `data: unknown[]`). */
  parseList(raw?: RawResponse<unknown, RawMeta> | null): ListResult<unknown>;
  parseInfinite(raw?: RawResponse<unknown, RawInfiniteMeta> | null): InfiniteResult<unknown>;
  parseCursor(raw?: RawResponse<unknown, RawCursorMeta> | null): CursorResult<unknown>;
}

/**
 * Create a web query registry — configure defaults + backend adapter once, then
 * `registry.resource<T>()` yields entity-typed, adapter-aware query builders,
 * filters, a URL↔filter schema, cache keys and meta parsers.
 *
 * @example
 * ```ts
 * export const qk = createRegistry({ adapter: "mongoose", defaults: { perPage: 20, sort: "-createdAt" } });
 * const users = qk.resource<IUser>("users");
 * const body = users.list({ filter: users.f.eq("status", "active"), page });
 * ```
 */
export function createRegistry<A extends AdapterName>(config: RegistryConfig<A>): Registry<A> {
  const defaults = config.defaults ?? {};
  const sort: Sort | undefined = typeof defaults.sort === "string" ? decodeSort(defaults.sort) : defaults.sort;
  const cursorOrder: SortDirection = defaults.cursor?.order ?? "asc";

  // Only set keys that are provided — createQuery merges over its own defaults,
  // and passing `undefined` would clobber them.
  const qcfg: QueryConfig = {};
  if (defaults.perPage !== undefined) qcfg.defaultPerPage = defaults.perPage;
  if (defaults.limit !== undefined) qcfg.defaultLimit = defaults.limit;
  if (sort?.name) qcfg.defaultSort = sort; // only override when a real sort field is given
  if (config.pruneEmpty !== undefined) qcfg.pruneEmpty = config.pruneEmpty;
  const q = createQuery(qcfg);

  const parseList = (raw?: RawResponse<unknown, RawMeta> | null): ListResult<unknown> => ({ data: raw?.data ?? [], meta: mapMeta(raw?.meta) });
  const parseInfinite = (raw?: RawResponse<unknown, RawInfiniteMeta> | null): InfiniteResult<unknown> => ({
    data: raw?.data ?? [],
    meta: mapInfiniteMeta(raw?.meta),
  });
  const parseCursor = (raw?: RawResponse<unknown, RawCursorMeta> | null): CursorResult<unknown> => ({
    data: raw?.data ?? [],
    meta: mapCursorMeta(raw?.meta),
  });

  function resource<T>(name: string): Resource<T, A> {
    const f = createFilters<T>();
    const keys: ResourceKeys = {
      all: [name],
      list: p => [name, "list", p],
      infinite: p => [name, "infinite", p],
      cursor: p => [name, "cursor", p],
      detail: id => [name, "detail", id],
    };
    return {
      list: input => q.list(input as unknown as ListParams) as unknown as ListPayload,
      infinite: input => q.infinite(input as unknown as InfiniteParams) as unknown as InfinitePayload,
      cursor: input => q.cursor({ ...(input as unknown as CursorParams), order: input?.order ?? cursorOrder }) as unknown as CursorPayload,
      params: input => q.params(input as unknown as Params) as unknown as QueryPayload,
      f,
      search: (term, fields) => rawF.or(...fields.map(field => rawF.contains(field, term))) as unknown as Filter<T>,
      schema: s => defineListSchema(s),
      fromSearchParams: (searchParams, options) =>
        q.list({ ...readListParams(options.schema, searchParams, options.url), with: options.with } as unknown as ListParams) as unknown as ListPayload,
      keys,
      parseList: raw => parseList(raw) as ListResult<T>,
      parseInfinite: raw => parseInfinite(raw) as InfiniteResult<T>,
      parseCursor: raw => parseCursor(raw) as CursorResult<T>,
    };
  }

  return { adapter: config.adapter, resource, parseList, parseInfinite, parseCursor };
}
