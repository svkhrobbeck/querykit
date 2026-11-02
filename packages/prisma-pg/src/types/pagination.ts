import type * as Core from "@querykitjs/core";

import type { AnyDelegate, LooseFieldKey, QueryParams, SortDirection } from "./common";

/** Offset (classic page-based) pagination. */
export interface OffsetParams<TDelegate = AnyDelegate> extends QueryParams<TDelegate> {
  page?: number;
  perPage?: number;
  /** `false` — no count query: `perPage + 1` rows are read, `total_items` / `total_pages` are `null` (task 013). Default `true`. */
  withTotal?: boolean;
}

export type OffsetMeta = Core.OffsetMeta;

export interface OffsetResult<T> {
  data: T[];
  meta: OffsetMeta;
}

/** Offset-window pagination tuned for infinite scroll (limit + offset). */
export interface InfiniteParams<TDelegate = AnyDelegate> extends QueryParams<TDelegate> {
  limit?: number;
  offset?: number;
}

export type InfiniteMeta = Core.InfiniteMeta;

export interface InfiniteResult<T> {
  data: T[];
  meta: InfiniteMeta;
}

/** Keyset (cursor) pagination — stable under inserts, ideal for feeds. */
export interface CursorParams<TDelegate = AnyDelegate> extends QueryParams<TDelegate> {
  limit?: number;
  /** Opaque cursor token from a previous result's meta. */
  cursor?: string | null;
  /** Field the cursor walks over. Must be unique & sortable. Defaults to `"id"`. */
  cursorKey?: LooseFieldKey<TDelegate>;
  /** Stable order of the dataset. Defaults to `"asc"`. */
  order?: SortDirection;
  /** Navigation relative to the cursor. Defaults to `"forward"`. */
  direction?: "forward" | "backward";
}

export type CursorMeta = Core.CursorMeta;

export interface CursorResult<T> {
  data: T[];
  meta: CursorMeta;
}
