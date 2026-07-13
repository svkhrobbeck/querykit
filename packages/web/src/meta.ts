import type { CursorMeta, InfiniteMeta, Meta, RawCursorMeta, RawInfiniteMeta, RawMeta } from "./types";

/**
 * **Offset** (list) meta'sini snake_case → camelCase map qiladi.
 *
 * @example
 * ```ts
 * const { data, meta } = (await http.post("/buyers/list", params)).data;
 * setMeta(mapMeta(meta)); // { totalPages, totalCount, currentPage, perPage, hasNext, hasPrev }
 * ```
 */
export function mapMeta(raw?: RawMeta | null): Meta {
  return {
    totalPages: raw?.total_pages ?? 0,
    totalCount: raw?.total_items ?? 0,
    currentPage: raw?.current_page ?? 0,
    perPage: raw?.per_page ?? 0,
    hasNext: raw?.has_next ?? false,
    hasPrev: raw?.has_prev ?? false,
  };
}

/**
 * **Infinite-scroll** meta'sini map qiladi.
 *
 * @example
 * ```ts
 * const m = mapInfiniteMeta(res.meta); // { limit, offset, count, hasMore, nextOffset }
 * if (m.hasMore) load(m.nextOffset);
 * ```
 */
export function mapInfiniteMeta(raw?: RawInfiniteMeta | null): InfiniteMeta {
  return {
    limit: raw?.limit ?? 0,
    offset: raw?.offset ?? 0,
    count: raw?.count ?? 0,
    hasMore: raw?.has_more ?? false,
    nextOffset: raw?.next_offset ?? null,
  };
}

/**
 * **Cursor** (keyset) meta'sini map qiladi.
 *
 * @example
 * ```ts
 * const m = mapCursorMeta(res.meta); // { limit, hasNext, hasPrev, nextCursor, prevCursor }
 * ```
 */
export function mapCursorMeta(raw?: RawCursorMeta | null): CursorMeta {
  return {
    limit: raw?.limit ?? 0,
    hasNext: raw?.has_next ?? false,
    hasPrev: raw?.has_prev ?? false,
    nextCursor: raw?.next_cursor ?? null,
    prevCursor: raw?.prev_cursor ?? null,
  };
}
