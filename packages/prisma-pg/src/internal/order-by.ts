import { normalizeSort, reportSkip, type Diagnostics } from "@querykitjs/core/internal";

import type { Sort, SortDirection } from "../types";
import { resolveField, type ModelMeta } from "./fields";

/** A Prisma `orderBy` list, e.g. `[{ name: "asc" }, { createdAt: "desc" }]`. */
export type OrderBy = Array<Record<string, SortDirection | { sort: SortDirection; nulls: "first" | "last" }>>;

/**
 * Build an `orderBy` list. Unknown keys are skipped; when no valid sort remains,
 * falls back to `createdAt desc`, then to `<id> desc` — a deterministic order so
 * pagination is stable (identical to the drizzle-pg and mongoose adapters;
 * without it Postgres returns rows in arbitrary order).
 */
export function buildOrderBy(
  meta: ModelMeta,
  sort?: Sort,
  diag?: Diagnostics,
  createdAt: string | undefined = meta.hasCreatedAt ? "createdAt" : undefined,
): OrderBy {
  const orderBy: OrderBy = [];

  for (const { key, direction } of normalizeSort(sort, diag)) {
    const field = resolveField(meta, key);
    // MongoDB's NULL order on every adapter — first on asc, last on desc.
    // Prisma takes `nulls` only on an optional field; a required one has no NULLs to place.
    if (field)
      orderBy.push({
        [field]:
          meta.fields.get(field)?.isRequired === false ? { sort: direction, nulls: direction === "asc" ? ("first" as const) : ("last" as const) } : direction,
      });
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key, reason: "unknown-key" });
  }

  if (orderBy.length > 0) return orderBy;

  if (createdAt) return [{ [createdAt]: "desc" }];
  return meta.idField ? [{ [meta.idField]: "desc" }] : [];
}
