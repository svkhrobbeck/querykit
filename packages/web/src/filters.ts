import { createFilters as coreCreateFilters, f } from "@querykitjs/core";

import type { FieldKey } from "./types";

/**
 * Filter shartlarini tipli, ergonomik quruvchilar to'plamini qaytaradi. Entity
 * tipiga bog'lasangiz, maydon nomlari uchun autocomplete ishlaydi.
 * `@querykitjs/core`ning builder'i ustidagi qobiq.
 *
 * @typeParam T - list qilinadigan entity tipi (`Buyer`, `Product`, ...).
 * @example
 * ```ts
 * const f = createFilters<Buyer>();
 * const filter = f.and(f.contains("buyerName", s), f.eq("status", st));
 * ```
 */
export function createFilters<T = Record<string, unknown>>() {
  return coreCreateFilters<FieldKey<T>>();
}

/** Tipsiz (entity'ga bog'lanmagan) filter quruvchilar — tez foydalanish uchun. */
export { f };
