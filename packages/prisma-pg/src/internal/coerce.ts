import { TEXT_FILTER_OPERATORS } from "@querykitjs/core";

import type { FilterOperator, FilterValue } from "../types";
import { castValue, fieldMeta, type ModelMeta } from "./fields";

/**
 * Operators whose value is a text pattern — never cast. Otherwise
 * `contains(dateField, "2026")` would receive `String(Date)`
 * (`"Mon Jul 28 2026 …"`) instead of the string the caller sent. The list lives
 * in `@querykitjs/core` so all three adapters share it.
 */
const TEXT_OPERATORS: ReadonlySet<FilterOperator> = new Set(TEXT_FILTER_OPERATORS);

/**
 * Returned when a value cannot be represented in the field's type (e.g. the
 * string `"not-a-date"` on a `DateTime` field). Callers drop the condition — the
 * same symbol-based contract the drizzle-pg and mongoose adapters use.
 */
export const INVALID_VALUE = Symbol("querykit.invalid-value");

/** Whether this operator compares against a text pattern (`like`, `contains`, …). */
export const isTextOperator = (operator: FilterOperator): boolean => TEXT_OPERATORS.has(operator);

/**
 * Cast a single wire value to the field's type, or report it as uncastable.
 *
 * **Why this covers more types than the drizzle-pg adapter's `castForColumn`.**
 * A JSON/query-string payload carries `"18"`, not `18`. drizzle hands that
 * straight to Postgres, which casts it, so `{ key: "age", value: "18" }` just
 * works; mongoose casts it against the schema for the same reason. Prisma does
 * neither — it type-checks arguments in the client and throws
 * `PrismaClientValidationError`, which would surface as a **500 where the other
 * two adapters return rows**. So the adapter performs the cast Postgres would
 * have performed, and a value that genuinely cannot be represented is dropped
 * and reported instead of crashing the request.
 */
export function castForField(meta: ModelMeta, field: string, value: unknown): unknown | typeof INVALID_VALUE {
  if (value === null || value === undefined) return value;
  const type = fieldMeta(meta, field)?.type;

  if (type === "DateTime") {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? INVALID_VALUE : value;
    const cast = castValue(meta, field, value);
    if (cast instanceof Date) return Number.isNaN(cast.getTime()) ? INVALID_VALUE : cast;
    return INVALID_VALUE; // a string/number that could not be parsed, or a wrong-typed value
  }

  if (type === "Int" || type === "BigInt") {
    if (typeof value === "number") return Number.isInteger(value) ? value : INVALID_VALUE;
    if (typeof value === "bigint") return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      return Number.isInteger(n) ? n : INVALID_VALUE;
    }
    return INVALID_VALUE;
  }

  if (type === "Float" || type === "Decimal") {
    if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_VALUE;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      return Number.isFinite(n) ? n : INVALID_VALUE;
    }
    return INVALID_VALUE;
  }

  if (type === "Boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return INVALID_VALUE;
  }

  // String / enum / Json / everything else: left alone. Postgres would not have
  // cast an int to text either, so this matches drizzle-pg's behaviour.
  return value;
}

/**
 * Bring one condition's value in line with the field's type before it reaches an
 * operator builder. Scalars, arrays (`in`/`notIn`) and tuples
 * (`between`/`notBetween`) are all covered because coercion sits **before** the
 * operator, in a single place. A single uncastable element invalidates the whole
 * condition — a half-applied `in` list would silently widen the result set.
 */
export function coerceCondition(
  meta: ModelMeta,
  field: string,
  operator: FilterOperator,
  value: FilterValue | undefined,
): FilterValue | undefined | typeof INVALID_VALUE {
  if (value === undefined || TEXT_OPERATORS.has(operator)) return value;

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const cast = castForField(meta, field, item);
      if (cast === INVALID_VALUE) return INVALID_VALUE;
      items.push(cast);
    }
    return items as FilterValue;
  }

  const cast = castForField(meta, field, value);
  return cast === INVALID_VALUE ? INVALID_VALUE : (cast as FilterValue);
}
