import { TEXT_FILTER_OPERATORS } from "@querykitjs/core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { FilterOperator, FilterValue } from "../types";
import { castValue } from "./columns";

/**
 * Operators whose value is a text pattern — never cast. Otherwise
 * `ilike(dateColumn, "%2026%")` would receive `String(Date)`
 * (`"Mon Jul 28 2026 …"`) instead of the ISO string the caller sent.
 * The list lives in `@querykitjs/core` so both adapters share it.
 */
const TEXT_OPERATORS: ReadonlySet<FilterOperator> = new Set(TEXT_FILTER_OPERATORS);

/**
 * Returned when a value cannot be represented in the column's type (e.g. the
 * string `"not-a-date"` on a `timestamp` column). Callers drop the condition —
 * the same contract `operators.ts` already uses for a non-array `in` value.
 * Without this, drizzle's driver mapping throws a bare
 * `value.toISOString is not a function`, which surfaces as a cryptic 500.
 */
export const INVALID_VALUE = Symbol("querykit.invalid-value");

/**
 * Cast a single wire value to the column's type, or report it as uncastable.
 * Only columns drizzle maps through JS (`dataType: "date"`) can be judged here;
 * everything else is left to Postgres, which casts (or complains) itself.
 */
export function castForColumn(column: AnyPgColumn, value: unknown): unknown | typeof INVALID_VALUE {
  const cast = castValue(column, value);
  if (column.dataType !== "date" || cast === null || cast === undefined) return cast;
  if (cast instanceof Date) return Number.isNaN(cast.getTime()) ? INVALID_VALUE : cast;
  return INVALID_VALUE; // a string/number that could not be parsed, or a wrong-typed value
}

/**
 * Bring one condition's value in line with the column's type before it reaches
 * an operator builder. Scalars, arrays (`in`/`notIn`) and tuples
 * (`between`/`notBetween`) are all covered because coercion sits **before** the
 * operator, in a single place. A single uncastable element invalidates the whole
 * condition — a half-applied `in` list would silently widen the result set.
 */
export function coerceCondition(column: AnyPgColumn, operator: FilterOperator, value: FilterValue | undefined): FilterValue | undefined | typeof INVALID_VALUE {
  if (value === undefined || TEXT_OPERATORS.has(operator)) return value;

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const cast = castForColumn(column, item);
      if (cast === INVALID_VALUE) return INVALID_VALUE;
      items.push(cast);
    }
    return items as FilterValue;
  }

  const cast = castForColumn(column, value);
  return cast === INVALID_VALUE ? INVALID_VALUE : (cast as FilterValue);
}
