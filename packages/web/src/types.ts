/**
 * Filter/query DSL tiplari — `@querykit/core`dan, entity maydoni (`FieldKey`)
 * bilan ixtisoslashtirilgan. querykit backend (`@querykit/drizzle-pg`) qabul
 * qiladigan wire-format bilan mos (`{key, operation, value}`).
 */
import type * as Core from "@querykit/core";

export type FilterOperator = Core.FilterOperator;
export type FilterScalar = Core.FilterScalar;
export type FilterValue = Core.FilterValue;

/** Entity ustun (maydon) kaliti. */
export type FieldKey<T> = Extract<keyof T, string>;

/** Bitta maydon sharti (`operation` default `"="`). */
export type FieldCondition<T = Record<string, unknown>> = Core.FieldCondition<FieldKey<T>>;
export type AndGroup<T = Record<string, unknown>> = Core.AndGroup<FieldKey<T>>;
export type OrGroup<T = Record<string, unknown>> = Core.OrGroup<FieldKey<T>>;
export type NotGroup<T = Record<string, unknown>> = Core.NotGroup<FieldKey<T>>;

/** Filter daraxti tuguni: shart yoki mantiqiy guruh. */
export type FilterNode<T = Record<string, unknown>> = Core.FilterNode<FieldKey<T>>;

/**
 * Public filter: daraxt/tugun yoki flat massiv. Flat massiv implicit `AND` va
 * legacy backend (idistr) `IFilter[]` bilan to'liq mos.
 */
export type Filter<T = Record<string, unknown>> = Core.Filter<FieldKey<T>>;

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = Core.SortDirection;

export interface Sort {
  name?: string;
  direction?: SortDirection;
}

/** Sort kirishi: `"-createdAt"` (sortType string) yoki `{ name, direction }`. */
export type SortInput = string | Sort;

/* -------------------------------- params ---------------------------------- */

export interface Params<T = Record<string, unknown>> {
  filter?: Filter<T>;
  sort?: SortInput;
  columns?: Record<string, boolean>;
  /** Yuklanadigan relationlar (default `with` deb yuboriladi). */
  with?: Record<string, unknown>;
  /** Soft-delete qilingan qatorlarni ham qo'shish (backend read'lari uchun). */
  withDeleted?: boolean;
}

/** Offset (sahifali) paginatsiya kirishi. */
export interface ListParams<T = Record<string, unknown>> extends Params<T> {
  page?: number;
  perPage?: number;
}

/** Infinite-scroll (limit + offset) paginatsiya kirishi. */
export interface InfiniteParams<T = Record<string, unknown>> extends Params<T> {
  limit?: number;
  offset?: number;
}

/** Cursor (keyset) paginatsiya kirishi. */
export interface CursorParams<T = Record<string, unknown>> extends Params<T> {
  limit?: number;
  cursor?: string | null;
  cursorKey?: string;
  order?: SortDirection;
  direction?: "forward" | "backward";
}

/** Normalizatsiya qilingan payload (default field nomlari bilan). */
export interface QueryPayload {
  filter: FilterNode | FieldCondition[];
  sort: Sort;
  columns: Record<string, boolean>;
  with: Record<string, unknown>;
}

export interface ListPayload extends QueryPayload {
  page: number;
  perPage: number;
}

export interface InfinitePayload extends QueryPayload {
  limit: number;
  offset: number;
}

/** Cursor payload — `sort` o'rniga `order`/`direction` boshqaradi. */
export interface CursorPayload {
  filter: FilterNode | FieldCondition[];
  columns: Record<string, boolean>;
  with: Record<string, unknown>;
  limit: number;
  cursor: string | null;
  order: SortDirection;
  direction: "forward" | "backward";
  cursorKey?: string;
}

/* --------------------------------- meta ----------------------------------- */
/* Har uch paginatsiya rejimi turli meta qaytaradi — alohida map qilinadi.     */

/**
 * Xom (server, snake_case) meta tiplari — `@querykit/core`dan (adapter shu
 * shaklda qaytaradi). Server ba'zi maydonlarni bermasligi mumkinligi uchun
 * mapper'lar `Partial` qabul qiladi.
 */
export type RawMeta = Partial<Core.OffsetMeta>;
export type RawInfiniteMeta = Partial<Core.InfiniteMeta>;
export type RawCursorMeta = Partial<Core.CursorMeta>;

/** Offset (list) — normalizatsiya qilingan meta (camelCase). */
export interface Meta {
  totalPages: number;
  totalCount: number;
  currentPage: number;
  perPage: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Infinite-scroll — normalizatsiya qilingan meta. */
export interface InfiniteMeta {
  limit: number;
  offset: number;
  count: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/** Cursor — normalizatsiya qilingan meta. */
export interface CursorMeta {
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}
