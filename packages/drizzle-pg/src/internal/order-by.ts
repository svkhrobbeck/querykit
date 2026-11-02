import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { normalizeSort, reportSkip, type Diagnostics } from "@querykitjs/core/internal";

import type { Sort } from "../types";
import { resolveColumn } from "./columns";

/**
 * Build an `ORDER BY` clause list. Falls back to `createdAt DESC`, then to
 * `id DESC`, when no valid sort is provided — a deterministic order so
 * pagination is stable (matches the mongoose adapter). `resolveColumn` matches
 * by JS property or DB column name, so `createdAt` also finds a `created_at` column.
 */
export function buildOrderBy<TTable extends AnyPgTable>(table: TTable, sort?: Sort<TTable>, diag?: Diagnostics): SQL[] {
  const orderBy: SQL[] = [];

  for (const { key, direction } of normalizeSort(sort as Sort | undefined, diag)) {
    const column = resolveColumn(table, key);
    if (column) orderBy.push(ordered(column, direction));
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key, reason: "unknown-key" });
  }

  if (orderBy.length > 0) return orderBy;

  const createdAt = resolveColumn(table, "createdAt");
  if (createdAt) return [ordered(createdAt, "desc")];

  // Deterministic tiebreaker so offset/keyset pagination is stable when neither a
  // sort nor a createdAt column exists (matches the mongoose adapter's `_id`
  // fallback — without it Postgres returns rows in arbitrary order).
  const id = resolveColumn(table, "id");
  return id ? [ordered(id, "desc")] : [];
}

/**
 * One ORDER BY term with MongoDB's NULL order on every adapter (task 021 B11): NULL
 * first on asc, last on desc. PostgreSQL's own default is the opposite on both.
 */
function ordered(column: AnyPgColumn, direction: "asc" | "desc"): SQL {
  return direction === "desc" ? sql`${column} desc nulls last` : sql`${column} asc nulls first`;
}
