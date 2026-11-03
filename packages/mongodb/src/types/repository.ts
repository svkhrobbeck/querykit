import type { Collection, Document } from "mongodb";
import type { z } from "zod";
import type * as Core from "@querykitjs/core";
import type { AllRows, MutationCount, MutationRows } from "@querykitjs/core";

import type { AggregateRow, AggregateSpec, ByIdParams, ColumnSelection, FieldKey, Filter, Id, Insert, QueryParams, Row, Scope, UpsertOptions } from "./common";
import type { CursorParams, CursorResult, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult } from "./pagination";

/**
 * Per-repository options — the same names as the other adapters (REQUIREMENTS R11), plus the
 * zod `schema` the driver does not have: field types for casting, unknown keys, the default
 * `filterable` (equality on the schema's fields, R12).
 */
export interface RepositoryOptions<TDoc = Document> {
  /** The document's zod object schema — the one source of field types. */
  schema: z.ZodObject;
  /** Fields stored as `ObjectId` (cast from 24-hex strings). Default `["_id"]`. */
  objectId?: readonly (FieldKey<TDoc> | "_id")[];
  /** Applied to every read and write (RBAC / tenancy); a value may be `{ in: [...] }`. */
  scope?: Scope<TDoc>;
  /** The response always has exactly these fields; the client's `columns` is ignored. */
  forcedColumns?: ColumnSelection<TDoc>;
  /** The client's `columns` is intersected with this list. */
  allowedColumns?: readonly FieldKey<TDoc>[];
  /** Field → allowed operators (`"*"` all). Absent: equality (`=`, `in`) on the schema's fields. */
  filterable?: Core.Filterable<FieldKey<TDoc> | "_id">;
  /** Sortable fields. Absent: `_id` and the createdAt field. */
  sortable?: readonly (FieldKey<TDoc> | "_id")[];
  limits?: Partial<Core.QueryLimits>;
  /** Server time limit per read, in ms (default: the registry's, 2000). */
  maxTimeMS?: number;
}

type TrueKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

/** `columns` narrows the row via `Pick`. */
export type Result<TDoc, TColumns> =
  TColumns extends ColumnSelection<TDoc> ? ([TrueKeys<TColumns>] extends [never] ? TDoc : Pick<TDoc, TrueKeys<TColumns> & keyof TDoc>) : TDoc;

type Params<TBase, TColumns> = Omit<TBase, "columns"> & { columns?: TColumns };

export interface Repository<TDoc extends Document = Document> {
  readonly collection: Collection<TDoc>;

  findAll<const TColumns extends ColumnSelection<TDoc> | undefined = undefined>(
    params?: Params<QueryParams<TDoc>, TColumns>,
  ): Promise<Result<TDoc, TColumns>[]>;
  findOne<const TColumns extends ColumnSelection<TDoc> | undefined = undefined>(
    params?: Params<QueryParams<TDoc>, TColumns>,
  ): Promise<Result<TDoc, TColumns> | undefined>;
  findById<const TColumns extends ColumnSelection<TDoc> | undefined = undefined>(
    id: Id,
    params?: Params<ByIdParams<TDoc>, TColumns>,
  ): Promise<Result<TDoc, TColumns> | undefined>;
  findList<const TColumns extends ColumnSelection<TDoc> | undefined = undefined>(
    params?: Params<OffsetParams<TDoc>, TColumns>,
  ): Promise<OffsetResult<Result<TDoc, TColumns>>>;
  findInfinite<const TColumns extends ColumnSelection<TDoc> | undefined = undefined>(
    params?: Params<InfiniteParams<TDoc>, TColumns>,
  ): Promise<InfiniteResult<Result<TDoc, TColumns>>>;
  findCursor<const TColumns extends ColumnSelection<TDoc> | undefined = undefined>(
    params?: Params<CursorParams<TDoc>, TColumns>,
  ): Promise<CursorResult<Result<TDoc, TColumns>>>;

  count(filter?: Filter<TDoc>): Promise<number>;
  exists(filter?: Filter<TDoc>): Promise<boolean>;

  create(values: Insert<TDoc>): Promise<Row<TDoc>>;
  createMany(values: Insert<TDoc>[]): Promise<Row<TDoc>[]>;
  upsert(values: Insert<TDoc>, options: UpsertOptions<TDoc>): Promise<Row<TDoc>>;
  upsertMany(values: Insert<TDoc>[], options: UpsertOptions<TDoc>): Promise<Row<TDoc>[]>;

  updateById(id: Id, patch: Partial<Insert<TDoc>>, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;
  /** One `updateMany`; an empty filter is refused (`empty-filter`) unless it is `{ all: true }`. */
  updateWhere(filter: Filter<TDoc> | AllRows, patch: Partial<Insert<TDoc>>, options?: { returning?: false }): Promise<MutationCount>;
  updateWhere(filter: Filter<TDoc> | AllRows, patch: Partial<Insert<TDoc>>, options: { returning: { limit: number } }): Promise<MutationRows<Row<TDoc>>>;

  deleteById(id: Id, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;
  deleteWhere(filter: Filter<TDoc> | AllRows, options?: { returning?: false }): Promise<MutationCount>;
  deleteWhere(filter: Filter<TDoc> | AllRows, options: { returning: { limit: number } }): Promise<MutationRows<Row<TDoc>>>;

  softDelete(id: Id, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;
  restore(id: Id, idKey?: FieldKey<TDoc>): Promise<Row<TDoc> | undefined>;

  aggregate(spec: AggregateSpec<TDoc>): Promise<AggregateRow[]>;

  scoped(scope: Scope<TDoc>): Repository<TDoc>;
}
