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
 * `@prisma/client/runtime/library`, which exists whether or not a client has been
 * generated. That is what lets the package typecheck and build in CI with no
 * `prisma generate` step, while still inferring exact row types in a consumer's
 * project. `Types.Public.*` are Prisma's own public type utilities; the generated
 * client re-exports the very same ones as `Prisma.Result` / `Prisma.Args`.
 */
import type { Types } from "@prisma/client/runtime/library";
import type * as Core from "@querykitjs/core";

import type { FieldMeta } from "./internal/fields";

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

type ArgsOf<TDelegate, TOperation extends Types.Public.Operation> = Types.Public.Args<TDelegate, TOperation>;

/** One row with the given Prisma args applied (`select` / `include`). */
type RowWith<TDelegate, TArgs> = Types.Public.Result<TDelegate, TArgs, "findFirstOrThrow">;

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

/* ------------------------------- pagination ------------------------------- */

/** Offset (classic page-based) pagination. */
export interface OffsetParams<TDelegate = AnyDelegate> extends QueryParams<TDelegate> {
  page?: number;
  perPage?: number;
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
  /** Update every row matching the filter; returns the updated rows. */
  updateWhere(filter: Filter<TDelegate>, patch: Partial<Insert<TDelegate>>): Promise<Row<TDelegate>[]>;

  /** Hard-delete one row by id; returns the deleted row (or `undefined`). */
  deleteById(id: Id, idKey?: FieldKey<TDelegate>): Promise<Row<TDelegate> | undefined>;
  /** Hard-delete every row matching the filter; returns the deleted rows. */
  deleteWhere(filter: Filter<TDelegate>): Promise<Row<TDelegate>[]>;

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

/** {@link createRegistry} options — pagination defaults and bounds. */
export interface RegistryOptions {
  /** `findList` default page size (core `DEFAULT_PER_PAGE` = 20). */
  defaultPerPage?: number;
  /** `findInfinite`/`findCursor` default limit (core `DEFAULT_LIMIT` = 20). */
  defaultLimit?: number;
  /**
   * Upper bound for `perPage` (core `DEFAULT_MAX_PER_PAGE` = 200). Applied even
   * when validation was bypassed — defense in depth. Disable with `Infinity`.
   */
  maxPerPage?: number;
  /** Upper bound for `limit` (`findInfinite`/`findCursor`, core `DEFAULT_MAX_LIMIT` = 200). */
  maxLimit?: number;
  /**
   * **Strict mode.** An unknown filter/sort key, or a value the operator cannot
   * use, is no longer dropped silently — a `QueryKitError` is thrown (the backend
   * maps it to a 400). Defaults to `false`, matching the other adapters.
   *
   * Why it matters: a filter is meant to **narrow** a result set, so a mistyped
   * key that vanishes silently makes the endpoint return **more** data than
   * intended, with nothing in the log to show it.
   */
  strict?: boolean;
  /**
   * Called for every dropped condition (also when `strict` is off). Migration
   * path: watch with the hook first, flip `strict: true` once the log is clean.
   */
  onSkippedCondition?: (info: Core.SkippedCondition) => void;
}

/**
 * Options for `registry.repository(model, options)`.
 *
 * Philosophy: the guard lives in the **repository**, not the route — `scope`
 * (RBAC) already worked that way and projection joins it. Same names and same
 * semantics as the drizzle-pg and mongoose adapters.
 *
 * ⚠️ `forcedColumns`/`allowedColumns` affect **read** methods only
 * (`findAll`/`findOne`/`findById`/`findList`/`findInfinite`/`findCursor` +
 * `aggregate`). Write methods return the full `Row` by type contract — trimming
 * it at runtime would make the type a lie. Re-read with `findById`, or map it
 * yourself, before handing a write result to a client.
 */
export interface RepositoryOptions<TDelegate = AnyDelegate> {
  /** Constant equality filter added to every read/write (RBAC / multi-tenancy). */
  scope?: Scope<TDelegate>;
  /**
   * Forced projection — the client's `columns` is **ignored entirely**. Keeps a
   * password out of a `users` response without a `{ ...params, columns }` trick
   * in every route. Must select at least one field, else building throws.
   */
  forcedColumns?: ColumnSelection<TDelegate>;
  /**
   * Allowlist — the client's `columns` is intersected with it. An empty
   * intersection yields the allowlist itself, **never** the full row. An empty
   * array throws (a projection selecting nothing means "everything").
   */
  allowedColumns?: readonly FieldKey<TDelegate>[];
  /**
   * Explicit field metadata. Only needed when this adapter cannot read it off
   * the Prisma client itself (it tries `_runtimeDataModel`, then the public
   * `delegate.fields`) — e.g. behind an unusual client wrapper.
   */
  fields?: readonly FieldMeta[];
}

/** DB registry: created once, yields model repositories. */
export interface Registry<TClient extends AnyClient = AnyClient> {
  /** The Prisma client the registry was created with. */
  readonly client: TClient;

  /**
   * Repository for a model, by its Prisma delegate key (camelCase).
   *
   * @example
   * ```ts
   * export const usersRepository = registry.repository("user");
   * ```
   */
  repository<TKey extends ModelKey<TClient>>(model: TKey): Repository<DelegateOf<TClient, TKey>>;

  /** …extended with custom methods (2nd-arg extender fn — same as the other adapters). */
  repository<TKey extends ModelKey<TClient>, TExt extends Record<string, unknown>>(
    model: TKey,
    extend: RepositoryExtender<DelegateOf<TClient, TKey>, TExt>,
  ): Repository<DelegateOf<TClient, TKey>> & TExt;

  /** …with per-repository options (`scope`, `forcedColumns`, `allowedColumns`). */
  repository<TKey extends ModelKey<TClient>>(model: TKey, options: RepositoryOptions<DelegateOf<TClient, TKey>>): Repository<DelegateOf<TClient, TKey>>;

  /** …with both options and custom methods. */
  repository<TKey extends ModelKey<TClient>, TExt extends Record<string, unknown>>(
    model: TKey,
    options: RepositoryOptions<DelegateOf<TClient, TKey>>,
    extend: RepositoryExtender<DelegateOf<TClient, TKey>, TExt>,
  ): Repository<DelegateOf<TClient, TKey>> & TExt;

  /**
   * Runs `fn` inside a Prisma interactive transaction. Repositories used inside
   * it automatically run on that transaction client (ambient context).
   *
   * ⚠️ Prisma has no savepoints, so a **nested** call reuses the ambient
   * transaction instead of opening a new one (same as the mongoose adapter;
   * drizzle-pg creates a real savepoint there).
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/* ---------------------- compile-time wire alignment ----------------------- */
/* A validated (string-keyed) payload is assignable to the repository params —
 * i.e. no `as OffsetParams<...>` cast in the route. The loop closes through
 * core: `@querykitjs/zod` checks that its output matches these wire shapes, and
 * here we check the shapes reach the repository. Mirrors the other two adapters.
 * `test/` is not typechecked (`include: ["src"]`), so these live in `src`. */

type Expect<T extends true> = T;
type _WireOffset = Expect<Core.WireOffsetParams extends OffsetParams ? true : false>;
type _WireInfinite = Expect<Core.WireInfiniteParams extends InfiniteParams ? true : false>;
type _WireCursor = Expect<Core.WireCursorParams extends CursorParams ? true : false>;
/* Loose keys keep autocomplete: a real field name is still a member of the type. */
type _KeepsAutocomplete = Expect<"name" extends LooseFieldKey<{ findFirstOrThrow: () => Promise<{ name: string }> }> ? true : false>;
