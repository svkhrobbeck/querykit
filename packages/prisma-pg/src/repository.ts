import { QueryKitError, type SkippedCondition } from "@querykitjs/core";

import type {
  AggregateRow,
  AggregateSpec,
  ByIdParams,
  ColumnSelection,
  CursorParams,
  CursorResult,
  FieldCondition,
  Filter,
  Id,
  InfiniteParams,
  InfiniteResult,
  Insert,
  OffsetParams,
  OffsetResult,
  QueryParams,
  Repository,
  RepositoryOptions,
  Row,
  Scope,
  SortDirection,
  UpsertOptions,
} from "./types";
import type { AnyExecutor } from "./internal/context";
import { castValue, readModelMeta, resolveField, type ModelMeta } from "./internal/fields";
import { reportSkip, type Diagnostics } from "./internal/diagnostics";
import { buildProjection, pickColumns, truthyKeys, type Projection, type ProjectionGuard } from "./internal/projection";
import { encodeCursor, decodeCursor } from "./internal/cursor";
import { buildOrderBy } from "./internal/order-by";
import { andWhere, buildWhere, type Where } from "./internal/where";

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
}

/** The delegate methods this adapter drives, kept structural on purpose. */
interface RuntimeDelegate {
  findMany(args?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findFirst(args?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(args?: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  createManyAndReturn?(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  upsert(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  aggregate(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  groupBy(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

const CHUNK_SIZE = 1000;

/**
 * Clamp a requested page size into `[1, max]`, falling back to the default when
 * omitted. Applied in the repository as well as in validation, so a bypassed or
 * mis-configured schema still cannot ask for the whole table.
 */
const clampPageSize = (requested: number | undefined, fallback: number, max: number): number => Math.min(max, Math.max(1, Math.trunc(requested ?? fallback)));

const toArray = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/**
 * Build a model-scoped repository. `runtime` (client + ambient transaction
 * context) comes from the registry, so this file never touches the app's
 * database handle directly.
 */
export function buildRepository<TDelegate>(runtime: RepoRuntime, modelKey: string, config: RepositoryOptions<TDelegate> = {}): Repository<TDelegate> {
  const meta: ModelMeta = readModelMeta(runtime.baseClient, modelKey, config.fields);

  /** Resolved per call so repositories inside `registry.transaction` use the tx client. */
  const delegate = (): RuntimeDelegate => runtime.getExecutor()[modelKey] as RuntimeDelegate;

  /* Diagnostics channel — built once, threaded into the filter/sort compilers. */
  const diag: Diagnostics = {
    source: meta.name,
    strict: runtime.strict,
    onSkipped: runtime.onSkippedCondition,
  };

  /**
   * Several write paths need to address a row by its primary key: Prisma's
   * `update`/`delete` accept only a unique `where`, while querykit's filters are
   * arbitrary predicates (they also carry the scope and soft-delete guards). So
   * the row is located first, then written by key. Works for a single `@id` and
   * for a composite `@@id` alike.
   */
  const requirePrimaryKey = (method: string): string[] => {
    if (meta.primaryKey.length === 0) {
      throw new Error(
        `${method}: model "${meta.name}" has no primary key, so a row cannot be addressed individually. ` +
          `Use updateWhere/deleteWhere with an explicit filter instead.`,
      );
    }
    return meta.primaryKey;
  };

  /** `select` that fetches just the key fields. */
  const keySelect = (key: string[]): Record<string, true> => Object.fromEntries(key.map(field => [field, true]));

  /**
   * Prisma's unique `where` for one row. A composite `@@id` is addressed through
   * its compound key (`{ a_b: { a, b } }`), the name Prisma generates from the
   * field list unless `@@id(name:)` says otherwise.
   */
  const uniqueWhere = (key: string[], row: Record<string, unknown>): Record<string, unknown> => {
    if (key.length === 1) return { [key[0]!]: row[key[0]!] };
    return { [meta.primaryKeyName ?? key.join("_")]: Object.fromEntries(key.map(field => [field, row[field]])) };
  };

  /** A `where` matching exactly the given rows by key (used for bulk re-reads). */
  const keyedIn = (key: string[], rows: Record<string, unknown>[]): Where => {
    if (key.length === 1) return { [key[0]!]: { in: rows.map(row => row[key[0]!]) } };
    return { OR: rows.map(row => Object.fromEntries(key.map(field => [field, row[field]]))) };
  };

  // Precomputed base filter from the scope (equality on each field).
  const scopeConditions: FieldCondition[] = config.scope
    ? Object.entries(config.scope).map(([key, value]) => ({ key, operation: "=" as const, value: value as never }))
    : [];
  // A scope is the server's own RBAC / tenancy filter, so a key that does not
  // resolve must never be dropped: that would silently widen every query on this
  // repository. Fail when it is configured, not per request, and regardless of
  // `strict` — this is a programming error, not bad input.
  for (const condition of scopeConditions) {
    if (!resolveField(meta, condition.key)) {
      throw new QueryKitError({ source: meta.name, site: "filter", key: condition.key, reason: "unknown-key" });
    }
  }
  const scopeWhere = scopeConditions.length ? buildWhere(meta, scopeConditions) : undefined;

  /** Compose user filter + scope + soft-delete guard into one `where`. */
  const composeWhere = (userFilter?: Filter<TDelegate>, withDeleted?: boolean): Where | undefined =>
    andWhere([buildWhere(meta, userFilter as Filter, diag), scopeWhere, meta.hasDeletedAt && !withDeleted ? { deletedAt: null } : undefined]);

  /**
   * Merge an id predicate into a filter as AND.
   *
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

  /* ------------------------- projection guards --------------------------- */
  /* `columns` may arrive straight from the wire, so the safe selection belongs
   * here rather than in every route — the same reasoning as `scope`. Both
   * options are validated once, at build time, so a misconfiguration surfaces in
   * development instead of quietly returning full rows in production. */

  const forcedKeys = config.forcedColumns ? truthyKeys(config.forcedColumns as Record<string, boolean>) : undefined;
  if (config.forcedColumns && forcedKeys!.length === 0) {
    throw new Error("buildRepository: forcedColumns must select at least one field (an empty selection would return the full row).");
  }

  const allowed = config.allowedColumns ? new Set<string>(config.allowedColumns as readonly string[]) : undefined;
  if (config.allowedColumns && allowed!.size === 0) {
    throw new Error("buildRepository: allowedColumns must list at least one field (an empty allowlist would return the full row).");
  }

  const guard: ProjectionGuard = { forcedKeys, allowed };
  const guarded = Boolean(forcedKeys ?? allowed);
  /** Whether a field may appear in a result at all. */
  const permits = (key: string): boolean => (forcedKeys ? forcedKeys.includes(key) : allowed ? allowed.has(key) : true);

  const projection = (columns?: QueryParams<TDelegate>["columns"], withRelations?: QueryParams<TDelegate>["with"], forceKeys?: string[]): Projection =>
    buildProjection(meta, guard, columns as Record<string, boolean> | undefined, withRelations, forceKeys);

  /** Apply scope defaults to insert values — scope wins (can't be overridden). */
  const forInsert = (values: object): Record<string, unknown> => ({
    ...(config.scope as object),
    ...values,
    ...(config.scope as object),
  });

  /**
   * Bump `updatedAt` on update when the model has one. Prisma maintains
   * `@updatedAt` fields itself, so those are left alone (`stampUpdatedAt` is
   * only set for a plain `updatedAt` field) — matching drizzle-pg's `forUpdate`
   * and mongoose's `timestamps` handling.
   */
  const forUpdate = (patch: object): Record<string, unknown> => {
    const stamped: Record<string, unknown> = { ...patch };
    if (meta.stampUpdatedAt) stamped[meta.stampUpdatedAt] = new Date();
    return stamped;
  };

  const countWhere = (where?: Where): Promise<number> => delegate().count({ where });

  /**
   * The conflict `where` for `upsert`. Prisma addresses a compound unique
   * constraint by its generated name — the target field names joined with `_`
   * (`@@unique([a, b])` → `where: { a_b: { a, b } }`). A constraint declared with
   * an explicit `name:` must be targeted through the raw client.
   */
  const upsertWhere = (targets: string[], values: Record<string, unknown>): Record<string, unknown> => {
    const fields = targets.map(key => {
      const field = resolveField(meta, key);
      if (!field) throw new Error(`upsert: unknown target field "${key}".`);
      return field;
    });
    if (fields.length === 1) return { [fields[0]!]: values[fields[0]!] };
    return { [fields.join("_")]: Object.fromEntries(fields.map(field => [field, values[field]])) };
  };

  /** Default update-on-conflict set: the inserted values minus target/creation fields. */
  const defaultConflictSet = (values: Record<string, unknown>, targetKeys: string[]): Record<string, unknown> => {
    const skip = new Set([...targetKeys, "createdAt"]);
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!skip.has(key)) set[key] = value;
    }
    return forUpdate(set);
  };

  const repository = {
    get delegate() {
      return delegate() as unknown as TDelegate;
    },

    async findAll(params: QueryParams<TDelegate> = {}) {
      const rows = await delegate().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(meta, params.sort as never, diag),
        ...projection(params.columns, params.with),
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TDelegate> = {}) {
      const row = await delegate().findFirst({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(meta, params.sort as never, diag),
        ...projection(params.columns, params.with),
      });
      return (row ?? undefined) as never;
    },

    async findById(id: Id, params: ByIdParams<TDelegate> = {}) {
      const { idKey = "id", filter } = params;
      const row = await delegate().findFirst({
        where: composeWhere(withId(filter, idKey as string, id), params.withDeleted),
        ...projection(params.columns, params.with),
      });
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TDelegate> = {}) {
      const page = Math.max(1, Math.trunc(params.page ?? 1));
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      const where = composeWhere(params.filter, params.withDeleted);

      const [data, total_items] = await Promise.all([
        delegate().findMany({
          where,
          orderBy: buildOrderBy(meta, params.sort as never, diag),
          take: perPage,
          skip: (page - 1) * perPage,
          ...projection(params.columns, params.with),
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

    async findInfinite(params: InfiniteParams<TDelegate> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = Math.max(0, Math.trunc(params.offset ?? 0));

      const rows = await delegate().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(meta, params.sort as never, diag),
        take: limit + 1,
        skip: offset,
        ...projection(params.columns, params.with),
      });

      const has_more = rows.length > limit;
      const data = has_more ? rows.slice(0, limit) : rows;
      return {
        data,
        meta: { limit, offset, count: data.length, has_more, next_offset: has_more ? offset + limit : null },
      } as InfiniteResult<never>;
    },

    async findCursor(params: CursorParams<TDelegate> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const field = resolveField(meta, cursorKey);
      // Always fatal: without a usable cursor field there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (all three adapters agree).
      if (!field) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      // A cursor token carries dates as ISO strings, so re-cast to the field's
      // type — otherwise Prisma rejects `gt(dateTimeField, "2026-…")` and page 2
      // of a date-keyed feed 500s. A token that does not fit is treated as "no
      // cursor" (like an undecodable one).
      const decoded = decodeCursor(params.cursor);
      const cursorValue = decoded === undefined ? undefined : castValue(meta, field, decoded);
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      // Keyset via WHERE (not Prisma's native `cursor`+`skip`) so the token stays
      // interchangeable with the drizzle-pg and mongoose adapters.
      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const seek: Where | undefined = cursorValue !== undefined ? { [field]: ascInQuery ? { gt: cursorValue } : { lt: cursorValue } } : undefined;
      const where = andWhere([baseWhere, seek]);

      // Force-include the cursor field when a selection is given — otherwise its
      // value is missing and next/prev tokens break. `cursorKey` is
      // client-supplied, so under a projection guard this would be a way to read
      // a forbidden field: keep it in the query (pagination needs it) but strip
      // it from the rows we hand back.
      const selected = pickColumns(guard, params.columns as Record<string, boolean> | undefined);
      const leaksCursorField = guarded && selected !== undefined && !permits(cursorKey) && !permits(field);

      const rows = await delegate().findMany({
        where,
        orderBy: [{ [field]: ascInQuery ? "asc" : "desc" }],
        take: limit + 1,
        ...projection(params.columns, params.with, [field]),
      });

      const hasExtra = rows.length > limit;
      let page = hasExtra ? rows.slice(0, limit) : rows;
      if (direction === "backward") page = [...page].reverse();

      const first = page[0];
      const last = page[page.length - 1];

      const has_next = direction === "forward" ? hasExtra : cursorValue !== undefined;
      const has_prev = direction === "forward" ? cursorValue !== undefined : hasExtra;

      const meta_ = {
        limit,
        has_next,
        has_prev,
        next_cursor: has_next && last ? encodeCursor(last[field]) : null,
        prev_cursor: has_prev && first ? encodeCursor(first[field]) : null,
      };

      // Cursor values are read above, so the field can go now.
      if (leaksCursorField) {
        page = page.map(row => {
          const { [field]: _cursor, ...rest } = row;
          return rest;
        });
      }

      return { data: page, meta: meta_ } as CursorResult<never>;
    },

    count(filter?: Filter<TDelegate>) {
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TDelegate>) {
      return (await countWhere(composeWhere(filter))) > 0;
    },

    /* ------------------------------- writes ------------------------------- */

    async create(values: Insert<TDelegate>) {
      const row = await delegate().create({ data: forInsert(values as object) });
      return row as Row<TDelegate>;
    },

    async createMany(values: Insert<TDelegate>[]) {
      if (values.length === 0) return [];
      const data = values.map(v => forInsert(v as object));
      const d = delegate();
      // Prisma's `createMany` returns only a count. `createManyAndReturn` (5.14+,
      // Postgres) returns the rows; without it, fall back to sequential creates
      // so the `Row[]` contract — which drizzle's `.returning()` and mongoose's
      // `insertMany` both honour — still holds.
      if (typeof d.createManyAndReturn === "function") {
        return (await d.createManyAndReturn({ data })) as Row<TDelegate>[];
      }
      const out: Row<TDelegate>[] = [];
      for (const item of data) out.push((await d.create({ data: item })) as Row<TDelegate>);
      return out;
    },

    async upsert(values: Insert<TDelegate>, options: UpsertOptions<TDelegate>) {
      const targetKeys = toArray(options.target) as string[];
      const inserted = forInsert(values as object);
      const update = options.set ? forUpdate(options.set as object) : defaultConflictSet(inserted, targetKeys);
      const row = await delegate().upsert({
        where: upsertWhere(targetKeys, inserted),
        create: inserted,
        update,
      });
      return row as Row<TDelegate>;
    },

    async upsertMany(values: Insert<TDelegate>[], options: UpsertOptions<TDelegate>) {
      if (values.length === 0) return [];
      const targetKeys = toArray(options.target) as string[];
      const out: Row<TDelegate>[] = [];
      // Prisma has no bulk upsert, so this is a sequential loop (chunked only to
      // keep the promise pressure bounded). Input order is preserved, matching
      // the other adapters' return contract.
      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        for (const value of values.slice(i, i + CHUNK_SIZE)) {
          const inserted = forInsert(value as object);
          const update = options.set ? forUpdate(options.set as object) : defaultConflictSet(inserted, targetKeys);
          out.push(
            (await delegate().upsert({
              where: upsertWhere(targetKeys, inserted),
              create: inserted,
              update,
            })) as Row<TDelegate>,
          );
        }
      }
      return out;
    },

    async updateById(id: Id, patch: Partial<Insert<TDelegate>>, idKey: string = "id") {
      return updateOne(composeWhere(withId(undefined, idKey, id)), forUpdate(patch as object), "updateById");
    },

    async updateWhere(filter: Filter<TDelegate>, patch: Partial<Insert<TDelegate>>) {
      const key = requirePrimaryKey("updateWhere");
      const where = composeWhere(filter);
      const d = delegate();
      // Prisma's `updateMany` returns a count, so the affected keys are collected
      // first and re-read afterwards (the same shape the mongoose adapter uses).
      const found = await d.findMany({ where, select: keySelect(key) });
      if (found.length === 0) return [];
      const keyed = keyedIn(key, found);
      await d.updateMany({ where: keyed, data: forUpdate(patch as object) });
      return (await d.findMany({ where: keyed })) as Row<TDelegate>[];
    },

    async deleteById(id: Id, idKey: string = "id") {
      const key = requirePrimaryKey("deleteById");
      const d = delegate();
      const target = await d.findFirst({ where: composeWhere(withId(undefined, idKey, id)) });
      if (!target) return undefined;
      return (await d.delete({ where: uniqueWhere(key, target) })) as Row<TDelegate>;
    },

    async deleteWhere(filter: Filter<TDelegate>) {
      const key = requirePrimaryKey("deleteWhere");
      const d = delegate();
      const where = composeWhere(filter);
      const rows = await d.findMany({ where });
      if (rows.length === 0) return [];
      await d.deleteMany({ where: keyedIn(key, rows) });
      return rows as Row<TDelegate>[];
    },

    async softDelete(id: Id, idKey: string = "id") {
      if (!meta.hasDeletedAt) throw new Error("softDelete: model has no deletedAt field.");
      return updateOne(composeWhere(withId(undefined, idKey, id), false), forUpdate({ deletedAt: new Date() }), "softDelete");
    },

    async restore(id: Id, idKey: string = "id") {
      if (!meta.hasDeletedAt) throw new Error("restore: model has no deletedAt field.");
      return updateOne(composeWhere(withId(undefined, idKey, id), true), forUpdate({ deletedAt: null }), "restore");
    },

    async aggregate(spec: AggregateSpec<TDelegate>): Promise<AggregateRow[]> {
      // An aggregate spec can also come from a request, and `min(password)` or a
      // `groupBy` on a hidden field leaks just as much as a projection — so the
      // same guard applies here (matching drizzle-pg and mongoose).
      const aggregable = (key: string): string | undefined => {
        const field = permits(key) ? resolveField(meta, key) : undefined;
        if (!field) reportSkip(diag, { site: "aggregate", key, reason: "unknown-key" });
        return field;
      };

      const groupFields = toArray(spec.groupBy as string | string[] | undefined)
        .map(aggregable)
        .filter((field): field is string => Boolean(field));

      const selectionFor = (keys: string[]): Record<string, true> | undefined => {
        const picked: Record<string, true> = {};
        for (const key of keys) {
          const field = aggregable(key);
          if (field) picked[field] = true;
        }
        return Object.keys(picked).length ? picked : undefined;
      };

      const sum = selectionFor(toArray(spec.sum as string | string[] | undefined));
      const avg = selectionFor(toArray(spec.avg as string | string[] | undefined));
      const min = selectionFor(toArray(spec.min as string | string[] | undefined));
      const max = selectionFor(toArray(spec.max as string | string[] | undefined));

      const args: Record<string, unknown> = { where: composeWhere(spec.filter as Filter<TDelegate> | undefined, spec.withDeleted) };
      if (spec.count) args._count = true;
      if (sum) args._sum = sum;
      if (avg) args._avg = avg;
      if (min) args._min = min;
      if (max) args._max = max;

      /** Flatten Prisma's `{_count, _sum: {x}}` into drizzle's `{count, sum_x}` shape. */
      const flatten = (row: Record<string, unknown>): AggregateRow => {
        const out: AggregateRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (!key.startsWith("_")) {
            out[key] = value;
            continue;
          }
          if (key === "_count") {
            if (typeof value === "number") out.count = value;
            continue;
          }
          const prefix = key.slice(1); // "_sum" → "sum"
          for (const [field, aggregated] of Object.entries((value ?? {}) as Record<string, unknown>)) {
            if (aggregated !== undefined) out[`${prefix}_${field}`] = aggregated;
          }
        }
        return out;
      };

      if (groupFields.length > 0) {
        const rows = await delegate().groupBy({ ...args, by: groupFields });
        return rows.map(flatten);
      }
      return [flatten(await delegate().aggregate(args))];
    },

    scoped(scope: Scope<TDelegate>) {
      return buildRepository<TDelegate>(runtime, modelKey, { ...config, scope: { ...config.scope, ...scope } });
    },
  };

  /**
   * Update the single row matching an arbitrary predicate. Prisma's `update`
   * only accepts a unique `where`, while querykit's predicate also carries the
   * scope and soft-delete guards — so the row is located first, then updated by
   * its primary key.
   */
  async function updateOne(where: Where | undefined, data: Record<string, unknown>, method: string): Promise<Row<TDelegate> | undefined> {
    const key = requirePrimaryKey(method);
    const d = delegate();
    const target = await d.findFirst({ where, select: keySelect(key) });
    if (!target) return undefined;
    return (await d.update({ where: uniqueWhere(key, target), data })) as Row<TDelegate>;
  }

  return repository as unknown as Repository<TDelegate>;
}

/** Re-exported for tests and advanced use. */
export type { ColumnSelection };
