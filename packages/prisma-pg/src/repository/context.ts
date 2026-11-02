import { QueryKitError, type QueryLimits, type SkippedCondition } from "@querykitjs/core";
import {
  type Diagnostics,
  isAllRows,
  isEmptyFilter,
  matchesNothing,
  type Policy,
  refuseEmptyFilter,
  resolvePolicy,
  scopeConditions,
} from "@querykitjs/core/internal";

import type { FieldCondition, Filter, Id, QueryParams, RepositoryOptions } from "../types";
import type { AnyExecutor } from "../internal/executor";
import { readModelMeta, resolveField, type ModelMeta } from "../internal/fields";
import { buildProjection, truthyKeys, type Projection, type ProjectionGuard } from "../internal/projection";
import { andWhere, buildWhere, type Where } from "../internal/where";

/** Shared, registry-level runtime injected into every repository. */
export interface RepoRuntime {
  /** Base (non-transactional) Prisma client. */
  baseClient: AnyExecutor;
  /** Current executor — the active transaction client if any, else `baseClient`. */
  getExecutor: () => AnyExecutor;
  /** Default page size for `findList` when `perPage` is omitted. */
  defaultPerPage: number;
  /** Default `limit` for `findInfinite`/`findCursor` when omitted. */
  defaultLimit: number;
  /** Upper bound for `perPage`, applied even when validation was bypassed. */
  maxPerPage: number;
  /** Upper bound for `limit` (`findInfinite`/`findCursor`). */
  maxLimit: number;
  /** Throw `QueryKitError` instead of dropping an unresolvable condition. */
  strict: boolean;
  /** Called for every dropped condition (also when `strict` is off). */
  onSkippedCondition?: (info: SkippedCondition) => void;
  /** Registry-level request limits; a repository's own `limits` win. */
  limits?: Partial<QueryLimits>;
  /** Signs cursor tokens (task 012). */
  cursorSecret?: string;
}

