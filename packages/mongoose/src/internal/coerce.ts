import { TEXT_FILTER_OPERATORS } from "@querykitjs/core";

import type { FilterOperator, FilterValue } from "../types";
import type { AnyModel } from "./fields";

/**
 * Operators whose value is a text pattern — never cast. A `$regex` fragment must
 * keep the caller's raw string even on a `Date` path. The list lives in
 * `@querykitjs/core` so both adapters share it.
 */
const TEXT_OPERATORS: ReadonlySet<FilterOperator> = new Set(TEXT_FILTER_OPERATORS);

/**
 * Returned when a value cannot be represented in the path's type (e.g. the
 * string `"not-a-date"` on a `Date` path). Callers drop the condition — the same
 * contract `operators.ts` already uses for a non-array `in` value, and the same
 * symbol-based contract the drizzle adapter uses.
 */
export const INVALID_VALUE = Symbol("querykit.invalid-value");

/** Whether this operator compares against a text pattern (`like`, `contains`, …). */
export const isTextOperator = (operator: FilterOperator): boolean => TEXT_OPERATORS.has(operator);

/** Whether a schema path stores a `Date` (the only type both adapters cast locally). */
export function isDatePath(model: AnyModel, field: string): boolean {
  return model.schema.path(field)?.instance === "Date";
}

/**
 * Cast a single wire value to the path's type, or report it as uncastable.
 *
 * Scoped to `Date` paths **on purpose**, so both adapters behave identically:
 * drizzle can only judge columns it maps through JS (`dataType: "date"`) and
 * leaves everything else to Postgres, so mongoose likewise leaves other paths to
 * its own query cast. Mongoose casts these values itself when the query runs;
 * doing it here keeps the behaviour pinned by tests instead of relying on
 * mongoose internals, and turns a cryptic `CastError` 500 into a skipped
 * condition (observable via `onSkippedCondition`).
 */
export function castForPath(model: AnyModel, field: string, value: unknown): unknown | typeof INVALID_VALUE {
  const path = model.schema.path(field);
  if (!path || value === null || value === undefined || !CAST_INSTANCES.has(path.instance)) return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? INVALID_VALUE : value;
  try {
    const cast = path.cast(value) as unknown;
    if (cast instanceof Date) return Number.isNaN(cast.getTime()) ? INVALID_VALUE : cast;
    if (cast === null || cast === undefined) return INVALID_VALUE;
    // `cast` does not check an enum; a value outside it can never match (task 021 B8).
    const enumValues = (path as unknown as { enumValues?: readonly unknown[] }).enumValues;
    if (path.instance === "String" && enumValues && enumValues.length > 0 && !enumValues.includes(cast)) return INVALID_VALUE;
    return cast;
  } catch {
    return INVALID_VALUE;
  }
}

/**
 * Paths cast here (task 021 B8): a value their type rejects — `age = "abc"`, a
 * malformed ObjectId, `"maybe"` for a Boolean, a String outside its enum — is
 * invalid-value before the query runs, instead of a CastError 500 at exec.
 */
const CAST_INSTANCES: ReadonlySet<string> = new Set(["Date", "Number", "Boolean", "ObjectId", "String", "Decimal128"]);

/**
 * Bring one condition's value in line with the path's type before it reaches an
 * operator builder — the mongoose counterpart of the drizzle adapter's
 * `coerceCondition`, with the same signature shape, the same text-operator
 * carve-out and the same all-or-nothing rule for arrays/tuples.
 */
export function coerceCondition(
  model: AnyModel,
  field: string,
  operator: FilterOperator,
  value: FilterValue | undefined,
): FilterValue | undefined | typeof INVALID_VALUE {
  if (value === undefined || TEXT_OPERATORS.has(operator)) return value;

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const cast = castForPath(model, field, item);
      if (cast === INVALID_VALUE) return INVALID_VALUE;
      items.push(cast);
    }
    return items as FilterValue;
  }

  const cast = castForPath(model, field, value);
  return cast === INVALID_VALUE ? INVALID_VALUE : (cast as FilterValue);
}
