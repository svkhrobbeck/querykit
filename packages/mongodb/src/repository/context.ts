/**
 * Per-repository context shared by the method groups: filter / scope / soft-delete composition,
 * the core request policy, projection guards, and the driver calls with the session and
 * `maxTimeMS` attached. The mongoose adapter's `repository/context.ts` over a driver `Collection`.
 */
import type { ClientSession, Collection, Document, FindOptions } from "mongodb";
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
import { resolveField, shapeFromSchema, type DocShape } from "../internal/fields";
import { buildSort } from "../internal/order-by";
import { buildWhere, type Query } from "../internal/where";
import { buildProjection, type Projection } from "./projection";

export interface RepoRuntime {
  getSession: () => ClientSession | undefined;
  defaultPerPage: number;
  defaultLimit: number;
  maxPerPage: number;
  maxLimit: number;
  strict: boolean;
  onSkippedCondition?: (info: SkippedCondition) => void;
  limits?: Partial<QueryLimits>;
  maxTimeMS: number;
  cursorSecret?: string;
  timestamps?: { createdAt?: string; deletedAt?: string };
}

export interface FindOpts<TDoc> {
  sort?: Record<string, 1 | -1>;
  columns?: QueryParams<TDoc>["columns"];
  limit?: number;
  skip?: number;
}

export interface RepoContext<TDoc extends Document> extends Projection<TDoc> {
  runtime: RepoRuntime;
  collection: Collection<TDoc>;
  shape: DocShape;
  diag: Diagnostics;
  hasDeletedAt: boolean;
  deletedAtPath: string;
  forUpdate: <T extends object>(patch: T) => T;
  sortSpec: (sort?: Sort<TDoc>) => Record<string, 1 | -1>;
  /** `with` is refused in this version (no `$lookup`): `forbidden-key`, site `with`. */
  withOf: (value: unknown) => void;
  policy: Policy;
  maxTimeMS: number;
  composeWhere: (userFilter?: Filter<TDoc>, withDeleted?: boolean) => Query;
  mutationWhere: (filter: unknown, method: "updateWhere" | "deleteWhere") => Query;
  withId: (filter: Filter<TDoc> | undefined, idKey: string, id: Id) => Filter<TDoc>;
  /** The session (inside `registry.transaction`) for a write. */
  session: () => { session?: ClientSession };
  /** Runs a read with the time limit; a `MaxTimeMSExpired` error becomes `QueryKitTimeoutError`. */
  timed: <T>(read: (options: { maxTimeMS: number; session?: ClientSession }) => Promise<T>) => Promise<T>;
  runFind: (where: Query, opts: FindOpts<TDoc>) => Promise<TDoc[]>;
  countWhere: (where: Query) => Promise<number>;
}

/** No relation can be opened yet: an empty allow-list makes every `with` key `forbidden-key`. */
const WITH_DIALECT: WithDialect = {
  columns: "projection",
  nested: "with",
  filters: ["match"],
  logical: ["$and", "$or", "$nor"],
  paging: ["limit", "skip"],
  options: "options",
};

export const isTimeLimitError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  ((error as { codeName?: unknown }).codeName === "MaxTimeMSExpired" || (error as { code?: unknown }).code === 50);

