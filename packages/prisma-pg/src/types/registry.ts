import type * as Core from "@querykitjs/core";

import type { FieldMeta } from "../internal/fields";
import type { AnyClient, AnyDelegate, ColumnSelection, DelegateOf, FieldKey, ModelKey, Scope } from "./common";
import type { Repository, RepositoryExtender } from "./repository";

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
  /**
   * Server-side request limits (core `DEFAULT_QUERY_LIMITS`: depth 5, conditions 30,
   * array 200, string 256, offset 10 000, sort 3) — enforced even when validation was
   * bypassed. Past one ⇒ `QueryKitError` (`reason: "limit-exceeded"`). A repository's
   * own `limits` win.
   */
  limits?: Partial<Core.QueryLimits>;
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
  /**
   * Fields a client may filter by, and the operators for each (`"*"` — all). A
   * relation field is `"relation.field"` (`"posts.title": ["="]`). A field not
   * listed ⇒ `reason: "forbidden-key"`, an operator not listed ⇒ `"forbidden-operator"`
   * — a `QueryKitError` whatever `strict` says, before Prisma is called.
   * **When not given** — `allowedColumns` (else the `forcedColumns` keys, else only
   * the `@id` field) with `"="` and `"in"` only. `aggregate` fields come from this list too.
   */
  filterable?: Core.Filterable<FieldKey<TDelegate> | `${string}.${string}`>;
  /**
   * Fields a client may sort (and use as `cursorKey`) by. When not given — the
   * `@id` field and `createdAt` (when the model has it). Anything else ⇒
   * `reason: "forbidden-key"`.
   */
  sortable?: readonly FieldKey<TDelegate>[];
  /** Request limits for this repository — over the registry's `limits`. */
  limits?: Partial<Core.QueryLimits>;
}

/** DB registry: created once, yields model repositories. */
export interface Registry<TClient extends AnyClient = AnyClient> {
  /** The Prisma client the registry was created with. */
  readonly client: TClient;

  /**
   * Repository for a model — addressed either by the model handle
   * (`prisma.user`, like the drizzle-pg and mongoose registries take a table or
   * a Model) or by its Prisma delegate key (`"user"`, camelCase).
   *
   * @example
   * ```ts
   * export const usersRepository = registry.repository(prisma.user);
   * // …or, equivalently:
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

  /* …and the same four, addressed by the model handle itself (`prisma.user`). */
  repository<TDelegate extends AnyDelegate>(model: TDelegate): Repository<TDelegate>;
  repository<TDelegate extends AnyDelegate, TExt extends Record<string, unknown>>(
    model: TDelegate,
    extend: RepositoryExtender<TDelegate, TExt>,
  ): Repository<TDelegate> & TExt;
  repository<TDelegate extends AnyDelegate>(model: TDelegate, options: RepositoryOptions<TDelegate>): Repository<TDelegate>;
  repository<TDelegate extends AnyDelegate, TExt extends Record<string, unknown>>(
    model: TDelegate,
    options: RepositoryOptions<TDelegate>,
    extend: RepositoryExtender<TDelegate, TExt>,
  ): Repository<TDelegate> & TExt;

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
