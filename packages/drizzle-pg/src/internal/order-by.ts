import { asc, desc, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { Sort, SortDirection } from "../types";
import { resolveColumn } from "./columns";

interface NormalizedSort {
  key: string;
  direction: SortDirection;
}

/**
 * Build an `ORDER BY` clause list. Falls back to `created_at DESC` (or
 * `createdAt`) when no valid sort is provided, matching db-service behaviour.
 */
export function buildOrderBy<TTable extends AnyPgTable>(table: TTable, sort?: Sort<TTable>): SQL[] {
  const orderBy: SQL[] = [];

  for (const { key, direction } of normalize(sort as Sort | undefined)) {
    const column = resolveColumn(table, key);
    if (column) orderBy.push(direction === "desc" ? desc(column) : asc(column));
  }

  if (orderBy.length > 0) return orderBy;

  const createdAt = resolveColumn(table, "created_at") ?? resolveColumn(table, "createdAt");
  return createdAt ? [desc(createdAt)] : [];
}

function normalize(sort?: Sort): NormalizedSort[] {
  if (!sort) return [];

  if (Array.isArray(sort)) {
    return sort.map(item => ({
      key: item.key,
      direction: item.direction ?? "asc",
    }));
  }

  if ("key" in sort) {
    return [{ key: sort.key, direction: sort.direction ?? "asc" }];
  }

  // Legacy { name, direction } shape.
  if (sort.name) {
    return [{ key: sort.name, direction: sort.direction ?? "asc" }];
  }

  return [];
}