export function buildRepoContext<TDoc extends Document>(
  runtime: RepoRuntime,
  collection: Collection<TDoc>,
  config: RepositoryOptions<TDoc>,
): RepoContext<TDoc> {
  const shape = shapeFromSchema(collection.collectionName, config.schema, config.objectId as readonly string[] | undefined);
  const deletedAtPath = resolveField(shape, runtime.timestamps?.deletedAt ?? "deletedAt") ?? "deletedAt";
  const hasDeletedAt = shape.fields.has(deletedAtPath);
  const createdAtConfigured = runtime.timestamps?.createdAt !== undefined;
  const createdAtPath = resolveField(shape, runtime.timestamps?.createdAt ?? "createdAt");
  // The driver has no `timestamps` option: a schema with `updatedAt` gets it stamped on every update.
  const stampUpdatedAt = shape.fields.has("updatedAt");
  const forUpdate = <T extends object>(patch: T): T => (stampUpdatedAt ? { ...patch, updatedAt: new Date() } : patch);

  const diag: Diagnostics = { source: shape.source, strict: runtime.strict, onSkipped: runtime.onSkippedCondition };
  const scopeWhere = buildScopeWhere(shape);

  function buildScopeWhere(docShape: DocShape): Query | undefined {
    const conditions = scopeConditions(config.scope as Record<string, unknown> | undefined) as unknown as FieldCondition[];
    for (const condition of conditions) {
      if (!resolveField(docShape, condition.key))
        throw new QueryKitError({ source: docShape.source, site: "filter", key: condition.key, reason: "unknown-key" });
    }
    return conditions.length ? buildWhere(docShape, conditions) : undefined;
  }

  const sortSpec = (sort?: Sort<TDoc>): Record<string, 1 | -1> => buildSort(shape, sort as Sort | undefined, diag, createdAtPath);
  const withOf = (value: unknown): void => {
    checkWith(value, undefined, WITH_DIALECT, diag.source);
  };

  const combineWhere = (userWhere: Query | undefined, withDeleted?: boolean): Query => {
    const parts = [userWhere, scopeWhere, hasDeletedAt && !withDeleted ? { [deletedAtPath]: { $eq: null } } : undefined].filter(
      (p): p is Query => p !== undefined,
    );
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0]!;
    return { $and: parts };
  };
  const composeWhere = (userFilter?: Filter<TDoc>, withDeleted?: boolean): Query =>
    combineWhere(buildWhere(shape, userFilter as Filter | undefined, diag), withDeleted);

  const withId = (filter: Filter<TDoc> | undefined, idKey: string, id: Id): Filter<TDoc> => {
    const idCondition: FieldCondition<TDoc> = { key: idKey as FieldKey<TDoc>, operation: "=", value: id as never };
    if (!filter) return [idCondition];
    if (Array.isArray(filter)) return [...filter, idCondition];
    return { and: [filter, idCondition] };
  };

  const guards = buildProjection(shape, config);
  const maxTimeMS = config.maxTimeMS ?? runtime.maxTimeMS;

  const session = (): { session?: ClientSession } => {
    const current = runtime.getSession();
    return current ? { session: current } : {};
  };

  const timed = async <T>(read: (options: { maxTimeMS: number; session?: ClientSession }) => Promise<T>): Promise<T> => {
    try {
      return await read({ maxTimeMS, ...session() });
    } catch (error) {
      throw isTimeLimitError(error) ? new QueryKitTimeoutError(shape.source, maxTimeMS, { cause: error }) : error;
    }
  };

  const runFind = (where: Query, opts: FindOpts<TDoc>): Promise<TDoc[]> =>
    timed(options => {
      const findOptions: FindOptions = { ...options };
      const projection = guards.projection(opts.columns);
      if (projection) findOptions.projection = projection;
      if (opts.sort) findOptions.sort = opts.sort;
      if (typeof opts.skip === "number") findOptions.skip = opts.skip;
      if (typeof opts.limit === "number") findOptions.limit = opts.limit;
      return collection.find(where as never, findOptions).toArray() as Promise<TDoc[]>;
    });

  const countWhere = (where: Query): Promise<number> => timed(options => collection.countDocuments(where as never, options));

  const policy = resolvePolicy({
    source: shape.source,
    fieldOf: key => resolveField(shape, key),
    primaryKey: "_id",
    createdAt: createdAtConfigured ? createdAtPath : (createdAtPath ?? resolveField(shape, "created_at")),
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
    const userWhere = buildWhere(shape, filter as Filter, diag);
    return userWhere === undefined ? refuseEmptyFilter(diag.source, method) : combineWhere(userWhere);
  };

  return {
    ...guards,
    runtime,
    collection,
    shape,
    diag,
    hasDeletedAt,
    deletedAtPath,
    forUpdate,
    sortSpec,
    withOf,
    policy,
    maxTimeMS,
    composeWhere,
    mutationWhere,
    withId,
    session,
    timed,
    runFind,
    countWhere,
  };
}

export const toArr = <T>(v?: T | T[]): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
