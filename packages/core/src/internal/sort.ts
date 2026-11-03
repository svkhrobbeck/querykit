import type { Sort, SortDirection } from "../types";

import { reportSkip, type Diagnostics } from "./diagnostics";

export interface NormalizedSortItem {
  key: string;
  direction: SortDirection;
}

/**
 * The wire `sort` array with a direction on every item. An item without a `key`
 * (`null`, `{}`) is dropped — sort comes from the client, and a malformed item
 * must not crash the query — and, with `diag`, reported as `invalid-value` on
 * `site: "sort"` (a `QueryKitError` under strict).
 */
export function normalizeSort(sort?: Sort, diag?: Diagnostics): NormalizedSortItem[] {
  if (!sort) return [];
  const items: NormalizedSortItem[] = [];
  for (const item of sort) {
    if (item && typeof item.key === "string" && item.key) items.push({ key: item.key, direction: item.direction ?? "asc" });
    else reportSkip(diag, { site: "sort", key: "", reason: "invalid-value" });
  }
  return items;
}
