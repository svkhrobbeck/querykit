/**
 * `@querykitjs/core` — ORM-agnostik query DSL tiplari. Backend adapterlar
 * (`@querykitjs/drizzle-pg`) va frontend (`@querykitjs/web`) shu bir xil kontraktga
 * tayanadi. Tiplar ustun-kaliti (`TKey`) bo'yicha generic; adapterlar uni o'z
 * kalit tipiga (Drizzle jadval ustuni yoki entity maydoni) ixtisoslashtiradi.
 */
import { FILTER_OPERATORS } from "./operators";

/** Qo'llab-quvvatlanadigan filter operatorlari (token va nom aliaslari). */
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/**
 * Tiplangan kalit, lekin har qanday `string` ham qabul qilinadi. Wire (JSON) har
 * doim string-keyed keladi va adapterlar noma'lum kalitni baribir skip qiladi —
 * tip shunchaki haqiqatni aytsin, route'da `as` cast kerak bo'lmasin.
 *
 * `(string & {})` — autocomplete'ni saqlaydigan TS trick'i: IDE `TKey`
 * variantlarini taklif qiladi, boshqa string esa xato bermaydi.
 */
export type LooseKey<TKey extends string> = TKey | (string & {});

/**
 * A filter scalar. `Date` is accepted **in-memory** (adapters cast it for local
 * queries); over the JSON wire it serializes to an ISO string, so
 * `@querykitjs/zod` validates scalars **without** `Date` (string/number/boolean/null).
 */
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

/** One sort field — `{ key, direction }`. */
export interface SortItem<TKey extends string = string> {
  key: TKey;
  direction?: SortDirection;
}

/** Sort is **always an array** of {@link SortItem} (multi-field capable). */
export type Sort<TKey extends string = string> = SortItem<TKey>[];

/* ---------------------- shared param building blocks ---------------------- */
/* Generic shapes shared by every backend adapter (drizzle-pg, mongoose, …);
 * each binds its own key type (`ColumnKey`/`FieldKey`) and insert/filter types. */

/** Equality scope applied to every operation of a scoped repository. */
export type Scope<TKey extends string = string> = Partial<Record<TKey, FilterScalar>>;

/** Options for upsert / upsertMany — conflict target(s) + optional update set. */
export interface UpsertOptions<TKey extends string = string, TInsert = Record<string, unknown>> {
  /** Unique/conflict key(s) whose match triggers an update instead of an insert. */
  target: TKey | TKey[];
  /** Columns/fields to update on conflict. Defaults to the inserted values minus `target`. */
  set?: Partial<TInsert>;
}

/** Aggregate query spec — group + count/sum/avg/min/max, each keyed by field. */
export interface AggregateSpec<TKey extends string = string, TFilter = unknown> {
  filter?: TFilter;
  /** Group rows by these field(s); each appears in the output rows. */
  groupBy?: TKey | TKey[];
  count?: boolean;
  sum?: TKey | TKey[];
  avg?: TKey | TKey[];
  min?: TKey | TKey[];
  max?: TKey | TKey[];
  withDeleted?: boolean;
}

/* ----------------------------- wire params -------------------------------- */
/* Client JSON body'sida keladigan shakl: string-keyed va `Date`siz (`FilterScalar`
 * `Date`ni o'z ichiga oladi — u faqat in-memory chaqiruvlar uchun). `@querykitjs/zod`
 * chiqishi shu tiplarga mos, adapterlar esa ularni `LooseKey` orqali qabul qiladi.
 * Shu bilan halqa core orqali yopiladi — zod backendni, backend zod'ni ko'rmaydi. */

/** Paginatsiyasiz umumiy wire params. */
export interface WireBaseParams {
  filter?: Filter;
  sort?: Sort;
  columns?: Record<string, boolean>;
  with?: Record<string, unknown>;
  withDeleted?: boolean;
}

/** Offset (sahifali) wire params. */
export interface WireOffsetParams extends WireBaseParams {
  page?: number;
  perPage?: number;
}

/** Infinite-scroll wire params. */
export interface WireInfiniteParams extends WireBaseParams {
  limit?: number;
  offset?: number;
}

/** Cursor (keyset) wire params — `sort` yo'q, tartib `order` + `direction` bilan. */
export interface WireCursorParams extends Omit<WireBaseParams, "sort"> {
  limit?: number;
  cursor?: string | null;
  cursorKey?: string;
  order?: SortDirection;
  direction?: "forward" | "backward";
}

/* --------------------------- skip diagnostics ----------------------------- */
/* Adapterlar noto'g'ri shartni jimgina tashlab yuboradi (DbService-parity). Shu
 * shakl `onSkippedCondition` hook'i va `strict` rejim xatosi uchun umumiy. */

/** Shart nima uchun tashlab yuborilgani. */
export type SkipReason = "unknown-key" | "invalid-value";

/** Shart qayerda tashlab yuborilgani. */
export type SkipSite = "filter" | "sort" | "cursorKey" | "aggregate";

/** Tashlab yuborilgan bitta shart haqida ma'lumot. */
export interface SkippedCondition {
  /** Jadval (drizzle) yoki model (mongoose) nomi. */
  source: string;
  site: SkipSite;
  key: string;
  operation?: FilterOperator;
  reason: SkipReason;
}

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
