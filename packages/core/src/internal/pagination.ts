/**
 * Page-size clamping and the three pagination metas, computed once for every
 * adapter so `total_pages`, `has_more`, `next_cursor` … mean the same thing on
 * all of them. Adapters only fetch rows; these functions turn rows into a page.
 */
import type { CursorMeta, InfiniteMeta, OffsetMeta } from "../types";

import { encodeCursorToken } from "./cursor";

/** A requested page size, defaulted, truncated, at least 1 and at most `max`. */
export function clampPageSize(requested: number | undefined, fallback: number, max: number): number {
  return Math.min(max, Math.max(1, Math.trunc(requested ?? fallback)));
}

/** A requested page number: an integer, at least 1. */
export function clampPage(requested: number | undefined): number {
  return Math.max(1, Math.trunc(requested ?? 1));
}

/** A requested offset: an integer, at least 0. */
export function clampOffset(requested: number | undefined): number {
  return Math.max(0, Math.trunc(requested ?? 0));
}

export function offsetMeta(page: number, perPage: number, totalItems: number): OffsetMeta {
  const totalPages = Math.ceil(totalItems / perPage);
  return {
    total_items: totalItems,
    total_pages: totalPages,
    current_page: page,
    per_page: perPage,
    has_next: page < totalPages,
    has_prev: page > 1,
  };
}

/**
 * `withTotal: false` (task 013): rows fetched with `perPage + 1` and no count →
 * the page and its meta; the extra row only signals `has_next`, totals are `null`.
 */
export function offsetPageWithoutTotal<T>(rows: readonly T[], page: number, perPage: number): { data: T[]; meta: OffsetMeta } {
  const hasNext = rows.length > perPage;
  return {
    data: hasNext ? rows.slice(0, perPage) : [...rows],
    meta: { total_items: null, total_pages: null, current_page: page, per_page: perPage, has_next: hasNext, has_prev: page > 1 },
  };
}

/** Rows fetched with `limit + 1` → the page and its meta (the extra row only signals `has_more`). */
export function infinitePage<T>(rows: readonly T[], limit: number, offset: number): { data: T[]; meta: InfiniteMeta } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : [...rows];
  return {
    data,
    meta: { limit, offset, count: data.length, has_more: hasMore, next_offset: hasMore ? offset + limit : null },
  };
}

export interface CursorPageOptions {
  limit: number;
  direction: "forward" | "backward";
  /** A cursor was supplied (the request continues from a previous page). */
  hasCursor: boolean;
  /** The row field the tokens are read from. */
  cursorField: string;
  /** The primary-key field — the tie-break value in every token (task 012). */
  idField: string;
  /** Signs the tokens (registry `cursorSecret`). */
  secret?: string;
}

/**
 * Rows fetched with `limit + 1` in query order → the page in display order and
 * its meta. A backward page is fetched reversed and flipped back here.
 */
export async function cursorPage<T extends Record<string, unknown>>(rows: readonly T[], options: CursorPageOptions): Promise<{ data: T[]; meta: CursorMeta }> {
  const { limit, direction, hasCursor, cursorField, idField, secret } = options;
  const hasExtra = rows.length > limit;
  let data = hasExtra ? rows.slice(0, limit) : [...rows];
  if (direction === "backward") data = data.reverse();

  const first = data[0];
  const last = data[data.length - 1];
  const hasNext = direction === "forward" ? hasExtra : hasCursor;
  const hasPrev = direction === "forward" ? hasCursor : hasExtra;

  return {
    data,
    meta: {
      limit,
      has_next: hasNext,
      has_prev: hasPrev,
      next_cursor: hasNext && last ? await encodeCursorToken({ k: last[cursorField], id: last[idField] }, secret) : null,
      prev_cursor: hasPrev && first ? await encodeCursorToken({ k: first[cursorField], id: first[idField] }, secret) : null,
    },
  };
}
