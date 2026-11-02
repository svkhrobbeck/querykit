/**
 * `@querykitjs/mongodb` — public types. The DSL, filter and meta types come from `@querykitjs/core`
 * (REQUIREMENTS R7); they are specialized here over a document type (`TDoc`), with the raw
 * escape hatch bound to a native Mongo filter object (branded by core `raw()`, R19).
 * The surface mirrors the other adapters, so one frontend request contract fits every backend.
 */
import type { ObjectId } from "mongodb";
import type * as Core from "@querykitjs/core";

/** Plain (lean) document type — what reads return. */
export type Row<TDoc> = TDoc;
/**
 * Insertable shape — the document minus auto-managed fields (`_id`, timestamps),
 * with the rest optional (the zod schema owns `required` and defaults; that
 * metadata isn't in the doc type, so unlike drizzle-pg we can't mark it here).
 */
export type Insert<TDoc> = Partial<Omit<TDoc, "_id" | "createdAt" | "updatedAt">>;
/** Value accepted anywhere an id is expected. */
export type Id = string | number | ObjectId;

/**
 * Raw Mongo predicate fragment — the filter escape hatch (`TRaw`), a plain Mongo query
 * object. Accepted only when server code brands it with core `raw()` (R19).
 */
export type RawFilter<_TDoc = unknown> = Record<string, unknown>;

/** Union of a document's field keys. */
export type FieldKey<TDoc> = keyof TDoc & string;

/**
 * A field key that also accepts any `string`. Filter/sort keys arrive from the
 * wire as plain strings and the adapter skips the ones it cannot resolve, so a
 * validated payload can go straight into a repository call with no `as` cast.
 * Autocomplete still suggests the document's real fields.
 */
export type LooseFieldKey<TDoc> = Core.LooseKey<FieldKey<TDoc>>;

/* --------------------------------- filters -------------------------------- */
/* DSL from `@querykitjs/core`, specialized: TKey = field key, TRaw = Mongo filter. */

export type FilterOperator = Core.FilterOperator;
export type FilterScalar = Core.FilterScalar;
export type FilterValue = Core.FilterValue;

export type FieldCondition<TDoc = Record<string, unknown>> = Core.FieldCondition<LooseFieldKey<TDoc>>;
export type AndGroup<TDoc = Record<string, unknown>> = Core.AndGroup<LooseFieldKey<TDoc>, RawFilter<TDoc>>;
export type OrGroup<TDoc = Record<string, unknown>> = Core.OrGroup<LooseFieldKey<TDoc>, RawFilter<TDoc>>;
export type NotGroup<TDoc = Record<string, unknown>> = Core.NotGroup<LooseFieldKey<TDoc>, RawFilter<TDoc>>;
export type FilterNode<TDoc = Record<string, unknown>> = Core.FilterNode<LooseFieldKey<TDoc>, RawFilter<TDoc>>;
export type Filter<TDoc = Record<string, unknown>> = Core.Filter<LooseFieldKey<TDoc>, RawFilter<TDoc>>;

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = Core.SortDirection;

/** One sort field by typed field key (`{ key, direction }`) — autocomplete. */
export type SortItem<TDoc = Record<string, unknown>> = Core.SortItem<LooseFieldKey<TDoc>>;

/**
 * Sort — **always an array** of `{ key, direction }` (multi-field). This is the
 * exact shape the querykit frontend sends (`@querykitjs/web` decodes its
 * `sortType=-createdAt,id` URL string into it).
 */
export type Sort<TDoc = Record<string, unknown>> = SortItem<TDoc>[];

/* ---------------------------- selection / params -------------------------- */

export type ColumnSelection<TDoc = Record<string, unknown>> = Partial<Record<FieldKey<TDoc>, boolean>>;

/** Relations (`with`): refused in this version unless the repository lists `relations` — no `$lookup` yet (task 017 L3). */
export type WithRelations = Record<string, unknown>;

export interface QueryParams<TDoc = Record<string, unknown>> {
  filter?: Filter<TDoc>;
  sort?: Sort<TDoc>;
  columns?: ColumnSelection<TDoc>;
  with?: WithRelations;
  /** Include soft-deleted docs (schemas with a `deletedAt` path). */
  withDeleted?: boolean;
}

/** Equality scope applied to every operation of a scoped repository. */
export type Scope<TDoc = Record<string, unknown>> = Core.Scope<FieldKey<TDoc>>;

export interface ByIdParams<TDoc = Record<string, unknown>> extends QueryParams<TDoc> {
  /** Field to match against the id. Defaults to `"id"` (→ `_id`). */
  idKey?: LooseFieldKey<TDoc>;
}

/* --------------------------------- writes --------------------------------- */

/** Options for {@link Repository.upsert} / {@link Repository.upsertMany}. */
export type UpsertOptions<TDoc = Record<string, unknown>> = Core.UpsertOptions<FieldKey<TDoc>, Insert<TDoc>>;

/* ------------------------------ aggregation ------------------------------- */

/** Aggregate query specification (`count`/`sum`/`avg`/`min`/`max` + `groupBy`). */
export type AggregateSpec<TDoc = Record<string, unknown>> = Core.AggregateSpec<FieldKey<TDoc>, Filter<TDoc>>;

/** One aggregated result row (group fields + aggregate values). */
export type AggregateRow = Record<string, unknown>;
