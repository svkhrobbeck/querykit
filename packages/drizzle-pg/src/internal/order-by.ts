import { asc, desc, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { Sort, SortDirection } from "../types";
import { resolveColumn } from "./columns";
import { reportSkip, type Diagnostics } from "./diagnostics";

interface NormalizedSort {
  key: string;
  direction: SortDirection;
}

/**
 * Build an `ORDER BY` clause list. Falls back to `createdAt DESC`, then to
 * `id DESC`, when no valid sort is provided — a deterministic order so
 * pagination is stable (matches the mongoose adapter). `resolveColumn` matches
 * by JS property or DB column name, so `createdAt` also finds a `created_at` column.
 */
export function buildOrderBy<TTable extends AnyPgTable>(table: TTable, sort?: Sort<TTable>, diag?: Diagnostics): SQL[] {
  const orderBy: SQL[] = [];

  for (const { key, direction } of normalize(sort as Sort | undefined)) {
    const column = resolveColumn(table, key);
    if (column) orderBy.push(direction === "desc" ? desc(column) : asc(column));
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key, reason: "unknown-key" });
  }

  if (orderBy.length > 0) return orderBy;

  const createdAt = resolveColumn(table, "createdAt");
  if (createdAt) return [desc(createdAt)];

  // Deterministic tiebreaker so offset/keyset pagination is stable when neither a
  // sort nor a createdAt column exists (matches the mongoose adapter's `_id`
  // fallback — without it Postgres returns rows in arbitrary order).
  const id = resolveColumn(table, "id");
  return id ? [desc(id)] : [];
}

function normalize(sort?: Sort): NormalizedSort[] {
  if (!sort) return [];
  return sort.map(item => ({ key: item.key, direction: item.direction ?? "asc" }));
}
