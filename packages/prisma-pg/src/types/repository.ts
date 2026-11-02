import type {
  AggregateRow,
  AggregateSpec,
  AnyDelegate,
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
import type { RowWith } from "./delegate-args";
import type { AllRows, MutationCount, MutationRows } from "@querykitjs/core";
import type { CursorParams, CursorResult, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult } from "./pagination";

/* --------------------------- result-type inference ------------------------ */
/* `columns` narrows the row through Prisma's own `select` inference; `with`
 * retypes loaded relations through `include`. When both are given the adapter
 * composes a single `select` (Prisma rejects `select` + `include` at one level),
 * and the types follow the same composition. */

type TrueKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];
/** Relation keys that are actually loaded — `true` or a nested config object. */
type LoadedKeys<T> = { [K in keyof T]-?: T[K] extends false | undefined | null ? never : K }[keyof T];

type HasColumns<T> = T extends object ? ([TrueKeys<T>] extends [never] ? false : true) : false;
type HasWith<T> = T extends object ? ([LoadedKeys<T>] extends [never] ? false : true) : false;

/**
 * The result row for a given `columns` selection and loaded `with` relations.
 * An empty/all-false `columns` yields the full row, matching the runtime
 * (inclusion-only projection) and the other two adapters.
 */
export type ResultFor<TDelegate, TColumns, TWith> =
  HasColumns<TColumns> extends true
    ? HasWith<TWith> extends true
      ? RowWith<TDelegate, { select: TColumns & TWith }>
      : RowWith<TDelegate, { select: TColumns }>
    : HasWith<TWith> extends true
      ? RowWith<TDelegate, { include: TWith }>
      : Row<TDelegate>;

/** Params whose `columns`/`with` are typed to the passed selection (drives inference). */
type Params<TBase, TColumns, TWith> = Omit<TBase, "columns" | "with"> & { columns?: TColumns; with?: TWith };

/* ------------------------------- repository ------------------------------- */

/**
 * Model-scoped repository. Read methods infer their return type from the
 * `columns` and `with` arguments, mirroring `@querykitjs/drizzle-pg`.
 */
export interface Repository<TDelegate = AnyDelegate> {
  /** The underlying Prisma model delegate — escape hatch for custom queries. */
  readonly delegate: TDelegate;

