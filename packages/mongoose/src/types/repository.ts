import type * as Core from "@querykitjs/core";
import type { Model } from "mongoose";

import type {
  AggregateRow,
  AggregateSpec,
  ByIdParams,
  ColumnSelection,
  FieldKey,
  Filter,
  Id,
  Insert,
  QueryParams,
  Row,
  Scope,
  UpsertOptions,
  WithRelations,
} from "./common";
import type { CursorParams, CursorResult, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult } from "./pagination";

/* ------------------------------- relations -------------------------------- */

/** Map of relation field name → the Mongoose model it refers to. */
export type RelationMap = Record<string, Model<any>>;

type DocOf<M> = M extends Model<infer T> ? T : never;

/** Resolve a {@link RelationMap} to `{ field: <its document type> }`. */
export type RelationDocs<TRel extends RelationMap> = { [K in keyof TRel]: DocOf<TRel[K]> };

/**
 * Options for `registry.repository(model, options)`.
 *
 * Philosophy: the guard lives in the **repository**, not the route — `scope`
 * (RBAC) already worked that way and projection joins it. Same names and same
 * semantics as the drizzle-pg adapter's `RepositoryOptions`.
 *
 * ⚠️ `forcedColumns`/`allowedColumns` affect **read** methods only
 * (`findAll`/`findOne`/`findById`/`findList`/`findInfinite`/`findCursor` +
 * `aggregate`). Write methods (`create`, `upsert`, `updateById`, `softDelete`, …)
 * return the full `Row` by type contract — trimming it at runtime would make the
 * type a lie. Re-read with `findById`, or map it yourself, before handing a write
 * result to a client.
 */
export interface RepositoryOptions<TDoc = any, TRel extends RelationMap = RelationMap> {
  /** Declare populatable relations (field → model) so `with` types the result. */
  relations?: TRel;
  /** Constant equality filter added to every read/write (RBAC / multi-tenancy). */
  scope?: Scope<TDoc>;
  /**
   * Forced projection — the client's `columns` is **ignored entirely**. Keeps a
   * password out of a `users` response without a `{ ...params, columns }` trick in
   * every route. Must select at least one field, else building the repository throws.
   */
  forcedColumns?: ColumnSelection<TDoc>;
  /**
   * Allowlist — the client's `columns` is intersected with it. An empty
   * intersection yields the allowlist itself, **never** the full document.
   * An empty array throws (a projection selecting nothing means "everything").
   */
  allowedColumns?: readonly FieldKey<TDoc>[];
  /**
   * Paths a client may filter by, and the operators for each (`"*"` — all). A path
   * not listed ⇒ `reason: "forbidden-key"`, an operator not listed ⇒
   * `"forbidden-operator"` — a `QueryKitError` whatever `strict` says, before the
   * query runs. **When not given** — `allowedColumns` (else the `forcedColumns` keys,
   * else only `_id`) with `"="` and `"in"` only. `aggregate` paths come from this list too.
   */
  filterable?: Core.Filterable<FieldKey<TDoc> | "_id">;
  /**
   * Paths a client may sort (and use as `cursorKey`) by. When not given — `_id` and
   * `createdAt` (when the schema has it). Anything else ⇒ `reason: "forbidden-key"`.
   */
  sortable?: readonly (FieldKey<TDoc> | "_id")[];
  /** Request limits for this repository — over the registry's `limits`. */
  limits?: Partial<Core.QueryLimits>;
}

/* --------------------------- result-type inference ------------------------ */
/* `columns` narrows the row via Pick; `with` retypes populated relation fields
 * from the repository's declared relations (`TRel`). */

type TrueKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

type NarrowColumns<TDoc, TColumns> =
  TColumns extends ColumnSelection<TDoc> ? ([TrueKeys<TColumns>] extends [never] ? TDoc : Pick<TDoc, TrueKeys<TColumns> & keyof TDoc>) : TDoc;

/** Relation fields selected in `with` (`true`) that exist in the repo's `TRel`. */
type PopulatedFields<TRel, TWith> = Pick<TRel, Extract<TrueKeys<TWith>, keyof TRel>>;

/** Replace populated relation fields (e.g. `author: ObjectId` → `author: IUser`). */
type ApplyWith<TRow, TRel, TWith> = TWith extends object
  ? [Extract<TrueKeys<TWith>, keyof TRel>] extends [never]
    ? TRow
    : Omit<TRow, keyof PopulatedFields<TRel, TWith>> & PopulatedFields<TRel, TWith>
  : TRow;

