import type { Sort } from "../types";
import { reportSkip, type Diagnostics } from "./diagnostics";
import { resolveField, hasPath, type AnyModel } from "./fields";

/** A Mongo sort spec, e.g. `{ name: 1, createdAt: -1 }`. */
export type SortSpec = Record<string, 1 | -1>;

interface NormalizedSort {
  key: string;
  direction: "asc" | "desc";
}

/** Sort is always a `{ key, direction }[]` array → a flat normalized list (empty keys skipped). */
function normalize(sort?: Sort): NormalizedSort[] {
  if (!sort) return [];
  return sort.filter(item => item && item.key).map(item => ({ key: item.key, direction: item.direction ?? "asc" }));
}

/**
 * Build a Mongo sort spec from the sort input. Unknown fields are skipped; when
 * nothing valid remains, defaults to newest-first (`createdAt` desc, else `_id`).
 */
export function buildSort(model: AnyModel, sort?: Sort, diag?: Diagnostics): SortSpec {
  const spec: SortSpec = {};
  for (const item of normalize(sort)) {
    const field = resolveField(model, item.key);
    if (field) spec[field] = item.direction === "desc" ? -1 : 1;
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key: item.key, reason: "unknown-key" });
  }
  if (Object.keys(spec).length === 0) {
    if (hasPath(model, "createdAt")) spec.createdAt = -1;
    else spec._id = -1;
  }
  return spec;
}
