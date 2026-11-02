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
 * Columns Postgres can match a LIKE pattern against. Any other type (timestamp,
 * number, boolean, uuid, enum, json…) has no `~~` / `~~*` operator, so a text
 * pattern there is invalid-value (R11, task 024) — the same rule as the Mongo
 * adapters — instead of a driver error. A custom column type is left to Postgres.
 */
const TEXT_COLUMN_TYPES: ReadonlySet<string> = new Set(["PgText", "PgVarchar", "PgChar", "PgCustomColumn"]);

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
  if (value === null || value === undefined) return value;
  switch (column.dataType) {
    case "date": {
      const cast = castValue(column, value);
      if (cast instanceof Date) return Number.isNaN(cast.getTime()) ? INVALID_VALUE : cast;
      return INVALID_VALUE; // a string/number that could not be parsed, or a wrong-typed value
    }
    case "number":
      return castNumber(value);
    case "boolean":
      return castBoolean(value);
    case "string":
      return castString(column, value);
    default:
      return value;
  }
}

/* Task 021 B8: a value Postgres would reject (22P02 / 22007 …) is invalid-value here,
 * before the driver runs — skipped and reported, or a QueryKitError under strict. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A finite number, or a numeric string (query strings carry numbers as text). */
function castNumber(value: unknown): number | typeof INVALID_VALUE {
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_VALUE;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return INVALID_VALUE;
}

function castBoolean(value: unknown): boolean | typeof INVALID_VALUE {
  if (typeof value === "boolean") return value;
  // The same set prisma-pg accepts (R11).
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return INVALID_VALUE;
}

/** Text is free-form; a uuid column needs a uuid, an enum column one of its values. */
function castString(column: AnyPgColumn, value: unknown): unknown {
  if (typeof value !== "string") return typeof value === "number" || typeof value === "boolean" ? String(value) : INVALID_VALUE;
  if (column.columnType === "PgUUID" && !UUID.test(value)) return INVALID_VALUE;
  const enumValues = (column as { enumValues?: readonly string[] }).enumValues;
  if (enumValues && enumValues.length > 0 && !enumValues.includes(value)) return INVALID_VALUE;
  return value;
}

/**
 * Bring one condition's value in line with the column's type before it reaches
 * an operator builder. Scalars, arrays (`in`/`notIn`) and tuples
 * (`between`/`notBetween`) are all covered because coercion sits **before** the
 * operator, in a single place. A single uncastable element invalidates the whole
 * condition — a half-applied `in` list would silently widen the result set.
 */
export function coerceCondition(column: AnyPgColumn, operator: FilterOperator, value: FilterValue | undefined): FilterValue | undefined | typeof INVALID_VALUE {
  if (TEXT_OPERATORS.has(operator)) return TEXT_COLUMN_TYPES.has(column.columnType) ? value : INVALID_VALUE;
  if (value === undefined) return value;

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
