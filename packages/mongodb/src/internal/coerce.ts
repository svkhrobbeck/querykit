/**
 * Wire value → stored value, by the field kind from the zod schema. A value the field cannot
 * hold is INVALID_VALUE and the condition is dropped as `invalid-value` — the same contract as
 * the mongoose adapter (`path.cast`) and drizzle-pg. A plain object is never a value: that is
 * how `{ "$where": … }` or `{ "$gt": "" }` would reach the driver as an operator (task 017 T-2).
 */
import { ObjectId } from "mongodb";
import { TEXT_FILTER_OPERATORS, type FilterOperator, type FilterValue } from "@querykitjs/core";

import type { DocShape, Field } from "./fields";

/** Operators whose value is a text pattern — never cast. */
const TEXT_OPERATORS: ReadonlySet<FilterOperator> = new Set(TEXT_FILTER_OPERATORS);

/** Returned when a value cannot be stored in the field; callers drop the condition. */
export const INVALID_VALUE = Symbol("querykit.invalid-value");

export const isTextOperator = (operator: FilterOperator): boolean => TEXT_OPERATORS.has(operator);

const NUMERIC = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function castScalar(field: Field, value: unknown): unknown {
  switch (field.kind) {
    case "string":
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : INVALID_VALUE;
    case "number": {
      if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_VALUE;
      return typeof value === "string" && NUMERIC.test(value.trim()) ? Number(value) : INVALID_VALUE;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      return value === "true" ? true : value === "false" ? false : INVALID_VALUE;
    case "date": {
      if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return INVALID_VALUE;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? INVALID_VALUE : date;
    }
    case "objectId":
      if (value instanceof ObjectId) return value;
      return typeof value === "string" && ObjectId.isValid(value) && value.length === 24 ? new ObjectId(value) : INVALID_VALUE;
    case "other":
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : INVALID_VALUE;
  }
}

/** One value for a field: `null` passes (isNull / `=` null), enums are checked, objects refused. */
export function castForField(shape: DocShape, fieldName: string, value: unknown): unknown {
  const field = shape.fields.get(fieldName);
  if (!field || value === null || value === undefined) return value;
  const cast = castScalar(field, value);
  if (cast === INVALID_VALUE) return INVALID_VALUE;
  return field.values && !field.values.includes(cast) ? INVALID_VALUE : cast;
}

/**
 * A condition's value in the field's type before it reaches an operator builder. Text
 * operators keep the caller's string (it must be one); arrays and tuples are all-or-nothing.
 */
export function coerceCondition(
  shape: DocShape,
  field: string,
  operator: FilterOperator,
  value: FilterValue | undefined,
): FilterValue | undefined | typeof INVALID_VALUE {
  if (value === undefined) return value;
  if (TEXT_OPERATORS.has(operator)) return typeof value === "string" ? value : INVALID_VALUE;
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const cast = castForField(shape, field, item);
      if (cast === INVALID_VALUE) return INVALID_VALUE;
      items.push(cast);
    }
    return items as FilterValue;
  }
  const cast = castForField(shape, field, value);
  return cast === INVALID_VALUE ? INVALID_VALUE : (cast as FilterValue);
}
