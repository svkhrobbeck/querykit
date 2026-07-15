import { createFilters as coreCreateFilters, f } from "@querykitjs/core";

import type { FieldKey, RawFilter } from "./types";

/**
 * Typed, ergonomic filter builders for a document type (field-name autocomplete).
 * A thin wrapper over `@querykitjs/core`'s builder — the key type is the model's
 * field key, the raw escape-hatch is a native Mongo `QueryFilter`.
 *
 * @example
 * ```ts
 * const uf = createFilters<IUser>();
 * await usersRepo.findAll({ filter: uf.and(uf.eq("status", "active"), uf.gte("age", 18)) });
 * ```
 */
export function createFilters<TDoc>() {
  return coreCreateFilters<FieldKey<TDoc>, RawFilter<TDoc>>();
}

/** Untyped filter helpers for quick use. */
export { f };
