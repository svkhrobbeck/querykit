import { and, or, not, isSQLWrapper, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { FieldCondition, Filter, FilterNode } from "../types";
import { coerceCondition, INVALID_VALUE } from "./coerce";
import { resolveColumn } from "./columns";
import { reportSkip, type Diagnostics } from "./diagnostics";
import { operators } from "./operators";

/**
 * Compile a public {@link Filter} into a single Drizzle `SQL` condition.
 * A flat array is treated as implicit AND (db-service compatibility).
 * Returns `undefined` when nothing meaningful remains (an empty `WHERE`).
 *
 * `diag` is optional: without it, unresolvable conditions are dropped silently
 * exactly as before; with it they are reported (or, in strict mode, throw).
 */
export function buildWhere<TTable extends AnyPgTable>(table: TTable, filter?: Filter<TTable>, diag?: Diagnostics): SQL | undefined {
  if (!filter) return undefined;

  if (Array.isArray(filter)) {
    return combine(
      "and",
      filter.map(node => buildNode(table, node as FilterNode, diag)),
    );
  }
  return buildNode(table, filter as FilterNode, diag);
}

function buildNode(table: AnyPgTable, node: FilterNode, diag?: Diagnostics): SQL | undefined {
  // Raw SQL escape hatch.
  if (isSQLWrapper(node)) return node.getSQL();

  if ("and" in node) {
    return combine(
      "and",
      node.and.map(child => buildNode(table, child, diag)),
    );
  }
  if ("or" in node) {
    return combine(
      "or",
      node.or.map(child => buildNode(table, child, diag)),
    );
  }
  if ("not" in node) {
    const inner = buildNode(table, node.not, diag);
    return inner ? not(inner) : undefined;
  }
  return buildCondition(table, node as FieldCondition, diag);
}

function buildCondition(table: AnyPgTable, condition: FieldCondition, diag?: Diagnostics): SQL | undefined {
  const operator = condition.operation ?? "=";
  const build = operators[operator];
  if (!build) throw new Error(`Unsupported filter operator: "${operator}"`);

  const column = resolveColumn(table, condition.key);
  if (!column) {
    // Unknown column → skip. Usually a typo, and a dropped filter widens the
    // result set rather than narrowing it, so it is worth reporting.
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "unknown-key" });
    return undefined;
  }

  // Wire values are always JSON (no Date), so cast to the column's type first —
  // a `timestamp`/`date` column in `mode: "date"` otherwise crashes in drizzle's
  // driver mapping. Covers scalars, `in` arrays and `between` tuples at once.
  const value = coerceCondition(column, operator, condition.value);
  if (value === INVALID_VALUE) {
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }

  const built = build(column, value);
  if (built === undefined) {
    // The operator rejected the value shape (a non-array `in`, a non-2-tuple
    // `between`) — same class of problem as an uncastable value.
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "invalid-value" });
  }
  return built;
}

function combine(kind: "and" | "or", parts: Array<SQL | undefined>): SQL | undefined {
  const conditions = parts.filter((part): part is SQL => part !== undefined);
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return kind === "and" ? and(...conditions) : or(...conditions);
}
