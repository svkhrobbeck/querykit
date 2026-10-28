/**
 * QueryKit Prisma adapter — public types. The DSL/filter/meta types come from
 * `@querykitjs/core` (shared with the drizzle-pg and mongoose adapters); they are
 * only re-specialized here over a Prisma **model delegate** (`TDelegate`), with
 * the raw escape-hatch bound to that model's native `WhereInput`.
 *
 * The public surface mirrors `@querykitjs/drizzle-pg` and `@querykitjs/mongoose`
 * so the same frontend request contract works regardless of backend: same option
 * names, same semantics, one shared source in core.
 *
 * ⚠️ This file must never import from `@prisma/client` itself — only from
 * `@prisma/client/runtime/client`, which exists whether or not a client has been
 * generated (Prisma 6.19 and 7 both ship it; 7 has no `runtime/library`). That
 * is what lets the package typecheck and build in CI with no
 * `prisma generate` step, while still inferring exact row types in a consumer's
 * project. `Types.Public.*` are Prisma's own public type utilities; the generated
 * client re-exports the very same ones as `Prisma.Result` / `Prisma.Args`.
 */
import type * as Core from "@querykitjs/core";

import type { ArgsOf, RowWith } from "./delegate-args";

/* ------------------------------ client shapes ----------------------------- */

/** Structural minimum of a Prisma model delegate (`prisma.user`). */
export interface AnyDelegate {
  findMany(args?: any): any;
  findFirst(args?: any): any;
  count(args?: any): any;
}

/** Any Prisma client (or interactive-transaction client). */
export type AnyClient = Record<string, any>;

/**
 * The model keys of a Prisma client — `"user" | "post"`. Prisma names its
 * delegates in camelCase, so model `LegalEntity` is `prisma.legalEntity`.
 */
export type ModelKey<TClient> = {
  [K in keyof TClient & string]: K extends `$${string}` | `_${string}` ? never : TClient[K] extends AnyDelegate ? K : never;
}[keyof TClient & string];

/** The delegate behind a model key. */
export type DelegateOf<TClient, TKey extends ModelKey<TClient>> = TClient[TKey];

/* -------------------------- delegate-derived types ------------------------ */

/** Full row shape of a model (what reads return with no `columns`/`with`). */
export type Row<TDelegate> = RowWith<TDelegate, Record<string, never>>;

/** Insertable shape — the model's `create` data. */
export type Insert<TDelegate> = ArgsOf<TDelegate, "create">["data"];

/**
 * Raw Prisma predicate — the filter escape hatch (`TRaw`), i.e. this model's
 * `Prisma.<Model>WhereInput`.
 */
export type RawWhere<TDelegate> = NonNullable<ArgsOf<TDelegate, "findMany">["where"]>;

/** This model's `Prisma.<Model>Select`. */
export type SelectInput<TDelegate> = NonNullable<ArgsOf<TDelegate, "findMany">["select"]>;

/** This model's `Prisma.<Model>Include`. */
export type IncludeInput<TDelegate> = NonNullable<ArgsOf<TDelegate, "findMany">["include"]>;

/** Value accepted anywhere an id is expected. */
export type Id = string | number;

/** Union of a model's scalar field keys. */
export type FieldKey<TDelegate> = keyof Row<TDelegate> & string;

/**
 * A field key that also accepts any `string`. Filter/sort keys arrive from the
 * wire as plain strings and the adapter skips the ones it cannot resolve, so a
 * validated payload can go straight into a repository call with no `as` cast.
 * Autocomplete still suggests the model's real fields.
 */
export type LooseFieldKey<TDelegate> = Core.LooseKey<FieldKey<TDelegate>>;

/* --------------------------------- filters -------------------------------- */
/* DSL from `@querykitjs/core`, specialized: TKey = field key, TRaw = WhereInput. */

export type FilterOperator = Core.FilterOperator;
export type FilterScalar = Core.FilterScalar;
export type FilterValue = Core.FilterValue;

export type FieldCondition<TDelegate = AnyDelegate> = Core.FieldCondition<LooseFieldKey<TDelegate>>;
export type AndGroup<TDelegate = AnyDelegate> = Core.AndGroup<LooseFieldKey<TDelegate>, RawWhere<TDelegate>>;
export type OrGroup<TDelegate = AnyDelegate> = Core.OrGroup<LooseFieldKey<TDelegate>, RawWhere<TDelegate>>;
export type NotGroup<TDelegate = AnyDelegate> = Core.NotGroup<LooseFieldKey<TDelegate>, RawWhere<TDelegate>>;

/**
 * Any node in a filter tree: a field comparison, a logical group, or a raw
 * Prisma `where` object (escape hatch for predicates the DSL can't express).
 */
export type FilterNode<TDelegate = AnyDelegate> = Core.FilterNode<LooseFieldKey<TDelegate>, RawWhere<TDelegate>>;

/**
 * Public filter input. Either a filter tree/node, or a flat array of conditions
 * (treated as implicit AND — backward compatible with db-service).
 */
export type Filter<TDelegate = AnyDelegate> = Core.Filter<LooseFieldKey<TDelegate>, RawWhere<TDelegate>>;

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = Core.SortDirection;

export type SortItem<TDelegate = AnyDelegate> = Core.SortItem<LooseFieldKey<TDelegate>>;

/**
 * Sort — **always an array** of `{ key, direction }` (multi-field). This is the
 * exact shape the querykit frontend sends (`@querykitjs/web` decodes its
 * `sortType=-createdAt,id` URL string into it).
 */
export type Sort<TDelegate = AnyDelegate> = SortItem<TDelegate>[];

/* ---------------------------- selection / params -------------------------- */

/** Inclusion-only column selection — `{ id: true, email: true }`. */
export type ColumnSelection<TDelegate = AnyDelegate> = Partial<Record<FieldKey<TDelegate>, boolean>>;

/** Relations to load — forwarded to Prisma's `include` (or nested `select`). */
export type WithRelations = Record<string, unknown>;

export interface QueryParams<TDelegate = AnyDelegate> {
  filter?: Filter<TDelegate>;
  sort?: Sort<TDelegate>;
  columns?: ColumnSelection<TDelegate>;
  with?: WithRelations;
  /** Include soft-deleted rows (models with a `deletedAt` field). */
  withDeleted?: boolean;
}

/** Equality scope applied to every operation of a scoped repository. */
export type Scope<TDelegate = AnyDelegate> = Core.Scope<FieldKey<TDelegate>>;

export interface ByIdParams<TDelegate = AnyDelegate> extends QueryParams<TDelegate> {
  /** Field to match against the id. Defaults to `"id"` (→ the model's `@id`). */
  idKey?: LooseFieldKey<TDelegate>;
}

/* --------------------------------- writes --------------------------------- */

/** Options for {@link Repository.upsert} / {@link Repository.upsertMany}. */
export type UpsertOptions<TDelegate = AnyDelegate> = Core.UpsertOptions<FieldKey<TDelegate>, Insert<TDelegate>>;

/* ------------------------------ aggregation ------------------------------- */

/** Aggregate query specification (`count`/`sum`/`avg`/`min`/`max` + `groupBy`). */
export type AggregateSpec<TDelegate = AnyDelegate> = Core.AggregateSpec<FieldKey<TDelegate>, Filter<TDelegate>>;

/** One aggregated result row (group fields + aggregate values). */
export type AggregateRow = Record<string, unknown>;
