import { asc, desc, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { normalizeSort, reportSkip, type Diagnostics } from "@querykitjs/core/internal";

import type { Sort } from "../types";
import { resolveColumn } from "./columns";

type OrderTerm = { column: AnyPgColumn; direction: "asc" | "desc" };

/**
 * Build an `ORDER BY` clause list. Falls back to `createdAt DESC`, then to
 * `id DESC`, when no valid sort is provided — a deterministic order so
 * pagination is stable (matches the mongoose adapter). `resolveColumn` matches
 * by JS property or DB column name, so `createdAt` also finds a `created_at` column.
 */
export function buildOrderBy<TTable extends AnyPgTable>(
  table: TTable,
  sort?: Sort<TTable>,
  diag?: Diagnostics,
  createdAt: AnyPgColumn | undefined = resolveColumn(table, "createdAt"),
): SQL[] {
  return orderTerms(table, sort, diag, createdAt).map(ordered);
}

/**
 * `buildOrderBy` for a paged read: the primary key ends the order, in the first key's
 * direction, so equal values cannot repeat or skip a row between pages. Plain `asc` / `desc`
 * like `findCursor`: a primary key has no NULLs to place, and `asc nulls first` would not
 * match its index.
 */
export function buildListOrderBy<TTable extends AnyPgTable>(
  table: TTable,
  primaryKey: readonly AnyPgColumn[],
  sort?: Sort<TTable>,
  diag?: Diagnostics,
  createdAt: AnyPgColumn | undefined = resolveColumn(table, "createdAt"),
): SQL[] {
  const terms = orderTerms(table, sort, diag, createdAt);
  const tieBreak = terms[0]?.direction === "asc" ? asc : desc;
  const missing = primaryKey.filter(column => !terms.some(term => term.column === column));
  return [...terms.map(ordered), ...missing.map(column => tieBreak(column))];
}

function orderTerms<TTable extends AnyPgTable>(
  table: TTable,
  sort: Sort<TTable> | undefined,
  diag: Diagnostics | undefined,
  createdAt: AnyPgColumn | undefined,
) {
  const terms: OrderTerm[] = [];

  for (const { key, direction } of normalizeSort(sort as Sort | undefined, diag)) {
    const column = resolveColumn(table, key);
    if (column) terms.push({ column, direction });
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key, reason: "unknown-key" });
  }

  if (terms.length > 0) return terms;

  if (createdAt) return [{ column: createdAt, direction: "desc" } satisfies OrderTerm];

  // Deterministic tiebreaker so offset/keyset pagination is stable when neither a
  // sort nor a createdAt column exists (matches the mongoose adapter's `_id`
  // fallback — without it Postgres returns rows in arbitrary order).
  const id = resolveColumn(table, "id");
  return id ? [{ column: id, direction: "desc" } satisfies OrderTerm] : [];
}

/**
 * One ORDER BY term with MongoDB's NULL order on every adapter: NULL
 * first on asc, last on desc. PostgreSQL's own default is the opposite on both.
 */
function ordered({ column, direction }: OrderTerm): SQL {
  return direction === "desc" ? sql`${column} desc nulls last` : sql`${column} asc nulls first`;
}
