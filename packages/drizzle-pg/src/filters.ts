import type { SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { createFilters as coreCreateFilters, f } from "@querykitjs/core";

import type { ColumnKey } from "./types";

/**
 * Filter shartlarini tipli, ergonomik quruvchilar to'plamini qaytaradi (jadval
 * ustunlari uchun autocomplete). `@querykitjs/core`ning builder'i ustidagi qobiq —
 * kalit tipi jadval ustuni, raw tugun tipi Drizzle `SQL`.
 *
 * @typeParam TTable - filter quriladigan Drizzle jadval tipi (`typeof users`).
 * @example
 * ```ts
 * const uf = createFilters<typeof users>();
 * await usersRepository.findAll({
 *   filter: uf.and(uf.eq("status", "active"), uf.gte("age", 18)),
 * });
 * ```
 */
export function createFilters<TTable extends AnyPgTable>() {
  return coreCreateFilters<ColumnKey<TTable>, SQL>();
}

/**
 * Tipsiz (ustunga bog'lanmagan) filter yordamchilari — tez foydalanish uchun.
 * Ustun-nomi autocomplete kerak bo'lsa {@link createFilters} ni jadval bilan chaqiring.
 */
export { f };
