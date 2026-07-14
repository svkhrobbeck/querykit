/**
 * `@querykit/core` — ORM-agnostik query DSL tiplari. Backend adapterlar
 * (`@querykit/drizzle-pg`) va frontend (`@querykit/web`) shu bir xil kontraktga
 * tayanadi. Tiplar ustun-kaliti (`TKey`) bo'yicha generic; adapterlar uni o'z
 * kalit tipiga (Drizzle jadval ustuni yoki entity maydoni) ixtisoslashtiradi.
 */
import { FILTER_OPERATORS } from "./operators";

/** Qo'llab-quvvatlanadigan filter operatorlari (token va nom aliaslari). */
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type FilterScalar = string | number | boolean | Date | null;
export type FilterValue = FilterScalar | FilterScalar[];

/** Bitta maydon sharti (`operation` default `"="`). */
export interface FieldCondition<TKey extends string = string> {
  key: TKey;
  operation?: FilterOperator;
  value?: FilterValue;
}

export interface AndGroup<TKey extends string = string, TRaw = never> {
  and: FilterNode<TKey, TRaw>[];
}
export interface OrGroup<TKey extends string = string, TRaw = never> {
  or: FilterNode<TKey, TRaw>[];
}
export interface NotGroup<TKey extends string = string, TRaw = never> {
  not: FilterNode<TKey, TRaw>;
}

/**
 * Filter daraxti tuguni: maydon sharti, mantiqiy guruh, yoki adapter qo'shadigan
 * raw escape-hatch (`TRaw`, masalan Drizzle `SQL`; default `never`).
 */
export type FilterNode<TKey extends string = string, TRaw = never> =
  FieldCondition<TKey> | AndGroup<TKey, TRaw> | OrGroup<TKey, TRaw> | NotGroup<TKey, TRaw> | TRaw;

/** Public filter: daraxt/tugun yoki flat massiv (implicit AND). */
export type Filter<TKey extends string = string, TRaw = never> = FilterNode<TKey, TRaw> | FieldCondition<TKey>[];

export type SortDirection = "asc" | "desc";

/* --------------------- wire meta (server javobi, snake) ------------------- */
/* Adapterlar shu shakllarni qaytaradi; frontend ularni camelCase'ga map qiladi. */

/** Offset (sahifali) paginatsiya meta'si. */
export interface OffsetMeta {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
}

/** Infinite-scroll paginatsiya meta'si. */
export interface InfiniteMeta {
  limit: number;
  offset: number;
  count: number;
  has_more: boolean;
  next_offset: number | null;
}

/** Cursor (keyset) paginatsiya meta'si. */
export interface CursorMeta {
  limit: number;
  has_next: boolean;
  has_prev: boolean;
  next_cursor: string | null;
  prev_cursor: string | null;
}
