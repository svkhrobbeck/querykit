import { eq, ne, gt, gte, lt, lte, like, ilike, notLike, inArray, notInArray, between, notBetween, isNull, isNotNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { FilterOperator, FilterValue } from "../types";

/**
 * Builds an SQL condition for one operator. Returns `undefined` when the value
 * is incompatible (e.g. a non-array passed to `in`) so the condition is skipped
 * instead of producing invalid SQL.
 */
type OperatorBuilder = (column: AnyPgColumn, value: FilterValue | undefined) => SQL | undefined;

const text = (value: FilterValue | undefined): string => String(value ?? "");

const asTuple = (value: FilterValue | undefined): [unknown, unknown] | undefined =>
  Array.isArray(value) && value.length === 2 ? [value[0], value[1]] : undefined;

/** Registry mapping every operator (and its aliases) to a condition builder. */
export const operators: Record<FilterOperator, OperatorBuilder> = {
  "=": (c, v) => eq(c, v),
  eq: (c, v) => eq(c, v),
  "!=": (c, v) => ne(c, v),
  ne: (c, v) => ne(c, v),
  ">": (c, v) => gt(c, v),
  gt: (c, v) => gt(c, v),
  ">=": (c, v) => gte(c, v),
  gte: (c, v) => gte(c, v),
  "<": (c, v) => lt(c, v),
  lt: (c, v) => lt(c, v),
  "<=": (c, v) => lte(c, v),
  lte: (c, v) => lte(c, v),

  like: (c, v) => like(c, text(v)),
  ilike: (c, v) => ilike(c, text(v)),
  notLike: (c, v) => notLike(c, text(v)),
  contains: (c, v) => ilike(c, `%${text(v)}%`),
  startsWith: (c, v) => ilike(c, `${text(v)}%`),
  endsWith: (c, v) => ilike(c, `%${text(v)}`),
  "%_%": (c, v) => ilike(c, `%${text(v)}%`),
  "%_": (c, v) => ilike(c, `${text(v)}%`),
  "_%": (c, v) => ilike(c, `%${text(v)}`),

  in: (c, v) => (Array.isArray(v) ? inArray(c, v) : undefined),
  notIn: (c, v) => (Array.isArray(v) ? notInArray(c, v) : undefined),

  between: (c, v) => {
    const t = asTuple(v);
    return t ? between(c, t[0], t[1]) : undefined;
  },
  notBetween: (c, v) => {
    const t = asTuple(v);
    return t ? notBetween(c, t[0], t[1]) : undefined;
  },

  isNull: c => isNull(c),
  isNotNull: c => isNotNull(c),
};
