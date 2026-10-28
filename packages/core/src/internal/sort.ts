import type { Sort, SortDirection } from "../types";

export interface NormalizedSortItem {
  key: string;
  direction: SortDirection;
}

/**
 * The wire `sort` array with a direction on every item. Items without a `key`
 * (`null`, `{}`) are dropped — sort comes from the client, and a malformed item
 * must not crash the query.
 */
export function normalizeSort(sort?: Sort): NormalizedSortItem[] {
  if (!sort) return [];
  return sort.filter(item => item && item.key).map(item => ({ key: item.key, direction: item.direction ?? "asc" }));
}
