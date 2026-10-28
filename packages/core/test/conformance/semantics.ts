/**
 * Value-level semantics shared by the reference evaluator and the fake drivers:
 * SQL three-valued logic, LIKE patterns, comparisons with date coercion, and
 * PostgreSQL / MongoDB null ordering. Test-only.
 */

/** SQL truth value: `null` is UNKNOWN (a comparison with NULL). */
export type Tri = boolean | null;

export const and3 = (values: Tri[]): Tri => (values.includes(false) ? false : values.includes(null) ? null : true);
export const or3 = (values: Tri[]): Tri => (values.includes(true) ? true : values.includes(null) ? null : false);
export const not3 = (value: Tri): Tri => (value === null ? null : !value);

/**
 * A wire value compared against a stored one, cast like PostgreSQL casts a
 * parameter to the column type: ISO strings become dates, numeric strings
 * numbers, and a non-numeric string for a number throws (PostgreSQL rejects the
 * query with `invalid input syntax`).
 */
export function coerceLike(stored: unknown, operand: unknown): unknown {
  if (stored instanceof Date && (typeof operand === "string" || typeof operand === "number")) return new Date(operand);
  if (typeof stored === "number" && typeof operand === "string") {
    const parsed = Number(operand);
    if (operand.trim() === "" || Number.isNaN(parsed)) throw new Error(`invalid input syntax for type number: "${operand}"`);
    return parsed;
  }
  return operand;
}

const asComparable = (value: unknown): number | string | boolean => (value instanceof Date ? value.getTime() : (value as number | string | boolean));

/** -1 / 0 / 1 for two non-null values (dates by time, strings by code unit). */
export function compareValues(a: unknown, b: unknown): number {
  const left = asComparable(a);
  const right = asComparable(coerceLike(a, b));
  return left < right ? -1 : left > right ? 1 : 0;
}

/** SQL comparison: UNKNOWN when either side is NULL. */
export function sqlCompare(stored: unknown, operand: unknown, test: (order: number) => boolean): Tri {
  if (stored === null || stored === undefined || operand === null || operand === undefined) return null;
  return test(compareValues(stored, operand));
}

/** A SQL LIKE pattern (`%`, `_`, backslash escape) → an anchored RegExp. */
export function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === "\\" && i + 1 < pattern.length) source += escapeRegExp(pattern[++i]!);
    else if (char === "%") source += "[\\s\\S]*";
    else if (char === "_") source += "[\\s\\S]";
    else source += escapeRegExp(char);
  }
  return new RegExp(`^${source}$`, caseInsensitive ? "i" : "");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** SQL `x LIKE p`: UNKNOWN for a NULL value. */
export function sqlLike(stored: unknown, pattern: unknown, caseInsensitive: boolean): Tri {
  if (stored === null || stored === undefined || pattern === null || pattern === undefined) return null;
  return likeToRegExp(String(pattern), caseInsensitive).test(String(stored));
}

/** Escape a literal for use inside a LIKE pattern (`contains`-style operators). */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, "\\$&");

/** SQL `x IN (…)`: UNKNOWN for a NULL value. */
export function sqlIn(stored: unknown, values: unknown): Tri {
  if (stored === null || stored === undefined) return null;
  return (values as unknown[]).some(value => sqlCompare(stored, value, order => order === 0) === true);
}

export type Direction = "asc" | "desc";

/** PostgreSQL default ordering: NULLS LAST for ASC, NULLS FIRST for DESC. */
export function pgOrder(a: unknown, b: unknown, direction: Direction): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) {
    if (aNull && bNull) return 0;
    const nullsLast = direction === "asc";
    return aNull === nullsLast ? 1 : -1;
  }
  const order = compareValues(a, b);
  return direction === "asc" ? order : -order;
}

/** MongoDB ordering: null/missing is the lowest value in both directions. */
export function mongoOrder(a: unknown, b: unknown, direction: Direction): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  const order = aNull || bNull ? (aNull && bNull ? 0 : aNull ? -1 : 1) : compareValues(a, b);
  return direction === "asc" ? order : -order;
}

/** Stable multi-key sort with a per-key comparator. */
export function sortRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  keys: ReadonlyArray<{ key: string; direction: Direction }>,
  order: (a: unknown, b: unknown, direction: Direction) => number,
): T[] {
  return [...rows].sort((a, b) => {
    for (const { key, direction } of keys) {
      const result = order(a[key], b[key], direction);
      if (result !== 0) return result;
    }
    return 0;
  });
}

/** Keep only the selected keys (a projection). */
export function pick(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => key in row).map(key => [key, row[key]]));
}