/** The result row for a given `columns` selection and populated `with`. */
export type Result<TDoc, TRel, TColumns, TWith = undefined> = ApplyWith<NarrowColumns<TDoc, TColumns>, TRel, TWith>;

/** Params whose `columns`/`with` are typed to the passed selection (drives inference). */
type Params<TBase, TColumns, TWith> = Omit<TBase, "columns" | "with"> & { columns?: TColumns; with?: TWith };

/* ------------------------------- repository ------------------------------- */

/**
 * Model-scoped repository. Read methods infer their
 * return type from the `columns` argument, mirroring `@querykitjs/drizzle-pg`.
 */
export interface Repository<TDoc = Record<string, unknown>, TRel extends Record<string, unknown> = Record<never, never>> {
  /** The underlying Mongoose model — escape hatch for custom queries. */
  readonly model: Model<TDoc>;

  findAll<const TColumns extends ColumnSelection<TDoc> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<QueryParams<TDoc>, TColumns, TWith>,
  ): Promise<Result<TDoc, TRel, TColumns, TWith>[]>;

  findOne<const TColumns extends ColumnSelection<TDoc> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<QueryParams<TDoc>, TColumns, TWith>,
  ): Promise<Result<TDoc, TRel, TColumns, TWith> | undefined>;

  findById<const TColumns extends ColumnSelection<TDoc> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    id: Id,
    params?: Params<ByIdParams<TDoc>, TColumns, TWith>,
  ): Promise<Result<TDoc, TRel, TColumns, TWith> | undefined>;

  findList<const TColumns extends ColumnSelection<TDoc> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<OffsetParams<TDoc>, TColumns, TWith>,
  ): Promise<OffsetResult<Result<TDoc, TRel, TColumns, TWith>>>;

  findInfinite<const TColumns extends ColumnSelection<TDoc> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<InfiniteParams<TDoc>, TColumns, TWith>,
  ): Promise<InfiniteResult<Result<TDoc, TRel, TColumns, TWith>>>;

  findCursor<const TColumns extends ColumnSelection<TDoc> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<CursorParams<TDoc>, TColumns, TWith>,
  ): Promise<CursorResult<Result<TDoc, TRel, TColumns, TWith>>>;

  count(filter?: Filter<TDoc>): Promise<number>;
  exists(filter?: Filter<TDoc>): Promise<boolean>;

  /* ----------------------------- writes ----------------------------------- */

  /** Create one document and return it. */
  create(values: Insert<TDoc>): Promise<Row<TDoc>>;
  /** Create many documents in one round trip. */
  createMany(values: Insert<TDoc>[]): Promise<Row<TDoc>[]>;

  /** Insert, or update on `target` conflict (`findOneAndUpdate` upsert). */
  upsert(values: Insert<TDoc>, options: UpsertOptions<TDoc>): Promise<Row<TDoc>>;
  /** Bulk upsert (chunked `bulkWrite`). */
  upsertMany(values: Insert<TDoc>[], options: UpsertOptions<TDoc>): Promise<Row<TDoc>[]>;

  /** Update one document by id; returns the updated doc (or undefined). */
  updateById(id: Id, patch: Partial<Insert<TDoc>>, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;
  /** Update all documents matching the filter; returns the updated docs. */
  updateWhere(filter: Filter<TDoc>, patch: Partial<Insert<TDoc>>): Promise<Row<TDoc>[]>;

  /** Hard-delete one document by id; returns the deleted doc (or undefined). */
  deleteById(id: Id, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;
  /** Hard-delete all documents matching the filter; returns the deleted docs. */
  deleteWhere(filter: Filter<TDoc>): Promise<Row<TDoc>[]>;

  /** Soft-delete (set `deletedAt`); requires a `deletedAt` schema path. */
  softDelete(id: Id, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;
  /** Restore a soft-deleted document (`deletedAt = null`). */
  restore(id: Id, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;

  /** Aggregate: `count`/`sum`/`avg`/`min`/`max` with optional `groupBy`. */
  aggregate(spec: AggregateSpec<TDoc>): Promise<AggregateRow[]>;

  scoped(scope: Scope<TDoc>): Repository<TDoc, TRel>;
}
