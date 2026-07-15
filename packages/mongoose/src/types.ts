/**
 * QueryKit Mongoose adapter — public types. The DSL/filter/meta types come from
 * `@querykitjs/core` (shared with the Postgres adapter); they are only
 * re-specialized here over a Mongoose document type (`TDoc`), with the raw
 * escape-hatch bound to a native Mongo `FilterQuery`.
 *
 * The public surface mirrors `@querykitjs/drizzle-pg` so the same frontend
 * request contract works regardless of backend.
 *
 * NOTE: Stage 1 exposes only read methods (+ scoped). Writes/upsert/aggregate/
 * transaction land in stage 2.
 */
import type { Model, Types } from "mongoose";
import type * as Core from "@querykitjs/core";

/** Plain (lean) document type — what reads return. */
export type Row<TDoc> = TDoc;
/**
 * Insertable shape — the document minus auto-managed fields (`_id`, timestamps),
 * with the rest optional (Mongoose enforces `required`/defaults at runtime; that
 * metadata isn't in the doc type, so unlike drizzle-pg we can't mark it here).
 */
export type Insert<TDoc> = Partial<Omit<TDoc, "_id" | "createdAt" | "updatedAt">>;
/** Value accepted anywhere an id is expected. */
export type Id = string | number | Types.ObjectId;

/**
 * Raw Mongo predicate fragment — the filter escape hatch (`TRaw`). A plain Mongo
 * query object (kept simple on purpose; Mongoose's `QueryFilter<TDoc>` generic is
 * too invariant to compose cleanly through the core DSL).
 */
export type RawFilter<_TDoc = unknown> = Record<string, unknown>;

/** Union of a document's field keys. */
export type FieldKey<TDoc> = keyof TDoc & string;

/* --------------------------------- filters -------------------------------- */
/* DSL from `@querykitjs/core`, specialized: TKey = field key, TRaw = Mongo filter. */

export type FilterOperator = Core.FilterOperator;
export type FilterScalar = Core.FilterScalar;
export type FilterValue = Core.FilterValue;

export type FieldCondition<TDoc = Record<string, unknown>> = Core.FieldCondition<FieldKey<TDoc>>;
export type AndGroup<TDoc = Record<string, unknown>> = Core.AndGroup<FieldKey<TDoc>, RawFilter<TDoc>>;
export type OrGroup<TDoc = Record<string, unknown>> = Core.OrGroup<FieldKey<TDoc>, RawFilter<TDoc>>;
export type NotGroup<TDoc = Record<string, unknown>> = Core.NotGroup<FieldKey<TDoc>, RawFilter<TDoc>>;
export type FilterNode<TDoc = Record<string, unknown>> = Core.FilterNode<FieldKey<TDoc>, RawFilter<TDoc>>;
export type Filter<TDoc = Record<string, unknown>> = Core.Filter<FieldKey<TDoc>, RawFilter<TDoc>>;

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = Core.SortDirection;

/** One sort field by typed field key (`{ key, direction }`) — autocomplete. */
export type SortItem<TDoc = Record<string, unknown>> = Core.SortItem<FieldKey<TDoc>>;

/**
 * Sort — **always an array** of `{ key, direction }` (multi-field). This is the
 * exact shape the querykit frontend sends (`@querykitjs/web` decodes its
 * `sortType=-createdAt,id` URL string into it).
 */
export type Sort<TDoc = Record<string, unknown>> = SortItem<TDoc>[];

/* ---------------------------- selection / params -------------------------- */

export type ColumnSelection<TDoc = Record<string, unknown>> = Partial<Record<FieldKey<TDoc>, boolean>>;

/** Relations to populate (Mongoose `populate`). */
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
export type Scope<TDoc = Record<string, unknown>> = Partial<Record<FieldKey<TDoc>, FilterScalar>>;

export interface ByIdParams<TDoc = Record<string, unknown>> extends QueryParams<TDoc> {
  /** Field to match against the id. Defaults to `"id"` (→ `_id`). */
  idKey?: FieldKey<TDoc>;
}

/* --------------------------------- writes --------------------------------- */

