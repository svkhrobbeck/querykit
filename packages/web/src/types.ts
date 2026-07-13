/**
 * Filter/query DSL tiplari — querykit backend (`@querykit/drizzle-pg`) qabul
 * qiladigan wire-format bilan mos (`{key, operation, value}`). Kelajakda
 * `@querykit/core`ga ajratiladi.
 */

/**
 * Qo'llab-quvvatlanadigan filter operatorlari — querykit backend bilan bir xil
 * to'plam (token va nom aliaslari).
 */
export type FilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "notLike"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "%_%" // contains
  | "%_" // startsWith
  | "_%" // endsWith
  | "in"
  | "notIn"
  | "between"
  | "notBetween"
  | "isNull"
  | "isNotNull";

export type FilterScalar = string | number | boolean | null;
export type FilterValue = FilterScalar | FilterScalar[] | Date;

/** Entity ustun (maydon) kaliti. */
export type FieldKey<T> = Extract<keyof T, string>;

/** Bitta maydon sharti (`operation` default `"="`). */
export interface FieldCondition<T = Record<string, unknown>> {
  key: FieldKey<T>;
  operation?: FilterOperator;
  value?: FilterValue;
}

export interface AndGroup<T = Record<string, unknown>> {
  and: FilterNode<T>[];
}
export interface OrGroup<T = Record<string, unknown>> {
  or: FilterNode<T>[];
}
export interface NotGroup<T = Record<string, unknown>> {
  not: FilterNode<T>;
}

/** Filter daraxti tuguni: shart yoki mantiqiy guruh. */
export type FilterNode<T = Record<string, unknown>> = FieldCondition<T> | AndGroup<T> | OrGroup<T> | NotGroup<T>;

/**
 * Public filter: daraxt/tugun yoki flat massiv. Flat massiv implicit `AND` va
 * legacy backend (idistr) `IFilter[]` bilan to'liq mos.
 */
export type Filter<T = Record<string, unknown>> = FilterNode<T> | FieldCondition<T>[];

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = "asc" | "desc";

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
  per_page: number;
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

/** Offset (list) — xom meta (snake_case). */
export interface RawMeta {
  total_pages?: number;
  total_items?: number;
  current_page?: number;
  per_page?: number;
  has_next?: boolean;
  has_prev?: boolean;
}

/** Offset (list) — normalizatsiya qilingan meta (camelCase). */
export interface Meta {
  totalPages: number;
  totalCount: number;
  currentPage: number;
  perPage: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Infinite-scroll — xom meta. */
export interface RawInfiniteMeta {
  limit?: number;
  offset?: number;
  count?: number;
  has_more?: boolean;
  next_offset?: number | null;
}

/** Infinite-scroll — normalizatsiya qilingan meta. */
export interface InfiniteMeta {
  limit: number;
  offset: number;
  count: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/** Cursor — xom meta. */
export interface RawCursorMeta {
  limit?: number;
  has_next?: boolean;
  has_prev?: boolean;
  next_cursor?: string | null;
  prev_cursor?: string | null;
}

/** Cursor — normalizatsiya qilingan meta. */
export interface CursorMeta {
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}
