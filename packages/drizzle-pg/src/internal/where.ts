import { and, or, not, isSQLWrapper, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { FieldCondition, Filter, FilterNode } from "../types";
import { resolveColumn } from "./columns";
import { operators } from "./operators";

/**
 * Compile a public {@link Filter} into a single Drizzle `SQL` condition.
 * A flat array is treated as implicit AND (db-service compatibility).
 * Returns `undefined` when nothing meaningful remains (an empty `WHERE`).
 */
export function buildWhere<TTable extends AnyPgTable>(table: TTable, filter?: Filter<TTable>): SQL | undefined {
  if (!filter) return undefined;

  if (Array.isArray(filter)) {
    return combine(
      "and",
      filter.map(node => buildNode(table, node as FilterNode)),
    );
  }
  return buildNode(table, filter as FilterNode);
}

function buildNode(table: AnyPgTable, node: FilterNode): SQL | undefined {
  // Raw SQL escape hatch.
  if (isSQLWrapper(node)) return node.getSQL();

  if ("and" in node) {
    return combine(
      "and",
      node.and.map(child => buildNode(table, child)),
    );
  }
  if ("or" in node) {
    return combine(
      "or",
      node.or.map(child => buildNode(table, child)),
    );
  }
  if ("not" in node) {
    const inner = buildNode(table, node.not);
    return inner ? not(inner) : undefined;
  }
  return buildCondition(table, node as FieldCondition);
}

function buildCondition(table: AnyPgTable, condition: FieldCondition): SQL | undefined {
  const operator = condition.operation ?? "=";
  const build = operators[operator];
  if (!build) throw new Error(`Unsupported filter operator: "${operator}"`);

  const column = resolveColumn(table, condition.key);
  if (!column) return undefined; // unknown column → skip silently

  return build(column, condition.value);
}

function combine(kind: "and" | "or", parts: Array<SQL | undefined>): SQL | undefined {
  const conditions = parts.filter((part): part is SQL => part !== undefined);
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return kind === "and" ? and(...conditions) : or(...conditions);
}
