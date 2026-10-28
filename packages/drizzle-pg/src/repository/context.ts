import { and, getTableName, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { QueryKitError, type SkippedCondition } from "@querykitjs/core";
import { resolvePolicy, type Diagnostics, type Policy } from "@querykitjs/core/internal";
import type { QueryLimits } from "@querykitjs/core";

import type { AnyDb, ColumnKey, FieldCondition, Filter, Id, RepositoryOptions } from "../types";
import { getTableKey, isTable, resolveColumn, tableColumns } from "../internal/columns";
import { buildWhere } from "../internal/where";
import { buildProjection, type Projection } from "./projection";

/** Shared, registry-level runtime injected into every repository. */
export interface RepoRuntime {
  /** Base (non-transactional) database. */
  baseDb: AnyDb;
  /** Current executor — the active transaction if any, else `baseDb`. */
  getExecutor: () => AnyDb;
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
}

export interface RelationalHandle {
  findMany(config?: Record<string, unknown>): Promise<unknown[]>;
  findFirst(config?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Everything one table's repository methods share: the executor, the relational
 * handle, the compiled scope and soft-delete guard, and the projection guard.
 * Built once per `buildRepository` call; the method groups (`read`, `cursor`,
 * `aggregate`, `mutate`) only read from it.
 */
export interface RepoContext<TTable extends AnyPgTable> {
  runtime: RepoRuntime;
  table: TTable;
  diag: Diagnostics;
  executor: () => AnyDb;
  handle: () => RelationalHandle;
  updatedAtCol: AnyPgColumn | undefined;
  deletedAtCol: AnyPgColumn | undefined;
  projection: Projection<TTable>;
  /** `filterable` / `sortable` / `limits` — every client-facing read checks through it. */
  policy: Policy;
  /** User filter + scope + soft-delete guard as one WHERE. */
  composeWhere: (userFilter?: Filter<TTable>, withDeleted?: boolean) => SQL | undefined;
  /** `filter AND idKey = id`. */
  withId: (filter: Filter<TTable> | undefined, idKey: string, id: Id) => Filter<TTable>;
  countWhere: (where?: SQL) => Promise<number>;
}

export function buildRepoContext<TTable extends AnyPgTable, TSchema extends Record<string, unknown>>(
  runtime: RepoRuntime,
  schema: TSchema,
  table: TTable,
  config: RepositoryOptions<TTable>,
): RepoContext<TTable> {
  const tableKey = requireTableKey(schema, table);

  /* Diagnostics channel — built once, threaded into the filter/sort compilers. */
  const diag: Diagnostics = {
    source: getTableName(table),
    strict: runtime.strict,
    onSkipped: runtime.onSkippedCondition,
  };

  const executor = () => runtime.getExecutor();
  const handle = (): RelationalHandle => (executor().query as Record<string, RelationalHandle>)[tableKey]!;

  // Auto-detected columns (by JS property name): updatedAt is bumped on update,
  // deletedAt enables soft-delete.
  const updatedAtCol = resolveColumn(table, "updatedAt");
  const deletedAtCol = resolveColumn(table, "deletedAt");

  const scopeWhere = buildScopeWhere(table, config);
  const projection = buildProjection(config);
  const policy = buildPolicy(table, config, runtime.limits);

  const composeWhere = (userFilter?: Filter<TTable>, withDeleted?: boolean): SQL | undefined => {
    const parts = [buildWhere(table, userFilter, diag), scopeWhere, deletedAtCol && !withDeleted ? isNull(deletedAtCol) : undefined].filter(
      (part): part is SQL => part !== undefined,
    );
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  };

  const withId = (filter: Filter<TTable> | undefined, idKey: string, id: Id): Filter<TTable> => {
    const idCondition = { key: idKey, operation: "=" as const, value: id };
    if (!filter) return [idCondition] as Filter<TTable>;
    if (Array.isArray(filter)) return [...filter, idCondition] as Filter<TTable>;
    return { and: [filter, idCondition] } as Filter<TTable>;
  };

  const countWhere = async (where?: SQL): Promise<number> => {
    const query = executor()
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(table as AnyPgTable);
    const rows = await (where ? query.where(where) : query);
    return rows[0]?.value ?? 0;
  };

  return { runtime, table, diag, executor, handle, updatedAtCol, deletedAtCol, projection, policy, composeWhere, withId, countWhere };
}

/** The table's request policy. Fields are named by JS property; a DB column name maps to the same field. */
function buildPolicy<TTable extends AnyPgTable>(table: TTable, config: RepositoryOptions<TTable>, registryLimits?: Partial<QueryLimits>): Policy {
  const columns = tableColumns(table);
  const fieldByName = new Map<string, string>();
  for (const [key, column] of columns) {
    fieldByName.set(key, key);
    fieldByName.set(column.name, key);
  }
  const fieldOf = (key: string) => fieldByName.get(key);
  return resolvePolicy({
    source: getTableName(table),
    fieldOf,
    primaryKey: columns.find(([, column]) => column.primary)?.[0] ?? "id",
    createdAt: fieldOf("createdAt") ?? fieldOf("created_at"),
    filterable: config.filterable,
    sortable: config.sortable,
    allowedColumns: config.allowedColumns,
    forcedColumns: config.forcedColumns,
    limits: { ...registryLimits, ...config.limits },
  });
}

/** `value`, `[value]` or `[]` — for spec fields that take one key or a list. */
export const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

function requireTableKey(schema: Record<string, unknown>, table: AnyPgTable): string {
  const tableKey = getTableKey(schema, table);
  if (tableKey) return tableKey;
  // The lookup is by object identity, so the usual cause is two copies of the
  // schema module (a monorepo duplicate, a bundler, a second `* as schema`
  // import) rather than a genuinely missing table. Say which it is: a
  // same-named table under a different identity is almost always the former.
  const name = getTableName(table);
  const tableKeys = Object.keys(schema).filter(key => isTable(schema[key]));
  const sameName = tableKeys.find(key => getTableName(schema[key] as AnyPgTable) === name);
  throw new Error(
    sameName
      ? `buildRepository: table "${name}" was not found in the schema by identity, but key "${sameName}" holds a DIFFERENT table instance with the same name. ` +
          `You are importing the schema from two different modules — pass createRegistry the SAME schema object you passed to drizzle(client, { schema }).`
      : `buildRepository: table "${name}" was not found in the provided schema. Available tables: ${tableKeys.join(", ") || "(none)"}.`,
  );
}

/** The scope as a precompiled WHERE (equality on each field), or `undefined`. */
function buildScopeWhere<TTable extends AnyPgTable>(table: TTable, config: RepositoryOptions<TTable>): SQL | undefined {
  const scopeConditions: FieldCondition<TTable>[] = config.scope
    ? Object.entries(config.scope).map(([key, value]) => ({
        key: key as ColumnKey<TTable>,
        operation: "=",
        value: value as never,
      }))
    : [];
  // A scope is the server's own RBAC / tenancy filter, so a key that does not
  // resolve must never be dropped: that would silently widen every query on this
  // repository. Fail when it is configured, not per request, and regardless of
  // `strict` — this is a programming error, not bad input.
  for (const condition of scopeConditions) {
    if (!resolveColumn(table, condition.key)) {
      throw new QueryKitError({ source: getTableName(table), site: "filter", key: condition.key, reason: "unknown-key" });
    }
  }
  return scopeConditions.length ? buildWhere(table, scopeConditions) : undefined;
}
