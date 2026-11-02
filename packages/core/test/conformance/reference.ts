/**
 * The reference meaning of a wire request, evaluated in memory: which fixture
 * rows a filter selects (SQL three-valued logic), in which order a sort puts
 * them (NULL ordering: first on asc, last on desc — task 021 B11). Every case's `expect` is checked against it
 * (`self-check.ts`), so the table cannot drift from what the contract says.
 *
 * Text operators: `contains` / `startsWith` / `endsWith` / `ilike` are
 * case-insensitive, `like` / `notLike` are case-sensitive; `contains`-style
 * values are literal (a `_` in the value is not a wildcard).
 */
import type { FieldCondition, Filter, FilterNode, Sort } from "../../src/types";

import { and3, escapeLike, mongoOrder, not3, or3, sortRows, sqlCompare, sqlIn, sqlLike, type Tri } from "./semantics";

type Row = Record<string, unknown>;

function evalCondition(condition: FieldCondition, row: Row): Tri {
  const stored = row[condition.key];
  const value = condition.value;
  const text = typeof value === "string" ? value : "";
  switch (condition.operation ?? "=") {
    case "=":
    case "eq":
      return sqlCompare(stored, value, order => order === 0);
    case "!=":
    case "ne":
      return sqlCompare(stored, value, order => order !== 0);
    case ">":
    case "gt":
      return sqlCompare(stored, value, order => order > 0);
    case ">=":
    case "gte":
      return sqlCompare(stored, value, order => order >= 0);
    case "<":
    case "lt":
      return sqlCompare(stored, value, order => order < 0);
    case "<=":
    case "lte":
      return sqlCompare(stored, value, order => order <= 0);
    case "contains":
    case "%_%":
      return sqlLike(stored, `%${escapeLike(text)}%`, true);
    case "startsWith":
    case "%_":
      return sqlLike(stored, `${escapeLike(text)}%`, true);
    case "endsWith":
    case "_%":
      return sqlLike(stored, `%${escapeLike(text)}`, true);
    case "like":
      return sqlLike(stored, value, false);
    case "ilike":
      return sqlLike(stored, value, true);
    case "notLike":
      return not3(sqlLike(stored, value, false));
    case "in":
      return sqlIn(stored, value);
    case "notIn":
      return not3(sqlIn(stored, value));
    case "between": {
      const [min, max] = value as unknown[];
      return and3([sqlCompare(stored, min, order => order >= 0), sqlCompare(stored, max, order => order <= 0)]);
    }
    case "notBetween":
      return not3(evalCondition({ ...condition, operation: "between" }, row));
    case "isNull":
      return stored === null || stored === undefined;
    case "isNotNull":
      return stored !== null && stored !== undefined;
  }
}

function evalNode(node: FilterNode, row: Row): Tri {
  if ("and" in node) return and3(node.and.map(child => evalNode(child, row)));
  if ("or" in node) return or3(node.or.map(child => evalNode(child, row)));
  if ("not" in node) return not3(evalNode(node.not, row));
  return evalCondition(node, row);
}

/** Rows a filter selects: only rows where it is TRUE (UNKNOWN drops the row, as in SQL). */
export function referenceFilter<T extends Row>(rows: readonly T[], filter: Filter | undefined): T[] {
  if (filter === undefined) return [...rows];
  const evaluate = (row: Row): Tri => (Array.isArray(filter) ? and3(filter.map(condition => evalCondition(condition, row))) : evalNode(filter, row));
  return rows.filter(row => evaluate(row) === true);
}

/**
 * Rows in sort order (task 021 B11: NULL first on asc, last on desc — MongoDB's order, on every adapter; ties keep fixture order). Items
 * without a `key` (`null`, `{}`) are dropped, as every adapter does.
 */
export function referenceSort<T extends Row>(rows: readonly T[], sort: Sort | undefined): T[] {
  const items = (sort ?? []).filter(item => item && item.key);
  if (items.length === 0) return [...rows];
  return sortRows(
    rows,
    items.map(item => ({ key: item.key, direction: item.direction ?? "asc" })),
    mongoOrder,
  );
}