/** The delegate methods this adapter drives, kept structural on purpose. */
export interface RuntimeDelegate {
  findMany(args?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findFirst(args?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(args?: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  createManyAndReturn?(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  /** Prisma ≥ 6.2 on PostgreSQL (the peer range is ^6.19 || ^7.10): the updated rows of one statement. */
  updateManyAndReturn(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  upsert(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  aggregate(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  groupBy(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

/**
 * Everything one model's repository methods share: the model metadata, the
 * delegate, the compiled scope and soft-delete guard, and the projection guard.
 * Built once per `buildRepository` call; the method groups (`read`, `cursor`,
 * `aggregate`, `mutate`) only read from it.
 */
export interface RepoContext<TDelegate> {
  runtime: RepoRuntime;
  meta: ModelMeta;
  diag: Diagnostics;
  /** Resolved per call so repositories inside `registry.transaction` use the tx client. */
  delegate: () => RuntimeDelegate;
  guard: ProjectionGuard;
  /** `forcedColumns` or `allowedColumns` is configured. */
  guarded: boolean;
  /** Whether a field may appear in a result at all. */
  permits: (key: string) => boolean;
  projection: (columns?: QueryParams<TDelegate>["columns"], withRelations?: QueryParams<TDelegate>["with"], forceKeys?: string[]) => Projection;
  /** `filterable` / `sortable` / `limits` — every client-facing read checks through it. */
  policy: Policy;
  /** User filter + scope + soft-delete guard as one `where`. */
  composeWhere: (userFilter?: Filter<TDelegate>, withDeleted?: boolean) => Where | undefined;
  /**
   * The WHERE of `updateWhere` / `deleteWhere` (task 013): `{ all: true }` → scope and
   * soft-delete guard only; an empty filter — also one whose every condition was skipped —
   * is `empty-filter`; the filter passes the request policy like a read's.
   */
  mutationWhere: (filter: unknown, method: "updateWhere" | "deleteWhere") => Where | undefined;
  /** `filter AND idKey = id`; an unresolvable `idKey` throws. */
  withId: (filter: Filter<TDelegate> | undefined, idKey: string, id: Id) => Filter<TDelegate>;
  countWhere: (where?: Where) => Promise<number>;
}

export function buildRepoContext<TDelegate>(runtime: RepoRuntime, modelKey: string, config: RepositoryOptions<TDelegate>): RepoContext<TDelegate> {
  const meta: ModelMeta = readModelMeta(runtime.baseClient, modelKey, config.fields);
  const delegate = (): RuntimeDelegate => runtime.getExecutor()[modelKey] as RuntimeDelegate;

  /* Diagnostics channel — built once, threaded into the filter/sort compilers. */
  const diag: Diagnostics = {
    source: meta.name,
    strict: runtime.strict,
    onSkipped: runtime.onSkippedCondition,
  };

  const scopeWhere = buildScopeWhere(meta, config);
  const policy = buildPolicy(meta, config, runtime.limits);

  /** An already built user `where` + scope + soft-delete guard. */
  const combineWhere = (userWhere: Where | undefined, withDeleted?: boolean): Where | undefined =>
    andWhere([userWhere, scopeWhere, meta.hasDeletedAt && !withDeleted ? { deletedAt: null } : undefined]);
  const composeWhere = (userFilter?: Filter<TDelegate>, withDeleted?: boolean): Where | undefined =>
    combineWhere(buildWhere(meta, userFilter as Filter, diag), withDeleted);

  const mutationWhere = (filter: unknown, method: "updateWhere" | "deleteWhere"): Where | undefined => {
    if (isAllRows(filter)) return combineWhere(undefined);
    if (isEmptyFilter(filter)) refuseEmptyFilter(diag.source, method);
    policy.checkFilter(filter as Filter<TDelegate>);
    const userWhere = buildWhere(meta, filter as Filter, diag);
    return userWhere === undefined ? refuseEmptyFilter(diag.source, method) : combineWhere(userWhere);
  };

  /*
   * An unresolvable `idKey` is **fatal**, never skipped: the normal "drop the
   * condition" path would leave `updateById`/`deleteById` with no predicate at
   * all and let them hit an arbitrary row. Same reasoning (and same error) as an
   * unknown `cursorKey`.
   */
  const withId = (filter: Filter<TDelegate> | undefined, idKey: string, id: Id): Filter<TDelegate> => {
    if (!resolveField(meta, idKey)) {
      throw new QueryKitError({ source: meta.name, site: "filter", key: idKey, reason: "unknown-key" });
    }
    const idCondition = { key: idKey, operation: "=" as const, value: id };
    if (!filter) return [idCondition] as Filter<TDelegate>;
    if (Array.isArray(filter)) return [...filter, idCondition] as Filter<TDelegate>;
    return { and: [filter, idCondition] } as Filter<TDelegate>;
  };

  const guard = buildGuard(config);
  const { forcedKeys, allowed } = guard;
  const permits = (key: string): boolean => (forcedKeys ? forcedKeys.includes(key) : allowed ? allowed.has(key) : true);

  const projection = (columns?: QueryParams<TDelegate>["columns"], withRelations?: QueryParams<TDelegate>["with"], forceKeys?: string[]): Projection =>
    buildProjection(meta, guard, columns as Record<string, boolean> | undefined, withRelations, forceKeys);

  const countWhere = (where?: Where): Promise<number> => delegate().count({ where });

  return {
    runtime,
    meta,
    diag,
    delegate,
    guard,
    policy,
    guarded: Boolean(forcedKeys ?? allowed),
    permits,
    projection,
    composeWhere,
    mutationWhere,
    withId,
    countWhere,
  };
}

/** `value`, `[value]` or `[]` — for spec fields that take one key or a list. */
export const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** The scope as a precompiled `where` (equality on each field), or `undefined`. */
function buildScopeWhere<TDelegate>(meta: ModelMeta, config: RepositoryOptions<TDelegate>): Where | undefined {
  // Task 014: an equality value or `{ in: [...] }`.
  const conditions = scopeConditions(config.scope as Record<string, unknown> | undefined) as unknown as FieldCondition[];
  // A scope is the server's own RBAC / tenancy filter, so a key that does not
  // resolve must never be dropped: that would silently widen every query on this
  // repository. Fail when it is configured, not per request, and regardless of
  // `strict` — this is a programming error, not bad input.
  for (const condition of conditions) {
    if (!resolveField(meta, condition.key)) {
      throw new QueryKitError({ source: meta.name, site: "filter", key: condition.key, reason: "unknown-key" });
    }
  }
  // An empty `in` list matches no row — explicitly (an empty OR is false), never by dropping it.
  if (matchesNothing(conditions as never)) return { OR: [] };
  return conditions.length ? buildWhere(meta, conditions) : undefined;
}

/**
 * Projection guards. `columns` may arrive straight from the wire, so the safe
 * selection belongs here rather than in every route — the same reasoning as
 * `scope`. Both options are validated once, at build time, so a
 * misconfiguration surfaces in development instead of quietly returning full
 * rows in production.
 */
function buildGuard<TDelegate>(config: RepositoryOptions<TDelegate>): ProjectionGuard {
  const forcedKeys = config.forcedColumns ? truthyKeys(config.forcedColumns as Record<string, boolean>) : undefined;
  if (config.forcedColumns && forcedKeys!.length === 0) {
    throw new Error("buildRepository: forcedColumns must select at least one field (an empty selection would return the full row).");
  }

  const allowed = config.allowedColumns ? new Set<string>(config.allowedColumns as readonly string[]) : undefined;
  if (config.allowedColumns && allowed!.size === 0) {
    throw new Error("buildRepository: allowedColumns must list at least one field (an empty allowlist would return the full row).");
  }

  return { forcedKeys, allowed };
}

/**
 * The model's request policy. A scalar field resolves like a filter key (an
 * `@map`ped column name maps to the field); `relation.field` is a field of its own
 * when `relation` is a relation field, so it can be opened or kept closed.
 */
function buildPolicy<TDelegate>(meta: ModelMeta, config: RepositoryOptions<TDelegate>, registryLimits?: Partial<QueryLimits>): Policy {
  const fieldOf = (key: string): string | undefined => {
    const dot = key.indexOf(".");
    if (dot < 0) return resolveField(meta, key);
    return meta.fields.get(key.slice(0, dot))?.kind === "object" ? key : undefined;
  };
  return resolvePolicy({
    source: meta.name,
    fieldOf,
    primaryKey: meta.idField ?? "id",
    createdAt: resolveField(meta, "createdAt"),
    filterable: config.filterable,
    sortable: config.sortable,
    allowedColumns: config.allowedColumns as readonly string[] | undefined,
    forcedColumns: config.forcedColumns as Record<string, unknown> | undefined,
    limits: { ...registryLimits, ...config.limits },
  });
}
