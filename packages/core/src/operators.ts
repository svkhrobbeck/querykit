/**
 * Filter operatorlari — yagona runtime manba. `FilterOperator` tipi (`types.ts`)
 * shundan chiqadi; `@querykit/zod` shu massivdan zod enum quradi.
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
