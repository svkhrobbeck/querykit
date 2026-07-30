import { createFilters as coreCreateFilters, f } from "@querykitjs/core";

import type { FieldKey, RawWhere } from "./types";

/**
 * Typed, ergonomic filter builders for a model (field-name autocomplete). A thin
 * wrapper over `@querykitjs/core`'s builder — the key type is the model's field
 * key, the raw escape hatch is that model's native `WhereInput`.
 *
 * @example
 * ```ts
 * const uf = createFilters<typeof prisma.user>();
 * await usersRepository.findAll({ filter: uf.and(uf.eq("status", "active"), uf.gte("age", 18)) });
 * ```
 */
export function createFilters<TDelegate>() {
  return coreCreateFilters<FieldKey<TDelegate>, RawWhere<TDelegate>>();
}

/** Untyped filter helpers for quick use. */
export { f };