/** Options for {@link Repository.upsert} / {@link Repository.upsertMany}. */
export interface UpsertOptions<TDoc = Record<string, unknown>> {
  /** Unique field(s) whose match triggers an update instead of an insert. */
  target: FieldKey<TDoc> | FieldKey<TDoc>[];
  /** Fields to update on conflict. Defaults to the inserted values minus `target`. */
  set?: Partial<Insert<TDoc>>;
}

/* ------------------------------ aggregation ------------------------------- */

type AggKeys<TDoc> = FieldKey<TDoc> | FieldKey<TDoc>[];

/** Aggregate query specification (mirrors drizzle-pg). */
export interface AggregateSpec<TDoc = Record<string, unknown>> {
  filter?: Filter<TDoc>;
  /** Group by these field(s); each appears in the output rows. */
  groupBy?: AggKeys<TDoc>;
  /** `$sum:1` → `count`. */
  count?: boolean;
  /** `$sum` → `sum_<field>`. */
  sum?: AggKeys<TDoc>;
  /** `$avg` → `avg_<field>`. */
  avg?: AggKeys<TDoc>;
  /** `$min` → `min_<field>`. */
  min?: AggKeys<TDoc>;
  /** `$max` → `max_<field>`. */
  max?: AggKeys<TDoc>;
  withDeleted?: boolean;
}

/** One aggregated result row (group fields + aggregate values). */
export type AggregateRow = Record<string, unknown>;

/* ------------------------------- pagination ------------------------------- */

export interface OffsetParams<TDoc = Record<string, unknown>> extends QueryParams<TDoc> {
  page?: number;
  perPage?: number;
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
  cursorKey?: FieldKey<TDoc>;
  order?: SortDirection;
  direction?: "forward" | "backward";
}
export type CursorMeta = Core.CursorMeta;
export interface CursorResult<T> {
  data: T[];
  meta: CursorMeta;
}

/* ------------------------------- relations -------------------------------- */

/** Map of relation field name → the Mongoose model it refers to. */
export type RelationMap = Record<string, Model<any>>;

type DocOf<M> = M extends Model<infer T> ? T : never;

/** Resolve a {@link RelationMap} to `{ field: <its document type> }`. */
export type RelationDocs<TRel extends RelationMap> = { [K in keyof TRel]: DocOf<TRel[K]> };

/** Options for `registry.repository(model, options)`. */
export interface RepositoryOptions<TRel extends RelationMap = RelationMap> {
  /** Declare populatable relations (field → model) so `with` types the result. */
  relations?: TRel;
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
 * Table-scoped repository (stage 1: reads + scoped). Read methods infer their
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

/** {@link createRegistry} options — pagination defaults. */
export interface RegistryOptions {
  /** `findList` default page size (core `DEFAULT_PER_PAGE` = 20). */
  defaultPerPage?: number;
  /** `findInfinite`/`findCursor` default limit (core `DEFAULT_LIMIT` = 20). */
  defaultLimit?: number;
}

/** Extends a base repository with custom, model-specific methods (drizzle-pg style). */
export type RepositoryExtender<TDoc, TRel extends Record<string, unknown>, TExt extends Record<string, unknown>> = (base: Repository<TDoc, TRel>) => TExt;

/** DB registry: created once, yields model repositories. */
export interface Registry {
  /** Repository for a model. */
  repository<TDoc>(model: Model<TDoc>): Repository<TDoc>;

  /** …extended with custom methods (2nd-arg extender fn — same as drizzle-pg). */
  repository<TDoc, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    extend: RepositoryExtender<TDoc, Record<never, never>, TExt>,
  ): Repository<TDoc> & TExt;

  /** …with typed relations so populated `with` fields are typed. */
  repository<TDoc, TRel extends RelationMap>(model: Model<TDoc>, options: RepositoryOptions<TRel>): Repository<TDoc, RelationDocs<TRel>>;

  /** …with both typed relations and custom methods. */
  repository<TDoc, TRel extends RelationMap, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    options: RepositoryOptions<TRel>,
    extend: RepositoryExtender<TDoc, RelationDocs<TRel>, TExt>,
  ): Repository<TDoc, RelationDocs<TRel>> & TExt;

  /** Runs `fn` inside a MongoDB transaction (requires a replica set). */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
