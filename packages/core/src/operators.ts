/**
 * Filter operatorlari — yagona runtime manba. `FilterOperator` tipi (`types.ts`)
 * shundan chiqadi; `@querykitjs/zod` shu massivdan zod enum quradi.
 */
export const FILTER_OPERATORS = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "notLike",
  "contains",
  "startsWith",
  "endsWith",
  "%_%", // contains
  "%_", // startsWith
  "_%", // endsWith
  "in",
  "notIn",
  "between",
  "notBetween",
  "isNull",
  "isNotNull",
] as const;

/**
 * Qiymati **text pattern** bo'lgan operatorlar. Backend adapterlari wire qiymatni
 * ustun/path tipiga cast qilishda shularni chetlab o'tadi — aks holda
 * `ilike(dateColumn, "%2026%")` ISO string o'rniga `String(Date)` olardi
 * (`"Mon Jul 28 2026 …"`). Ro'yxat ikki adapterda divergent bo'lmasligi uchun
 * shu yerda — yagona manba.
 */
export const TEXT_FILTER_OPERATORS = [
  "like",
  "ilike",
  "notLike",
  "contains",
  "startsWith",
  "endsWith",
  "%_%",
  "%_",
  "_%",
] as const satisfies readonly (typeof FILTER_OPERATORS)[number][];
