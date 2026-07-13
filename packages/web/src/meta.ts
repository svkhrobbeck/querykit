import type { Meta, RawMeta } from "./types";

/**
 * Server pagination meta'sini (snake_case) app formatiga (camelCase) map qiladi.
 * Bo'sh/undefined bo'lsa nol qiymatlar qaytaradi.
 *
 * @example
 * ```ts
 * const { data, meta } = (await http.post("/buyers/list", params)).data;
 * setMeta(mapMeta(meta)); // { totalPages, totalCount, currentPage, perPage }
 * ```
 */
export function mapMeta(raw?: RawMeta | null): Meta {
  return {
    totalPages: raw?.total_pages ?? 0,
    totalCount: raw?.total_items ?? 0,
    currentPage: raw?.current_page ?? 0,
    perPage: raw?.per_page ?? 0,
  };
}
