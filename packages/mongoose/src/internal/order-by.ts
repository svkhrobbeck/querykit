import type { NamedSort, Sort, SortItem } from "../types";
import { resolveField, hasPath, type AnyModel } from "./fields";

/** A Mongo sort spec, e.g. `{ name: 1, createdAt: -1 }`. */
export type SortSpec = Record<string, 1 | -1>;

interface NormalizedSort {
  key: string;
  direction: "asc" | "desc";
}

/** A single `{ key }` or `{ name }` item → normalized (skips empty). */
function normalizeItem(item: SortItem | NamedSort): NormalizedSort | undefined {
  if ("key" in item && item.key) return { key: item.key, direction: item.direction ?? "asc" };
  if ("name" in item && item.name) return { key: item.name, direction: item.direction ?? "asc" };
  return undefined;
}

/** Normalize any accepted sort form ({name} / {key} / array) to a flat list. */
function normalize(sort?: Sort): NormalizedSort[] {
  if (!sort) return [];
  if (Array.isArray(sort)) return sort.map(normalizeItem).filter((x): x is NormalizedSort => x !== undefined);
  const single = normalizeItem(sort);
  return single ? [single] : [];
}

/**
 * Build a Mongo sort spec from the sort input. Unknown fields are skipped; when
 * nothing valid remains, defaults to newest-first (`createdAt` desc, else `_id`).
 */
export function buildSort(model: AnyModel, sort?: Sort): SortSpec {
  const spec: SortSpec = {};
  for (const item of normalize(sort)) {
    const field = resolveField(model, item.key);
    if (field) spec[field] = item.direction === "desc" ? -1 : 1;
  }
  if (Object.keys(spec).length === 0) {
    if (hasPath(model, "createdAt")) spec.createdAt = -1;
    else spec._id = -1;
  }
  return spec;
}
