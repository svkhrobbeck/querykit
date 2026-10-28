import type { BuildQueryResult, DBQueryConfig, ExtractTablesWithRelations, InferInsertModel, InferSelectModel, SQL } from "drizzle-orm";
import type { AnyPgTable, PgDatabase } from "drizzle-orm/pg-core";
import type * as Core from "@querykitjs/core";

/** Any Drizzle Postgres database or transaction, regardless of the driver. */
export type AnyDb = PgDatabase<any, any, any>;

/** Row shape inferred from a Drizzle table (SELECT). */
export type Row<TTable extends AnyPgTable> = InferSelectModel<TTable>;

/** Insertable shape inferred from a Drizzle table (INSERT). */
export type Insert<TTable extends AnyPgTable> = InferInsertModel<TTable>;

/** Value accepted anywhere an id is expected. */
export type Id = string | number;

/* ----------------------- relation-aware result types ---------------------- */

/** Drizzle's relational view of a schema (tables + their relations). */
export type SchemaTables<TSchema extends Record<string, unknown>> = ExtractTablesWithRelations<TSchema>;

/** The `with` argument shape for a given table in a schema. */
export type WithConfig<TSchema extends Record<string, unknown>, TTableName extends keyof SchemaTables<TSchema>> = DBQueryConfig<
  "many",
  true,
  SchemaTables<TSchema>,
  SchemaTables<TSchema>[TTableName]
>["with"];

/** The `columns` selection shape for a given table in a schema. */
export type ColumnsConfig<TSchema extends Record<string, unknown>, TTableName extends keyof SchemaTables<TSchema>> = DBQueryConfig<
  "many",
  true,
  SchemaTables<TSchema>,
  SchemaTables<TSchema>[TTableName]
>["columns"];

/**
 * The exact row type Drizzle returns for a table when the given relations are
 * loaded — fully typed, with autocomplete. Bind it to your schema once:
 *
 * ```ts
 * type With<T extends keyof SchemaTables<typeof schema>, W> =
 *   InferWith<typeof schema, T, W>;
 *
 * type PostFull = With<"posts", { author: true; comments: true }>;
 * ```
 */
export type InferWith<
  TSchema extends Record<string, unknown>,
  TTableName extends keyof SchemaTables<TSchema>,
  TWith extends WithConfig<TSchema, TTableName> = undefined,
> = BuildQueryResult<SchemaTables<TSchema>, SchemaTables<TSchema>[TTableName], { with: TWith }>;

/**
 * The exact row type Drizzle returns for a table given both a `columns`
 * selection and loaded relations — the full inference used by read methods.
 */
export type InferResult<
  TSchema extends Record<string, unknown>,
  TTableName extends keyof SchemaTables<TSchema>,
  TColumns extends ColumnsConfig<TSchema, TTableName> = undefined,
  TWith extends WithConfig<TSchema, TTableName> = undefined,
> = BuildQueryResult<SchemaTables<TSchema>, SchemaTables<TSchema>[TTableName], { columns: TColumns; with: TWith }>;

/** Resolve a table object back to its key name within the schema. */
export type TableNameOf<TSchema extends Record<string, unknown>, TTable extends AnyPgTable> = {
  [K in keyof TSchema]: TSchema[K] extends TTable ? (TTable extends TSchema[K] ? K : never) : never;
}[keyof TSchema] &
  keyof SchemaTables<TSchema>;

/** Union of a table's column keys (property names). */
export type ColumnKey<TTable extends AnyPgTable> = keyof Row<TTable> & string;

/**
 * A column key that also accepts any `string`. Filter/sort keys arrive from the
 * wire as plain strings and the adapter skips the ones it cannot resolve, so a
 * validated payload can go straight into a repository call with no `as` cast.
 * Autocomplete still suggests the table's real columns.
 */
export type LooseColumnKey<TTable extends AnyPgTable> = Core.LooseKey<ColumnKey<TTable>>;

/* -------------------------------- filters --------------------------------- */
/* DSL `@querykitjs/core`dan; jadval ustuni (`ColumnKey`) va raw `SQL` bilan ixtisos. */

export type FilterOperator = Core.FilterOperator;
export type FilterScalar = Core.FilterScalar;
export type FilterValue = Core.FilterValue;

/** A single field comparison (`operation` defaults to `"="`). */
export type FieldCondition<TTable extends AnyPgTable = AnyPgTable> = Core.FieldCondition<LooseColumnKey<TTable>>;
export type AndGroup<TTable extends AnyPgTable = AnyPgTable> = Core.AndGroup<LooseColumnKey<TTable>, SQL>;
export type OrGroup<TTable extends AnyPgTable = AnyPgTable> = Core.OrGroup<LooseColumnKey<TTable>, SQL>;
export type NotGroup<TTable extends AnyPgTable = AnyPgTable> = Core.NotGroup<LooseColumnKey<TTable>, SQL>;

/**
 * Any node in a filter tree: a field comparison, a logical group, or a raw
 * Drizzle `SQL` fragment (escape hatch for expressions the DSL can't express).
 */
export type FilterNode<TTable extends AnyPgTable = AnyPgTable> = Core.FilterNode<LooseColumnKey<TTable>, SQL>;

/**
 * Public filter input. Either a filter tree/node, or a flat array of
 * conditions (treated as implicit AND — backward compatible with db-service).
 */
export type Filter<TTable extends AnyPgTable = AnyPgTable> = Core.Filter<LooseColumnKey<TTable>, SQL>;

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = Core.SortDirection;

export type SortItem<TTable extends AnyPgTable = AnyPgTable> = Core.SortItem<LooseColumnKey<TTable>>;

/** Sort is **always an array** of `{ key, direction }` items (multi-field). */
export type Sort<TTable extends AnyPgTable = AnyPgTable> = SortItem<TTable>[];

/* ---------------------------- selection / params -------------------------- */

export type ColumnSelection<TTable extends AnyPgTable> = Partial<Record<ColumnKey<TTable>, boolean>>;

/** Relation config forwarded to Drizzle's relational `with`. */
export type WithRelations = Record<string, unknown>;

export interface QueryParams<TTable extends AnyPgTable> {
  filter?: Filter<TTable>;
  sort?: Sort<TTable>;
  columns?: ColumnSelection<TTable>;
  with?: WithRelations;
  /** Include soft-deleted rows (tables with a `deletedAt` column). */
  withDeleted?: boolean;
}

/** Equality scope applied to every operation of a scoped repository. */
export type Scope<TTable extends AnyPgTable> = Core.Scope<ColumnKey<TTable>>;

export interface ByIdParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  /** Column to match against the id. Defaults to `"id"`. */
  idKey?: LooseColumnKey<TTable>;
}

/** Options for {@link Repository.upsert} / {@link Repository.upsertMany}. */
export type UpsertOptions<TTable extends AnyPgTable> = Core.UpsertOptions<ColumnKey<TTable>, Insert<TTable>>;

/* ------------------------------ aggregation ------------------------------- */

/** Aggregate query specification (`count`/`sum`/`avg`/`min`/`max` + `groupBy`). */
export type AggregateSpec<TTable extends AnyPgTable> = Core.AggregateSpec<ColumnKey<TTable>, Filter<TTable>>;

/** One aggregated result row (group columns + aggregate values). */
export type AggregateRow = Record<string, string | number | boolean | null>;
