import { and, asc, desc, gt, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

import type {
  AggregateRow,
  AggregateSpec,
  AnyDb,
  ByIdParams,
  ColumnKey,
  CursorParams,
  CursorResult,
  Filter,
  FieldCondition,
  Id,
  InfiniteParams,
  InfiniteResult,
  Insert,
  OffsetParams,
  OffsetResult,
  QueryParams,
  Repository,
  Row,
  Scope,
  SortDirection,
  UpsertOptions,
} from "./types";
import { getTableKey, resolveColumn } from "./internal/columns";
import { encodeCursor, decodeCursor } from "./internal/cursor";
import { buildOrderBy } from "./internal/order-by";
import { buildWhere } from "./internal/where";

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
}

/** Per-repository configuration (scope). */
export interface RepoConfig<TTable extends AnyPgTable> {
  scope?: Scope<TTable>;
}

interface RelationalHandle {
  findMany(config?: Record<string, unknown>): Promise<unknown[]>;
  findFirst(config?: Record<string, unknown>): Promise<unknown>;
}

const CHUNK_SIZE = 1000;

/**
 * Build a table-scoped repository. `runtime` (db + context) comes from the
 * registry, so this file never imports the app's database directly.
 */
export function buildRepository<TTable extends AnyPgTable, TSchema extends Record<string, unknown>>(
  runtime: RepoRuntime,
  schema: TSchema,
  table: TTable,
  config: RepoConfig<TTable> = {},
): Repository<TTable, TSchema> {
  const tableKey = getTableKey(schema, table);
  if (!tableKey) {
    throw new Error("buildRepository: table was not found in the provided schema.");
  }

  const executor = () => runtime.getExecutor();
  const handle = (): RelationalHandle => (executor().query as Record<string, RelationalHandle>)[tableKey]!;

  // Auto-detected columns (by JS property name): updatedAt is bumped on update,
  // deletedAt enables soft-delete.
  const updatedAtCol = resolveColumn(table, "updatedAt");
  const deletedAtCol = resolveColumn(table, "deletedAt");

  // Precomputed base filter from the scope (equality on each field).
  const scopeConditions: FieldCondition<TTable>[] = config.scope
    ? Object.entries(config.scope).map(([key, value]) => ({
        key: key as ColumnKey<TTable>,
        operation: "=",
        value: value as never,
      }))
    : [];
  const scopeWhere = scopeConditions.length ? buildWhere(table, scopeConditions) : undefined;

  /** Compose user filter + scope + soft-delete guard into one WHERE. */
  const composeWhere = (userFilter?: Filter<TTable>, withDeleted?: boolean): SQL | undefined => {
    const parts = [buildWhere(table, userFilter), scopeWhere, deletedAtCol && !withDeleted ? isNull(deletedAtCol) : undefined].filter(
      (part): part is SQL => part !== undefined,
    );
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  };

  /** Merge an id predicate into a filter as AND. */
  const withId = (filter: Filter<TTable> | undefined, idKey: string, id: Id): Filter<TTable> => {
    const idCondition = { key: idKey, operation: "=" as const, value: id };
    if (!filter) return [idCondition] as Filter<TTable>;
    if (Array.isArray(filter)) return [...filter, idCondition] as Filter<TTable>;
    return { and: [filter, idCondition] } as Filter<TTable>;
  };

  // Inclusion-only: drop `false` selections so `{a:true,b:false}` includes only
  // `a`, and an all-`false`/empty object returns the full row (matches the
  // mongoose adapter and the `Pick<Row,K>` contract).
  const pickColumns = (columns?: QueryParams<TTable>["columns"]) => {
    if (!columns) return undefined;
    const picked = Object.fromEntries(Object.entries(columns).filter(([, v]) => v));
    return Object.keys(picked).length > 0 ? picked : undefined;
  };

  /** Apply scope defaults to insert values (scope wins). */
  const forInsert = (values: object): object => ({
    ...(config.scope as object),
    ...values,
    ...(config.scope as object),
  });

  /** Bump updatedAt on update if the column exists. */
  const forUpdate = (patch: object): object => {
    const stamped: Record<string, unknown> = { ...patch };
    if (updatedAtCol) stamped.updatedAt = new Date();
    return stamped;
  };

  const countWhere = async (where?: SQL): Promise<number> => {
    const query = executor()
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(table as AnyPgTable);
    const rows = await (where ? query.where(where) : query);
    return rows[0]?.value ?? 0;
  };

  const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

  const resolveTargets = (target: UpsertOptions<TTable>["target"]): AnyPgColumn[] =>
    toArray(target).map(key => {
      const column = resolveColumn(table, key);
      if (!column) throw new Error(`upsert: unknown target column "${key}".`);
      return column;
    });

  /** Default ON CONFLICT SET: provided columns (minus target/creation) → excluded. */
  const defaultConflictSet = (sample: object, targetKeys: string[]): Record<string, unknown> => {
    const set: Record<string, unknown> = {};
    const skip = new Set([...targetKeys, "createdAt"]);
    for (const key of Object.keys(sample)) {
      if (skip.has(key)) continue;
      const column = resolveColumn(table, key);
      if (column) set[key] = sql`excluded.${sql.identifier(column.name)}`;
    }
    if (updatedAtCol) set.updatedAt = sql`now()`;
    return set;
  };

  const repository = {
    table,

    async findAll(params: QueryParams<TTable> = {}) {
      const rows = await handle().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort),
        columns: pickColumns(params.columns),
        with: params.with,
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TTable> = {}) {
      const row = await handle().findFirst({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort),
        columns: pickColumns(params.columns),
        with: params.with,
      });
      return (row ?? undefined) as never;
    },

    async findById(id: Id, params: ByIdParams<TTable> = {}) {
      const { idKey = "id", filter, ...rest } = params;
      const row = await handle().findFirst({
        where: composeWhere(withId(filter, idKey, id), params.withDeleted),
        columns: pickColumns(rest.columns),
        with: rest.with,
      });
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TTable> = {}) {
      const page = Math.max(1, Math.trunc(params.page ?? 1));
      const perPage = Math.max(1, Math.trunc(params.perPage ?? runtime.defaultPerPage));
      const where = composeWhere(params.filter, params.withDeleted);

      const [data, total_items] = await Promise.all([
        handle().findMany({
          where,
          orderBy: buildOrderBy(table, params.sort),
          limit: perPage,
          offset: (page - 1) * perPage,
          columns: pickColumns(params.columns),
          with: params.with,
        }),
        countWhere(where),
      ]);

      const total_pages = Math.ceil(total_items / perPage);
      return {
        data,
        meta: {
          total_items,
          total_pages,
          current_page: page,
          per_page: perPage,
          has_next: page < total_pages,
          has_prev: page > 1,
        },
      } as OffsetResult<never>;
    },

    async findInfinite(params: InfiniteParams<TTable> = {}) {
      const limit = Math.max(1, Math.trunc(params.limit ?? runtime.defaultLimit));
      const offset = Math.max(0, Math.trunc(params.offset ?? 0));

      const rows = await handle().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort),
        limit: limit + 1,
        offset,
        columns: pickColumns(params.columns),
        with: params.with,
      });

      const has_more = rows.length > limit;
      const data = has_more ? rows.slice(0, limit) : rows;
      return {
        data,
        meta: {
          limit,
          offset,
          count: data.length,
          has_more,
          next_offset: has_more ? offset + limit : null,
        },
      } as InfiniteResult<never>;
    },

    async findCursor(params: CursorParams<TTable> = {}) {
      const limit = Math.max(1, Math.trunc(params.limit ?? runtime.defaultLimit));
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const column = resolveColumn(table, cursorKey);
      if (!column) throw new Error(`findCursor: unknown cursorKey "${cursorKey}".`);

      const cursorValue = decodeCursor(params.cursor);
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const seek = cursorValue !== undefined ? (ascInQuery ? gt(column, cursorValue) : lt(column, cursorValue)) : undefined;
      const where = seek && baseWhere ? and(baseWhere, seek) : (seek ?? baseWhere);

      // Force-include the cursor column when a columns selection is given —
      // otherwise its value is missing and next/prev cursors break.
      const selected = pickColumns(params.columns);
      const columns = selected ? { ...selected, [cursorKey]: true } : undefined;

      const rows = await handle().findMany({
        where,
        orderBy: [ascInQuery ? asc(column) : desc(column)],
        limit: limit + 1,
        columns,
        with: params.with,
      });

      const hasExtra = rows.length > limit;
      let page = hasExtra ? rows.slice(0, limit) : rows;
      if (direction === "backward") page = [...page].reverse();

      const first = page[0] as Record<string, unknown> | undefined;
      const last = page[page.length - 1] as Record<string, unknown> | undefined;

      const has_next = direction === "forward" ? hasExtra : cursorValue !== undefined;
      const has_prev = direction === "forward" ? cursorValue !== undefined : hasExtra;

      return {
        data: page,
        meta: {
          limit,
          has_next,
          has_prev,
          next_cursor: has_next && last ? encodeCursor(last[cursorKey]) : null,
          prev_cursor: has_prev && first ? encodeCursor(first[cursorKey]) : null,
        },
      } as CursorResult<never>;
    },

    count(filter?: Filter<TTable>) {
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TTable>) {
      return (await countWhere(composeWhere(filter))) > 0;
    },

    async aggregate(spec: AggregateSpec<TTable>): Promise<AggregateRow[]> {
      const groupKeys = toArray(spec.groupBy);
      const selection: Record<string, SQL | AnyPgColumn> = {};

      for (const key of groupKeys) {
        const column = resolveColumn(table, key);
        if (column) selection[key] = column;
      }
      if (spec.count) selection.count = sql<number>`count(*)`.mapWith(Number);
      for (const key of toArray(spec.sum)) {
        const c = resolveColumn(table, key);
        if (c) selection[`sum_${key}`] = sql<number>`sum(${c})`.mapWith(Number);
      }
      for (const key of toArray(spec.avg)) {
        const c = resolveColumn(table, key);
        if (c) selection[`avg_${key}`] = sql<number>`avg(${c})`.mapWith(Number);
      }
      for (const key of toArray(spec.min)) {
        const c = resolveColumn(table, key);
        if (c) selection[`min_${key}`] = sql`min(${c})`;
      }
      for (const key of toArray(spec.max)) {
        const c = resolveColumn(table, key);
        if (c) selection[`max_${key}`] = sql`max(${c})`;
      }

      let query = executor()
        .select(selection as never)
        .from(table as AnyPgTable)
        .$dynamic();
      const where = composeWhere(spec.filter, spec.withDeleted);
      if (where) query = query.where(where);
      const groupColumns = groupKeys.map(key => resolveColumn(table, key)).filter((c): c is AnyPgColumn => Boolean(c));
      if (groupColumns.length) query = query.groupBy(...groupColumns);

      return (await query) as AggregateRow[];
    },

    async create(values: Insert<TTable>) {
      const [row] = await executor()
        .insert(table)
        .values(forInsert(values) as never)
        .returning();
      return row as Row<TTable>;
    },

    async createMany(values: Insert<TTable>[]) {
      if (values.length === 0) return [];
      return (await executor()
        .insert(table)
        .values(values.map(forInsert) as never)
        .returning()) as Row<TTable>[];
    },

    async upsert(values: Insert<TTable>, options: UpsertOptions<TTable>) {
      const target = resolveTargets(options.target);
      const targetKeys = toArray(options.target) as string[];
      const inserted = forInsert(values);
      const set = options.set ?? defaultConflictSet(inserted, targetKeys);

      const query = executor()
        .insert(table)
        .values(inserted as never);
      const rows = await (
        Object.keys(set).length > 0 ? query.onConflictDoUpdate({ target, set: set as never }) : query.onConflictDoNothing({ target })
      ).returning();

      if (rows[0]) return rows[0] as Row<TTable>;
      // Conflict with nothing to update → return the existing row. Query it
      // directly (no scope / no soft-delete guard) so a soft-deleted or
      // out-of-scope conflicting row is still found — the type stays non-optional.
      const conflictFilter = targetKeys.map(key => ({
        key: key as ColumnKey<TTable>,
        operation: "=" as const,
        value: (inserted as Record<string, never>)[key],
      }));
      const existing = await handle().findFirst({ where: buildWhere(table, conflictFilter) });
      return existing as Row<TTable>;
    },

    async upsertMany(values: Insert<TTable>[], options: UpsertOptions<TTable>) {
      if (values.length === 0) return [];
      const target = resolveTargets(options.target);
      const targetKeys = toArray(options.target) as string[];
      const out: Row<TTable>[] = [];

      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        const chunk = values.slice(i, i + CHUNK_SIZE).map(forInsert);
        const set = options.set ?? defaultConflictSet(chunk[0]!, targetKeys);
        const query = executor()
          .insert(table)
          .values(chunk as never);
        const rows = await (
          Object.keys(set).length > 0 ? query.onConflictDoUpdate({ target, set: set as never }) : query.onConflictDoNothing({ target })
        ).returning();
        out.push(...(rows as Row<TTable>[]));
      }
      return out;
    },

    async updateById(id: Id, patch: Partial<Insert<TTable>>, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      const where = composeWhere(withId(undefined, idKey, id));
      const [row] = await executor()
        .update(table)
        .set(forUpdate(patch) as never)
        .where(where)
        .returning();
      return (row ?? undefined) as Row<TTable> | undefined;
    },

    async updateWhere(filter: Filter<TTable>, patch: Partial<Insert<TTable>>) {
      const where = composeWhere(filter);
      return (await executor()
        .update(table)
        .set(forUpdate(patch) as never)
        .where(where)
        .returning()) as Row<TTable>[];
    },

    async deleteById(id: Id, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      const where = composeWhere(withId(undefined, idKey, id));
      const [row] = await executor().delete(table).where(where).returning();
      return (row ?? undefined) as Row<TTable> | undefined;
    },

    async deleteWhere(filter: Filter<TTable>) {
      const where = composeWhere(filter);
      return (await executor().delete(table).where(where).returning()) as Row<TTable>[];
    },

    async softDelete(id: Id, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      if (!deletedAtCol) {
        throw new Error("softDelete: table has no deletedAt column.");
      }
      const where = composeWhere(withId(undefined, idKey, id), false);
      const [row] = await executor()
        .update(table)
        .set(forUpdate({ deletedAt: new Date() }) as never)
        .where(where)
        .returning();
      return (row ?? undefined) as Row<TTable> | undefined;
    },

    async restore(id: Id, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      if (!deletedAtCol) {
        throw new Error("restore: table has no deletedAt column.");
      }
      const where = composeWhere(withId(undefined, idKey, id), true);
      const [row] = await executor()
        .update(table)
        .set(forUpdate({ deletedAt: null }) as never)
        .where(where)
        .returning();
      return (row ?? undefined) as Row<TTable> | undefined;
    },

    scoped(scope: Scope<TTable>) {
      return buildRepository(runtime, schema, table, {
        ...config,
        scope: { ...config.scope, ...scope },
      });
    },
  };

  return repository as unknown as Repository<TTable, TSchema>;
}
