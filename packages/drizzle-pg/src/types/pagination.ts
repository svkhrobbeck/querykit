import type { AnyPgTable } from "drizzle-orm/pg-core";
import type * as Core from "@querykitjs/core";

import type { LooseColumnKey, QueryParams, SortDirection } from "./common";

/** Offset (classic page-based) pagination. */
export interface OffsetParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  page?: number;
  perPage?: number;
}

export type OffsetMeta = Core.OffsetMeta;

export interface OffsetResult<T> {
  data: T[];
  meta: OffsetMeta;
}

/** Offset-window pagination tuned for infinite scroll (limit + offset). */
export interface InfiniteParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  limit?: number;
  offset?: number;
}

export type InfiniteMeta = Core.InfiniteMeta;

export interface InfiniteResult<T> {
  data: T[];
  meta: InfiniteMeta;
}

/** Keyset (cursor) pagination — stable under inserts, ideal for feeds. */
export interface CursorParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  limit?: number;
  /** Opaque cursor token from a previous result's meta. */
  cursor?: string | null;
  /** Column the cursor walks over. Must be unique & sortable. Defaults to `"id"`. */
  cursorKey?: LooseColumnKey<TTable>;
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
