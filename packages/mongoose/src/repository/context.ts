import type { ClientSession, Model } from "mongoose";
import { QueryKitError, type SkippedCondition } from "@querykitjs/core";
import type { Diagnostics } from "@querykitjs/core/internal";

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
  /** Stamp `updatedAt` when the schema has a manual one (no `timestamps`). */
  forUpdate: <T extends object>(patch: T) => T;
  sortSpec: (sort?: Sort<TDoc>) => Record<string, 1 | -1>;
  /** User filter + scope + soft-delete guard as one Mongo query. */
  composeWhere: (userFilter?: Filter<TDoc>, withDeleted?: boolean) => Query;
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
  const hasDeletedAt = hasPath(m, "deletedAt");
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

  const sortSpec = (sort?: Sort<TDoc>): Record<string, 1 | -1> => buildSort(m, sort as Sort | undefined, diag);

  const composeWhere = (userFilter?: Filter<TDoc>, withDeleted?: boolean): Query => {
    const parts = [
      buildWhere(m, userFilter as Filter | undefined, diag),
      scopeWhere,
      hasDeletedAt && !withDeleted ? { deletedAt: { $eq: null } } : undefined,
    ].filter((p): p is Query => p !== undefined);
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0]!;
    return { $and: parts };
  };

  const withId = (filter: Filter<TDoc> | undefined, idKey: string, id: Id): Filter<TDoc> => {
    const idCondition: FieldCondition<TDoc> = { key: idKey as FieldKey<TDoc>, operation: "=", value: id as never };
    if (!filter) return [idCondition];
    if (Array.isArray(filter)) return [...filter, idCondition];
    return { and: [filter, idCondition] };
  };

  const guards = buildProjection(m, config);

  const attachSession = (q: AnyQuery): AnyQuery => {
    const s = runtime.getSession();
    if (s) q.session(s);
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

  return {
    ...guards,
    runtime,
    m,
    diag,
    hasDeletedAt,
    forUpdate,
    sortSpec,
    composeWhere,
    withId,
    applyPopulate,
    attachSession,
    runFind,
    countWhere,
  };
}

/** `.populate()` every truthy `with` entry. */
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
  const scopeConditions: FieldCondition[] = config.scope
    ? Object.entries(config.scope).map(([key, value]) => ({ key, operation: "=", value: value as never }))
    : [];
  // A scope is the server's own RBAC / tenancy filter, so a key that does not
  // resolve must never be dropped: that would silently widen every query on this
  // repository. Fail when it is configured, not per request, and regardless of
  // `strict` — this is a programming error, not bad input.
  for (const condition of scopeConditions) {
    if (!resolveField(m, condition.key)) {
      throw new QueryKitError({ source: m.modelName, site: "filter", key: condition.key, reason: "unknown-key" });
    }
  }
  return scopeConditions.length ? buildWhere(m, scopeConditions) : undefined;
}
