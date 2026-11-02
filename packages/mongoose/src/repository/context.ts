import type { Relations } from "@querykitjs/core";
import type { ClientSession, Model } from "mongoose";
import { QueryKitError, QueryKitTimeoutError, type QueryLimits, type SkippedCondition } from "@querykitjs/core";
import {
  checkWith,
  type Diagnostics,
  isAllRows,
  isEmptyFilter,
  type Policy,
  refuseEmptyFilter,
  resolvePolicy,
  scopeConditions,
  type WithDialect,
} from "@querykitjs/core/internal";

import type { FieldCondition, FieldKey, Filter, Id, QueryParams, RepositoryOptions, Sort } from "../types";
import { hasPath, resolveField, type AnyModel } from "../internal/fields";
import { buildSort } from "../internal/order-by";
import { buildWhere, type Query } from "../internal/where";
import { buildProjection, type Projection } from "./projection";

/** Registry-level runtime injected into every repository. */
export interface RepoRuntime {
  /** Active transaction session, if any. */
  getSession: () => ClientSession | undefined;
  defaultPerPage: number;
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
  /** Read time limit in ms; a repository's own `maxTimeMS` wins. */
  maxTimeMS: number;
  /** Signs cursor tokens (task 012). */
  cursorSecret?: string;
  /** createdAt / deletedAt field names (task 014); default `createdAt`, `deletedAt`. */
  timestamps?: { createdAt?: string; deletedAt?: string };
}

// Mongoose's Query generics are extremely deep; we drive queries untyped
// internally (the public Repository surface stays fully typed) and cast results.

export type AnyQuery = any;

export interface FindOpts<TDoc> {
  sort?: Record<string, 1 | -1>;
  columns?: QueryParams<TDoc>["columns"];
  with?: QueryParams<TDoc>["with"];
  limit?: number;
  skip?: number;
}

/**
 * Everything one model's repository methods share: the model, the compiled
 * scope and soft-delete guard, the projection guard and the query helpers.
 * Built once per `buildRepository` call; the method groups (`read`, `cursor`,
 * `aggregate`, `mutate`) only read from it.
 */
export interface RepoContext<TDoc> extends Projection<TDoc> {
  runtime: RepoRuntime;
  m: AnyModel;
  diag: Diagnostics;
  hasDeletedAt: boolean;
  /** The soft-delete path (`timestamps.deletedAt`, default `deletedAt`). */
  deletedAtPath: string;
  /** Stamp `updatedAt` when the schema has a manual one (no `timestamps`). */
  forUpdate: <T extends object>(patch: T) => T;
  sortSpec: (sort?: Sort<TDoc>) => Record<string, 1 | -1>;
  /**
   * The client's `with`, checked against `relations` (task 014, R21): an unlisted relation,
   * column, filter field or nested relation is `forbidden-key`, `site: "with"`. A column list
   * is selected even when the client asks with `true`.
   */
  withOf: (value: unknown) => never;
  /** User filter + scope + soft-delete guard as one Mongo query. */
  /** `filterable` / `sortable` / `limits` — every client-facing read checks through it. */
  policy: Policy;
  /** This repository's read time limit, in ms. */
  maxTimeMS: number;
  composeWhere: (userFilter?: Filter<TDoc>, withDeleted?: boolean) => Query;
  /**
   * The WHERE of `updateWhere` / `deleteWhere` (task 013): `{ all: true }` → scope and
   * soft-delete guard only; an empty filter — also one whose every condition was skipped —
   * is `empty-filter`; the filter passes the request policy like a read's.
   */
  mutationWhere: (filter: unknown, method: "updateWhere" | "deleteWhere") => Query;
  /** `filter AND idKey = id`. */
  withId: (filter: Filter<TDoc> | undefined, idKey: string, id: Id) => Filter<TDoc>;
  /** `.populate()` every truthy `with` entry. */
  applyPopulate: (q: AnyQuery, withRel?: QueryParams<TDoc>["with"]) => AnyQuery;
  /** Join the active transaction session, if any. */
  attachSession: (q: AnyQuery) => AnyQuery;
  runFind: (where: Query, opts: FindOpts<TDoc>) => Promise<unknown[]>;
  countWhere: (where: Query) => Promise<number>;
}

