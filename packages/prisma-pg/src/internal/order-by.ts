import type { Sort, SortDirection } from "../types";
import { reportSkip, type Diagnostics } from "./diagnostics";
import { resolveField, type ModelMeta } from "./fields";

/** A Prisma `orderBy` list, e.g. `[{ name: "asc" }, { createdAt: "desc" }]`. */
export type OrderBy = Array<Record<string, SortDirection>>;

interface NormalizedSort {
  key: string;
  direction: SortDirection;
}

function normalize(sort?: Sort): NormalizedSort[] {
  if (!sort) return [];
  return sort.filter(item => item && item.key).map(item => ({ key: item.key, direction: item.direction ?? "asc" }));
}

/**
 * Build an `orderBy` list. Unknown keys are skipped; when no valid sort remains,
 * falls back to `createdAt desc`, then to `<id> desc` — a deterministic order so
 * pagination is stable (identical to the drizzle-pg and mongoose adapters;
 * without it Postgres returns rows in arbitrary order).
 */
export function buildOrderBy(meta: ModelMeta, sort?: Sort, diag?: Diagnostics): OrderBy {
  const orderBy: OrderBy = [];

  for (const { key, direction } of normalize(sort)) {
    const field = resolveField(meta, key);
    if (field) orderBy.push({ [field]: direction });
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key, reason: "unknown-key" });
  }

  if (orderBy.length > 0) return orderBy;

  if (meta.hasCreatedAt) return [{ createdAt: "desc" }];
  return meta.idField ? [{ [meta.idField]: "desc" }] : [];
}
