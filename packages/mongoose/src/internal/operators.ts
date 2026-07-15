import type { FilterOperator, FilterValue } from "../types";

/** A field-level Mongo fragment, e.g. `{ $gte: 1, $lte: 9 }`. `undefined` = drop. */
type Fragment = Record<string, unknown> | undefined;
type Builder = (value: FilterValue | undefined) => Fragment;

/** Escape a literal string for use inside a regex (contains/startsWith/endsWith). */
const esc = (s: unknown): string => String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Translate a SQL LIKE pattern (`%` → any, `_` → one char) to an anchored regex. */
const sqlLikeToRegex = (pattern: unknown): string => {
  let out = "";
  for (const ch of String(pattern ?? "")) {
    if (ch === "%") out += ".*";
    else if (ch === "_") out += ".";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return `^${out}$`;
};

const asTuple = (v: FilterValue | undefined): [unknown, unknown] | undefined => (Array.isArray(v) && v.length === 2 ? [v[0], v[1]] : undefined);

/**
 * Operator → Mongo fragment map. Mirrors the Drizzle adapter's semantics: both
 * token (`"%_%"`) and name-alias (`"contains"`) forms are handled;
 * `contains/startsWith/endsWith` are case-insensitive; invalid values (non-array
 * `in`, non-2-tuple `between`) drop the condition (`undefined`).
 */
export const operators: Record<FilterOperator, Builder> = {
  "=": v => ({ $eq: v }),
  eq: v => ({ $eq: v }),
  // SQL three-valued logic: inequality/negation excludes NULL (and missing) rows,
  // matching drizzle-pg. `$nin: [v, null]` = "not v AND not null".
  "!=": v => ({ $nin: [v, null] }),
  ne: v => ({ $nin: [v, null] }),
  ">": v => ({ $gt: v }),
  gt: v => ({ $gt: v }),
  ">=": v => ({ $gte: v }),
  gte: v => ({ $gte: v }),
  "<": v => ({ $lt: v }),
  lt: v => ({ $lt: v }),
  "<=": v => ({ $lte: v }),
  lte: v => ({ $lte: v }),

  contains: v => ({ $regex: esc(v), $options: "i" }),
  "%_%": v => ({ $regex: esc(v), $options: "i" }),
  startsWith: v => ({ $regex: `^${esc(v)}`, $options: "i" }),
  "%_": v => ({ $regex: `^${esc(v)}`, $options: "i" }),
  endsWith: v => ({ $regex: `${esc(v)}$`, $options: "i" }),
  "_%": v => ({ $regex: `${esc(v)}$`, $options: "i" }),

  like: v => ({ $regex: sqlLikeToRegex(v) }),
  ilike: v => ({ $regex: sqlLikeToRegex(v), $options: "i" }),
  // negation also excludes NULL/missing (SQL `NOT LIKE` semantics).
  notLike: v => ({ $not: { $regex: sqlLikeToRegex(v) }, $ne: null }),

  in: v => (Array.isArray(v) ? { $in: v } : undefined),
  notIn: v => (Array.isArray(v) ? { $nin: [...v, null] } : undefined),

  between: v => {
    const t = asTuple(v);
    return t ? { $gte: t[0], $lte: t[1] } : undefined;
  },
  notBetween: v => {
    const t = asTuple(v);
    return t ? { $not: { $gte: t[0], $lte: t[1] }, $ne: null } : undefined;
  },

  isNull: () => ({ $eq: null }),
  isNotNull: () => ({ $ne: null }),
};
