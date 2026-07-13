/**
 * Filter/query DSL tiplari — querykit backend (`@querykit/drizzle-pg`) qabul
 * qiladigan wire-format bilan mos. Frontend `operation`ni emit qiladi (legacy
 * uchun), lekin `op` alias sifatida ham qabul qilinadi. Kelajakda `@querykit/core`.
 */

/** Qo'llab-quvvatlanadigan filter operatorlari (token va nomlar). */
export type FilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "%_%" // contains
  | "%_" // startsWith
  | "_%" // endsWith
  | "in"
  | "notIn"
  | "between"
  | "notBetween"
  | "isNull"
  | "isNotNull";

/** Qiymatni so'rovdan oldin coerce qilish uchun ixtiyoriy tip. */
export type FilterValueType = "string" | "number" | "boolean" | "date";

export type FilterScalar = string | number | boolean | null;
export type FilterValue = FilterScalar | FilterScalar[] | Date;

/** Entity ustun (maydon) kaliti. */
export type FieldKey<T> = Extract<keyof T, string>;

/** Bitta maydon sharti. `operation` — kanonik, `op` — alias. */
export interface FieldCondition<T = Record<string, unknown>> {
  key: FieldKey<T>;
  operation?: FilterOperator;
  /** `operation` uchun alias (querykit backend). */
  op?: FilterOperator;
  value?: FilterValue;
  type?: FilterValueType;
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
}

export interface ListParams<T = Record<string, unknown>> extends Params<T> {
  page?: number;
  perPage?: number;
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

/* --------------------------------- meta ----------------------------------- */

/** Server qaytaradigan xom meta (snake_case). */
export interface RawMeta {
  total_pages?: number;
  total_items?: number;
  current_page?: number;
  per_page?: number;
}

/** App ishlatadigan normalizatsiya qilingan meta (camelCase). */
export interface Meta {
  totalPages: number;
  totalCount: number;
  currentPage: number;
  perPage: number;
}