  /**
   * Returns **all** rows matching the filter (no pagination).
   *
   * @example
   * ```ts
   * const active = await usersRepository.findAll({
   *   filter: [{ key: "status", operation: "=", value: "active" }],
   *   sort: [{ key: "createdAt", direction: "desc" }],
   * });
   * ```
   */
  findAll<const TColumns extends ColumnSelection<TDelegate> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<QueryParams<TDelegate>, TColumns, TWith>,
  ): Promise<ResultFor<TDelegate, TColumns, TWith>[]>;

  /** Returns the **first** matching row (or `undefined`). */
  findOne<const TColumns extends ColumnSelection<TDelegate> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<QueryParams<TDelegate>, TColumns, TWith>,
  ): Promise<ResultFor<TDelegate, TColumns, TWith> | undefined>;

  /** Returns one row by id (or `undefined`). Use `params.idKey` for another field. */
  findById<const TColumns extends ColumnSelection<TDelegate> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    id: Id,
    params?: Params<ByIdParams<TDelegate>, TColumns, TWith>,
  ): Promise<ResultFor<TDelegate, TColumns, TWith> | undefined>;

  /**
   * **Offset (page-based) pagination** — with `total_items`/`total_pages`.
   *
   * @example
   * ```ts
   * const { data, meta } = await usersRepository.findList({ page: 2, perPage: 20 });
   * ```
   */
  findList<const TColumns extends ColumnSelection<TDelegate> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<OffsetParams<TDelegate>, TColumns, TWith>,
  ): Promise<OffsetResult<ResultFor<TDelegate, TColumns, TWith>>>;

  /** **Infinite-scroll pagination** — `limit`+`offset`, no `COUNT`. */
  findInfinite<const TColumns extends ColumnSelection<TDelegate> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<InfiniteParams<TDelegate>, TColumns, TWith>,
  ): Promise<InfiniteResult<ResultFor<TDelegate, TColumns, TWith>>>;

  /** **Cursor (keyset) pagination** — stable under inserts, ideal for feeds. */
  findCursor<const TColumns extends ColumnSelection<TDelegate> | undefined = undefined, const TWith extends WithRelations | undefined = undefined>(
    params?: Params<CursorParams<TDelegate>, TColumns, TWith>,
  ): Promise<CursorResult<ResultFor<TDelegate, TColumns, TWith>>>;

  /** Number of rows matching the filter. */
  count(filter?: Filter<TDelegate>): Promise<number>;
  /** Whether any row matches the filter (`count > 0`). */
  exists(filter?: Filter<TDelegate>): Promise<boolean>;

  /* ----------------------------- writes ----------------------------------- */

  /** Create one row and return it. */
  create(values: Insert<TDelegate>): Promise<Row<TDelegate>>;
  /** Create many rows, returning them in input order. */
  createMany(values: Insert<TDelegate>[]): Promise<Row<TDelegate>[]>;

  /** Insert, or update on `target` conflict (Prisma `upsert`). */
  upsert(values: Insert<TDelegate>, options: UpsertOptions<TDelegate>): Promise<Row<TDelegate>>;
  /** Bulk upsert (chunked); returns rows in input order. */
  upsertMany(values: Insert<TDelegate>[], options: UpsertOptions<TDelegate>): Promise<Row<TDelegate>[]>;

  /** Update one row by id; returns the updated row (or `undefined`). */
  updateById(id: Id, patch: Partial<Insert<TDelegate>>, idKey?: FieldKey<TDelegate>): Promise<Row<TDelegate> | undefined>;
  /**
   * Update every row matching the filter in one atomic `updateMany` → `{ count }` (task 013).
   * No filter only with `{ all: true }` (the scope still applies); an empty or fully skipped
   * filter is `QueryKitError` `empty-filter`. The filter passes the request policy like a read.
   */
  updateWhere(filter: Filter<TDelegate> | AllRows, patch: Partial<Insert<TDelegate>>, options?: { returning?: false }): Promise<MutationCount>;
  /** With `returning: { limit }`: `{ count, rows }` from one atomic `updateManyAndReturn`, at most `limit` rows. */
  updateWhere(
    filter: Filter<TDelegate> | AllRows,
    patch: Partial<Insert<TDelegate>>,
    options: { returning: { limit: number } },
  ): Promise<MutationRows<Row<TDelegate>>>;

  /** Hard-delete one row by id; returns the deleted row (or `undefined`). */
  deleteById(id: Id, idKey?: FieldKey<TDelegate>): Promise<Row<TDelegate> | undefined>;
  /** Hard-delete every row matching the filter in one `deleteMany` → `{ count }` (same rules as `updateWhere`). */
  deleteWhere(filter: Filter<TDelegate> | AllRows, options?: { returning?: false }): Promise<MutationCount>;
  /** With `returning: { limit }`: `{ count, rows }` — the rows are read just before the delete (not atomic). */
  deleteWhere(filter: Filter<TDelegate> | AllRows, options: { returning: { limit: number } }): Promise<MutationRows<Row<TDelegate>>>;

  /** Soft-delete (set `deletedAt`); requires a `deletedAt` field. */
  softDelete(id: Id, idKey?: FieldKey<TDelegate>): Promise<Row<TDelegate> | undefined>;
  /** Restore a soft-deleted row (`deletedAt = null`). */
  restore(id: Id, idKey?: FieldKey<TDelegate>): Promise<Row<TDelegate> | undefined>;

  /** Aggregate: `count`/`sum`/`avg`/`min`/`max` with optional `groupBy`. */
  aggregate(spec: AggregateSpec<TDelegate>): Promise<AggregateRow[]>;

  /**
   * **Scoped repository** — adds a constant equality filter to every read/write
   * and defaults it on inserts (scope wins). For RBAC / multi-tenancy.
   */
  scoped(scope: Scope<TDelegate>): Repository<TDelegate>;
}

/** Extends a base repository with custom, model-specific methods. */
export type RepositoryExtender<TDelegate, TExt extends Record<string, unknown>> = (base: Repository<TDelegate>) => TExt;
