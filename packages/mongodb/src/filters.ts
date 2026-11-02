import { createFilters as coreCreateFilters, f } from "@querykitjs/core";

import type { FieldKey, RawFilter } from "./types/common";

/**
 * Typed filter builders for a document type (field-name autocomplete). A thin wrapper over
 * `@querykitjs/core`'s builder — the key type is the document's field key, the raw escape
 * hatch is a native Mongo filter (brand it with core `raw()`).
 *
 * @example
 * ```ts
 * const uf = createFilters<User>();
 * await users.findAll({ filter: uf.and(uf.eq("status", "active"), uf.gte("age", 18)) });
 * ```
 */
// The explicit return type keeps `dist/index.d.ts` free of an inferred expansion.
export function createFilters<TDoc>(): ReturnType<typeof coreCreateFilters<FieldKey<TDoc>, RawFilter<TDoc>>> {
  return coreCreateFilters<FieldKey<TDoc>, RawFilter<TDoc>>();
}

/** Untyped filter helpers for quick use. */
export { f };