export function buildRepoContext<TDoc>(runtime: RepoRuntime, model: Model<TDoc>, config: RepositoryOptions<TDoc>): RepoContext<TDoc> {
  const m = model as AnyModel;
  // Task 014: the registry's `timestamps` names these paths.
  const deletedAtPath = resolveField(m, runtime.timestamps?.deletedAt ?? "deletedAt") ?? "deletedAt";
  const hasDeletedAt = hasPath(m, deletedAtPath);
  const createdAtConfigured = runtime.timestamps?.createdAt !== undefined;
  const createdAtPath = resolveField(m, runtime.timestamps?.createdAt ?? "createdAt");
  // Mongoose auto-bumps `updatedAt` only when the schema opts into timestamps;
  // for a manual `updatedAt` path we stamp it ourselves so every update path
  // bumps it — matching drizzle-pg's forUpdate.
  const timestampsOn = Boolean((m.schema as { options?: { timestamps?: unknown } }).options?.timestamps);
  const stampUpdatedAt = hasPath(m, "updatedAt") && !timestampsOn;
  const forUpdate = <T extends object>(patch: T): T => (stampUpdatedAt ? { ...patch, updatedAt: new Date() } : patch);

  const scopeWhere = buildScopeWhere(m, config);

  /* Diagnostics channel — built once, threaded into the filter/sort compilers. */
  const diag: Diagnostics = {
    source: m.modelName,
    strict: runtime.strict,
    onSkipped: runtime.onSkippedCondition,
  };

  const sortSpec = (sort?: Sort<TDoc>): Record<string, 1 | -1> => buildSort(m, sort as Sort | undefined, diag, createdAtPath);
  // A bare model (`{ author: User }`) is for typing only and opens nothing (R21).
  const withOf = (value: unknown) => checkWith(value, config.relations as Relations | undefined, WITH_DIALECT, diag.source) as never;

  /** An already built user filter + scope + soft-delete guard. */
  const combineWhere = (userWhere: Query | undefined, withDeleted?: boolean): Query => {
    const parts = [userWhere, scopeWhere, hasDeletedAt && !withDeleted ? { [deletedAtPath]: { $eq: null } } : undefined].filter(
      (p): p is Query => p !== undefined,
    );
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0]!;
    return { $and: parts };
  };
  const composeWhere = (userFilter?: Filter<TDoc>, withDeleted?: boolean): Query =>
    combineWhere(buildWhere(m, userFilter as Filter | undefined, diag), withDeleted);

  const withId = (filter: Filter<TDoc> | undefined, idKey: string, id: Id): Filter<TDoc> => {
    const idCondition: FieldCondition<TDoc> = { key: idKey as FieldKey<TDoc>, operation: "=", value: id as never };
    if (!filter) return [idCondition];
    if (Array.isArray(filter)) return [...filter, idCondition];
    return { and: [filter, idCondition] };
  };

  const guards = buildProjection(m, config);

  const maxTimeMS = config.maxTimeMS ?? runtime.maxTimeMS;
  const attachSession = (q: AnyQuery): AnyQuery => {
    const s = runtime.getSession();
    if (s) q.session(s);
    if (READ_OPS.has((q as unknown as { op?: string }).op ?? "")) timeLimit(q, m.modelName, maxTimeMS);
    return q;
  };

  const runFind = (where: Query, opts: FindOpts<TDoc>): Promise<unknown[]> => {
    let q: AnyQuery = m.find(where, guards.projection(opts.columns));
    if (opts.sort) q = q.sort(opts.sort);
    if (typeof opts.skip === "number") q = q.skip(opts.skip);
    if (typeof opts.limit === "number") q = q.limit(opts.limit);
    q = applyPopulate(q, opts.with);
    return attachSession(q).lean().exec() as Promise<unknown[]>;
  };

  const countWhere = (where: Query): Promise<number> => attachSession(m.countDocuments(where)).exec() as Promise<number>;

  const policy = resolvePolicy({
    source: m.modelName,
    // `id` is `_id` on the wire, like everywhere else in this adapter.
    fieldOf: key => resolveField(m, key),
    primaryKey: "_id",
    createdAt: createdAtConfigured ? createdAtPath : (createdAtPath ?? resolveField(m, "created_at")),
    filterable: config.filterable as never,
    sortable: config.sortable as readonly string[] | undefined,
    allowedColumns: config.allowedColumns as readonly string[] | undefined,
    forcedColumns: config.forcedColumns as Record<string, unknown> | undefined,
    limits: { ...runtime.limits, ...config.limits },
  });

  const mutationWhere = (filter: unknown, method: "updateWhere" | "deleteWhere"): Query => {
    if (isAllRows(filter)) return combineWhere(undefined);
    if (isEmptyFilter(filter)) refuseEmptyFilter(diag.source, method);
    policy.checkFilter(filter as Filter<TDoc>);
    const userWhere = buildWhere(m, filter as Filter, diag);
    return userWhere === undefined ? refuseEmptyFilter(diag.source, method) : combineWhere(userWhere);
  };

  return {
    ...guards,
    policy,
    maxTimeMS,
    runtime,
    m,
    diag,
    hasDeletedAt,
    deletedAtPath,
    forUpdate,
    sortSpec,
    withOf,
    composeWhere,
    mutationWhere,
    withId,
    applyPopulate,
    attachSession,
    runFind,
    countWhere,
  };
}

