import type * as Core from "@querykitjs/core";

import type { LooseFieldKey, QueryParams, SortDirection } from "./common";

export interface OffsetParams<TDoc = Record<string, unknown>> extends QueryParams<TDoc> {
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

export interface InfiniteParams<TDoc = Record<string, unknown>> extends QueryParams<TDoc> {
  limit?: number;
  offset?: number;
}
export type InfiniteMeta = Core.InfiniteMeta;
export interface InfiniteResult<T> {
  data: T[];
  meta: InfiniteMeta;
}

export interface CursorParams<TDoc = Record<string, unknown>> extends QueryParams<TDoc> {
  limit?: number;
  cursor?: string | null;
  /** Field the cursor walks over. Defaults to `"id"` (→ `_id`). */
  cursorKey?: LooseFieldKey<TDoc>;
  order?: SortDirection;
  direction?: "forward" | "backward";
}
export type CursorMeta = Core.CursorMeta;
export interface CursorResult<T> {
  data: T[];
  meta: CursorMeta;
}
