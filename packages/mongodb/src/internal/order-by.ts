import { normalizeSort, reportSkip, type Diagnostics } from "@querykitjs/core/internal";

import type { Sort } from "../types";
import { resolveField, type DocShape } from "./fields";

/** A Mongo sort spec, e.g. `{ name: 1, createdAt: -1 }`. */
export type SortSpec = Record<string, 1 | -1>;

/**
 * Build a Mongo sort spec from the sort input. Unknown fields are skipped; when
 * nothing valid remains, defaults to newest-first (`createdAt` desc, else `_id`).
 */
export function buildSort(
  shape: DocShape,
  sort?: Sort,
  diag?: Diagnostics,
  createdAt: string | undefined = resolveField(shape, "createdAt") ? "createdAt" : undefined,
): SortSpec {
  const spec: SortSpec = {};
  for (const item of normalizeSort(sort, diag)) {
    const field = resolveField(shape, item.key);
    if (field) spec[field] = item.direction === "desc" ? -1 : 1;
    // An unknown sort key falls back to the default order, so the list looks
    // "unsorted" to the caller with nothing in the log to explain it.
    else reportSkip(diag, { site: "sort", key: item.key, reason: "unknown-key" });
  }
  if (Object.keys(spec).length === 0) {
    if (createdAt) spec[createdAt] = -1;
    else spec._id = -1;
  }
  return spec;
}

/**
 * `buildSort` for a paged read: `_id` ends the order, in the first key's direction, so equal
 * values cannot repeat or skip a document between pages.
 */
export function buildListSort(shape: DocShape, sort?: Sort, diag?: Diagnostics, createdAt?: string): SortSpec {
  const spec = buildSort(shape, sort, diag, createdAt);
  return "_id" in spec ? spec : { ...spec, _id: Object.values(spec)[0]! };
}