/** `.populate()` every truthy `with` entry. */
/** Populate options: `select`, nested `populate`, `match` (field-checked), `options.limit` / `options.skip`. */
const WITH_DIALECT: WithDialect = {
  columns: "select",
  nested: "populate",
  filters: ["match"],
  logical: ["$and", "$or", "$nor"],
  paging: ["limit", "skip"],
  options: "options",
};

function applyPopulate(q: AnyQuery, withRel?: Record<string, unknown>): AnyQuery {
  if (withRel) {
    for (const key of Object.keys(withRel)) {
      const value = withRel[key];
      if (!value) continue;
      // `true` → populate the field; an object → pass through as populate options
      // (`{ author: { select: "name" } }` → `.populate({ path, select })`).
      q.populate(typeof value === "object" ? { path: key, ...(value as object) } : key);
    }
  }
  return q;
}

/** `value`, `[value]` or `[]` — for spec fields that take one key or a list. */
export const toArr = <T>(v?: T | T[]): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** The scope as a precompiled Mongo query (equality on each field), or `undefined`. */
function buildScopeWhere<TDoc>(m: AnyModel, config: RepositoryOptions<TDoc>): Query | undefined {
  // Task 014: an equality value or `{ in: [...] }`.
  const conditions = scopeConditions(config.scope as Record<string, unknown> | undefined) as unknown as FieldCondition[];
  // A scope is the server's own RBAC / tenancy filter, so a key that does not
  // resolve must never be dropped: that would silently widen every query on this
  // repository. Fail when it is configured, not per request, and regardless of
  // `strict` — this is a programming error, not bad input.
  for (const condition of conditions) {
    if (!resolveField(m, condition.key)) {
      throw new QueryKitError({ source: m.modelName, site: "filter", key: condition.key, reason: "unknown-key" });
    }
  }
  // An empty `in` list matches no row (`$in: []`).
  return conditions.length ? buildWhere(m, conditions) : undefined;
}

/** Reads that get a time limit; writes are never cut off half-way. */
const READ_OPS: ReadonlySet<string> = new Set(["find", "findOne", "countDocuments", "distinct"]);

/** MongoDB's error for a read past `maxTimeMS` (code 50). */
export const isTimeLimitError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  ((error as { codeName?: unknown }).codeName === "MaxTimeMSExpired" || (error as { code?: unknown }).code === 50);

/** Set `maxTimeMS` on a read and turn a time-limit failure into `QueryKitTimeoutError`. */
function timeLimit(q: AnyQuery, source: string, maxTimeMS: number): void {
  q.maxTimeMS(maxTimeMS);
  const exec = q.exec.bind(q);
  q.exec = (async (...args: unknown[]) => {
    try {
      return await (exec as (...a: unknown[]) => Promise<unknown>)(...args);
    } catch (error) {
      throw isTimeLimitError(error) ? new QueryKitTimeoutError(source, maxTimeMS, { cause: error }) : error;
    }
  }) as typeof q.exec;
}
