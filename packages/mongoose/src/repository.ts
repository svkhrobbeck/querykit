import type { ClientSession, Model } from "mongoose";

import type {
  AggregateRow,
  AggregateSpec,
  ByIdParams,
  CursorParams,
  CursorResult,
  FieldCondition,
  FieldKey,
  Filter,
  Id,
  InfiniteParams,
  InfiniteResult,
  Insert,
  OffsetParams,
  OffsetResult,
  ColumnSelection,
  QueryParams,
  Repository,
  RepositoryOptions,
  Row,
  Scope,
  Sort,
  SortDirection,
  UpsertOptions,
} from "./types";
import { resolveField, hasPath, castValue, type AnyModel } from "./internal/fields";
import { buildWhere, type Query } from "./internal/where";
import { buildSort } from "./internal/order-by";
import { encodeCursor, decodeCursor } from "./internal/cursor";

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
}

/**
 * Clamp a requested page size into `[1, max]`, falling back to the default when
 * omitted. Applied in the repository as well as in validation, so a bypassed or
 * mis-configured schema still cannot ask for the whole collection.
 */
const clampPageSize = (requested: number | undefined, fallback: number, max: number): number => Math.min(max, Math.max(1, Math.trunc(requested ?? fallback)));

// Mongoose's Query generics are extremely deep; we drive queries untyped
// internally (the public Repository surface stays fully typed) and cast results.

type AnyQuery = any;

/**
 * Build a model-scoped repository. `runtime` (session getter + defaults) comes
 * from the registry, so this file never touches the connection directly.
 */
export function buildRepository<TDoc>(runtime: RepoRuntime, model: Model<TDoc>, config: RepositoryOptions<TDoc> = {}): Repository<TDoc> {
  const m = model as AnyModel;
  const hasDeletedAt = hasPath(m, "deletedAt");
  // Mongoose auto-bumps `updatedAt` only when the schema opts into timestamps;
  // for a manual `updatedAt` path we stamp it ourselves so every update path
  // bumps it — matching drizzle-pg's forUpdate.
  const timestampsOn = Boolean((m.schema as { options?: { timestamps?: unknown } }).options?.timestamps);
  const stampUpdatedAt = hasPath(m, "updatedAt") && !timestampsOn;
  const forUpdate = <T extends object>(patch: T): T => (stampUpdatedAt ? { ...patch, updatedAt: new Date() } : patch);

  // Scope → equality conditions applied to every query (as a flat filter).
  const scopeConditions: FieldCondition[] = config.scope
    ? Object.entries(config.scope).map(([key, value]) => ({ key, operation: "=", value: value as never }))
    : [];
  const scopeWhere = scopeConditions.length ? buildWhere(m, scopeConditions) : undefined;

  const sortSpec = (sort?: Sort<TDoc>): Record<string, 1 | -1> => buildSort(m, sort as Sort | undefined);

  /** Compose user filter + scope + soft-delete guard into one Mongo query. */
  const composeWhere = (userFilter?: Filter<TDoc>, withDeleted?: boolean): Query => {
    const parts = [buildWhere(m, userFilter as Filter | undefined), scopeWhere, hasDeletedAt && !withDeleted ? { deletedAt: { $eq: null } } : undefined].filter(
      (p): p is Query => p !== undefined,
    );
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0]!;
    return { $and: parts };
  };

  /** Merge an id predicate into a filter as AND. */
  const withId = (filter: Filter<TDoc> | undefined, idKey: string, id: Id): Filter<TDoc> => {
    const idCondition: FieldCondition<TDoc> = { key: idKey as FieldKey<TDoc>, operation: "=", value: id as never };
    if (!filter) return [idCondition];
    if (Array.isArray(filter)) return [...filter, idCondition];
    return { and: [filter, idCondition] };
  };

  /* ------------------------- projection guards --------------------------- */
  /* `columns` may arrive straight from the wire, so the safe selection belongs
   * here rather than in every route — the same reasoning as `scope`. Both options
   * are validated once, at build time, so a misconfiguration surfaces in
   * development instead of quietly returning full documents in production.
   * Identical semantics to the drizzle-pg adapter. */

  const truthyKeys = (selection: ColumnSelection<TDoc>): string[] =>
    Object.entries(selection)
      .filter(([, on]) => on)
      .map(([key]) => key);

  const forcedKeys = config.forcedColumns ? truthyKeys(config.forcedColumns) : undefined;
  if (config.forcedColumns && forcedKeys!.length === 0) {
    throw new Error("buildRepository: forcedColumns must select at least one field (an empty selection would return the full document).");
  }

  const allowed = config.allowedColumns ? new Set<string>(config.allowedColumns as readonly string[]) : undefined;
  if (config.allowedColumns && allowed!.size === 0) {
    throw new Error("buildRepository: allowedColumns must list at least one field (an empty allowlist would return the full document).");
  }

  const guarded = Boolean(forcedKeys ?? allowed);
  /** Whether a field may appear in a result at all. */
  const permits = (key: string): boolean => (forcedKeys ? forcedKeys.includes(key) : allowed ? allowed.has(key) : true);

  /** Client selection ∩ allowlist; empty intersection → the allowlist itself. */
  const intersectAllowed = (requested: string[]): string[] => {
    const hit = requested.filter(key => allowed!.has(key));
    return hit.length > 0 ? hit : [...allowed!];
  };

  /**
   * Column selection → Mongo projection, or undefined when empty. Adds `_id: 0`
   * unless the caller selected `id`/`_id`, so the runtime shape matches the
   * inferred `Pick<...>` type (Mongo otherwise always returns `_id`). Returns
   * undefined (full doc) when no requested column resolves.
   *
   * With `forcedColumns` the caller's selection is ignored outright; with
   * `allowedColumns` it is intersected, and an empty intersection falls back to
   * the allowlist — **never** to the full document.
   */
  const projection = (columns?: QueryParams<TDoc>["columns"]): Record<string, 0 | 1> | undefined => {
    const requested = columns ? truthyKeys(columns as ColumnSelection<TDoc>) : [];
    const keys = forcedKeys ?? (allowed ? intersectAllowed(requested) : requested);
    if (keys.length === 0) return undefined;
    const proj: Record<string, 0 | 1> = {};
    let includesId = false;
    for (const k of keys) {
      const field = resolveField(m, k);
      if (!field) continue;
      proj[field] = 1;
      if (field === "_id") includesId = true;
    }
    if (Object.keys(proj).length === 0) return undefined; // all unknown → full doc
    if (!includesId) proj._id = 0; // exclude _id unless explicitly selected (exact columns, like drizzle)
    return proj;
  };

  const applyPopulate = (q: AnyQuery, withRel?: QueryParams<TDoc>["with"]): AnyQuery => {
    if (withRel) {
      for (const key of Object.keys(withRel)) {
        const value = (withRel as Record<string, unknown>)[key];
        if (!value) continue;
        // `true` → populate the field; an object → pass through as populate options
        // (`{ author: { select: "name" } }` → `.populate({ path, select })`).
        q.populate(typeof value === "object" ? { path: key, ...(value as object) } : key);
      }
    }
    return q;
  };

  const attachSession = (q: AnyQuery): AnyQuery => {
    const s = runtime.getSession();
    if (s) q.session(s);
    return q;
  };

  const toArr = <T>(v?: T | T[]): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

  /** Apply scope defaults to insert values — scope wins (can't be overridden). */
  const forInsert = (values: object): Record<string, unknown> => ({
    ...(config.scope as object),
    ...values,
    ...(config.scope as object),
  });

  /** Build the `{filter, update}` for an upsert (target → filter, rest → $set/$setOnInsert). */
  const buildUpsert = (values: Insert<TDoc>, options: UpsertOptions<TDoc>) => {
    const targetKeys = toArr(options.target) as string[];
    const inserted = forInsert(values);
    const filter: Record<string, unknown> = {};
    for (const key of targetKeys) {
      const field = resolveField(m, key);
      if (!field) throw new Error(`upsert: unknown target field "${key}".`);
      filter[field] = inserted[key];
    }
    // $set (applied on insert + conflict) defaults to values minus target keys.
    const set: Record<string, unknown> = options.set
      ? { ...(options.set as Record<string, unknown>) }
      : Object.fromEntries(Object.entries(inserted).filter(([k]) => !targetKeys.includes(k)));
    // $setOnInsert (insert only) = remaining non-target values not already in $set.
    const setOnInsert = Object.fromEntries(Object.entries(inserted).filter(([k]) => !targetKeys.includes(k) && !(k in set)));
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(setOnInsert).length) update.$setOnInsert = setOnInsert;
    return { filter, update };
  };

  interface FindOpts {
    sort?: Record<string, 1 | -1>;
    columns?: QueryParams<TDoc>["columns"];
    with?: QueryParams<TDoc>["with"];
    limit?: number;
    skip?: number;
  }

  const runFind = (where: Query, opts: FindOpts): Promise<unknown[]> => {
    let q: AnyQuery = m.find(where, projection(opts.columns));
    if (opts.sort) q = q.sort(opts.sort);
    if (typeof opts.skip === "number") q = q.skip(opts.skip);
    if (typeof opts.limit === "number") q = q.limit(opts.limit);
    q = applyPopulate(q, opts.with);
    return attachSession(q).lean().exec() as Promise<unknown[]>;
  };

  const countWhere = (where: Query): Promise<number> => attachSession(m.countDocuments(where)).exec() as Promise<number>;

  const repository = {
    model,

    async findAll(params: QueryParams<TDoc> = {}) {
      const rows = await runFind(composeWhere(params.filter, params.withDeleted), {
        sort: sortSpec(params.sort),
        columns: params.columns,
        with: params.with,
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TDoc> = {}) {
      let q: AnyQuery = m.findOne(composeWhere(params.filter, params.withDeleted), projection(params.columns));
      q = q.sort(sortSpec(params.sort));
      q = applyPopulate(q, params.with);
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as never;
    },

    async findById(id: Id, params: ByIdParams<TDoc> = {}) {
      const { idKey = "id", filter, columns, with: withRel } = params;
      let q: AnyQuery = m.findOne(composeWhere(withId(filter, idKey as string, id), params.withDeleted), projection(columns));
      q = applyPopulate(q, withRel);
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TDoc> = {}) {
      const page = Math.max(1, Math.trunc(params.page ?? 1));
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      const where = composeWhere(params.filter, params.withDeleted);

      const [data, total_items] = await Promise.all([
        runFind(where, { sort: sortSpec(params.sort), columns: params.columns, with: params.with, limit: perPage, skip: (page - 1) * perPage }),
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

    async findInfinite(params: InfiniteParams<TDoc> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = Math.max(0, Math.trunc(params.offset ?? 0));

      const rows = await runFind(composeWhere(params.filter, params.withDeleted), {
        sort: sortSpec(params.sort),
        columns: params.columns,
        with: params.with,
        limit: limit + 1,
        skip: offset,
      });

      const has_more = rows.length > limit;
      const data = has_more ? rows.slice(0, limit) : rows;
      return {
        data,
        meta: { limit, offset, count: data.length, has_more, next_offset: has_more ? offset + limit : null },
      } as InfiniteResult<never>;
    },

    async findCursor(params: CursorParams<TDoc> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const field = resolveField(m, cursorKey);
      if (!field) throw new Error(`findCursor: unknown cursorKey "${cursorKey}".`);

      const decoded = decodeCursor(params.cursor);
      const cursorValue = decoded !== undefined ? castValue(m, field, decoded) : undefined;
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const seek: Query | undefined = cursorValue !== undefined ? { [field]: ascInQuery ? { $gt: cursorValue } : { $lt: cursorValue } } : undefined;
      const where: Query = seek ? (Object.keys(baseWhere).length ? { $and: [baseWhere, seek] } : seek) : baseWhere;

      // Force-include the cursor field in the projection so next/prev tokens work.
      // `cursorKey` is client-supplied, so under a projection guard this would be
      // a way to read a forbidden field: keep it in the query (pagination needs
      // it) but strip it from the documents we hand back.
      const selected = projection(params.columns);
      const proj = selected ? { ...selected, [field]: 1 } : undefined;
      const leaksCursorField = guarded && selected !== undefined && !permits(cursorKey) && !permits(field);

      let q: AnyQuery = m
        .find(where, proj)
        .sort({ [field]: ascInQuery ? 1 : -1 })
        .limit(limit + 1);
      q = applyPopulate(q, params.with);
      const rows = (await attachSession(q).lean().exec()) as Record<string, unknown>[];

      const hasExtra = rows.length > limit;
      let pageRows = hasExtra ? rows.slice(0, limit) : rows;
      if (direction === "backward") pageRows = [...pageRows].reverse();

      const first = pageRows[0];
      const last = pageRows[pageRows.length - 1];

      const has_next = direction === "forward" ? hasExtra : cursorValue !== undefined;
      const has_prev = direction === "forward" ? cursorValue !== undefined : hasExtra;

      const meta = {
        limit,
        has_next,
        has_prev,
        next_cursor: has_next && last ? encodeCursor(last[field]) : null,
        prev_cursor: has_prev && first ? encodeCursor(first[field]) : null,
      };

      // Cursor values are read above, so the field can go now.
      if (leaksCursorField) {
        pageRows = pageRows.map(row => {
          const { [field]: _cursor, ...rest } = row;
          return rest;
        });
      }

      return { data: pageRows, meta } as CursorResult<never>;
    },

    count(filter?: Filter<TDoc>) {
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TDoc>) {
      return (await countWhere(composeWhere(filter))) > 0;
    },

    /* ------------------------------- writes ------------------------------- */

    async create(values: Insert<TDoc>) {
      const [doc] = await m.create([forInsert(values)], { session: runtime.getSession() });
      return doc!.toObject() as Row<TDoc>;
    },

    async createMany(values: Insert<TDoc>[]) {
      if (values.length === 0) return [];
      const docs = await m.insertMany(values.map(forInsert), { session: runtime.getSession() });
      return docs.map((d: { toObject: () => unknown }) => d.toObject()) as Row<TDoc>[];
    },

    async upsert(values: Insert<TDoc>, options: UpsertOptions<TDoc>) {
      const { filter, update } = buildUpsert(values, options);
      const q: AnyQuery = m.findOneAndUpdate(filter, update, { returnDocument: "after", upsert: true });
      return (await attachSession(q).lean().exec()) as Row<TDoc>;
    },

    async upsertMany(values: Insert<TDoc>[], options: UpsertOptions<TDoc>) {
      if (values.length === 0) return [];
      const CHUNK = 1000;
      const entries = values.map(v => buildUpsert(v, options)); // input order preserved
      for (let i = 0; i < entries.length; i += CHUNK) {
        const ops = entries.slice(i, i + CHUNK).map(e => ({ updateOne: { filter: e.filter, update: e.update, upsert: true } }));
        await m.bulkWrite(ops, { session: runtime.getSession() });
      }
      // Re-fetch affected rows and return them in INPUT order (matches drizzle's
      // `.returning()`), keyed by the resolved target field(s).
      const rows = (await attachSession(m.find({ $or: entries.map(e => e.filter) }))
        .lean()
        .exec()) as Record<string, unknown>[];
      const targetFields = (toArr(options.target) as string[]).map(k => resolveField(m, k)).filter((f): f is string => Boolean(f));
      const keyOf = (o: Record<string, unknown>): string => targetFields.map(f => String(o[f])).join(" ");
      const byKey = new Map(rows.map(r => [keyOf(r), r]));
      return entries.map(e => byKey.get(keyOf(e.filter))).filter((r): r is Record<string, unknown> => Boolean(r)) as Row<TDoc>[];
    },

    async updateById(id: Id, patch: Partial<Insert<TDoc>>, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      const where = composeWhere(withId(undefined, idKey as string, id));
      const q: AnyQuery = m.findOneAndUpdate(where, forUpdate(patch), { returnDocument: "after" });
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as Row<TDoc> | undefined;
    },

    async updateWhere(filter: Filter<TDoc>, patch: Partial<Insert<TDoc>>) {
      const where = composeWhere(filter);
      const found = (await attachSession(m.find(where).select({ _id: 1 }))
        .lean()
        .exec()) as { _id: unknown }[];
      if (found.length === 0) return [];
      const ids = found.map(d => d._id);
      await attachSession(m.updateMany({ _id: { $in: ids } }, forUpdate(patch))).exec();
      return (await attachSession(m.find({ _id: { $in: ids } }))
        .lean()
        .exec()) as Row<TDoc>[];
    },

    async deleteById(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      const where = composeWhere(withId(undefined, idKey as string, id));
      const row = await attachSession(m.findOneAndDelete(where)).lean().exec();
      return (row ?? undefined) as Row<TDoc> | undefined;
    },

    async deleteWhere(filter: Filter<TDoc>) {
      const where = composeWhere(filter);
      const rows = (await attachSession(m.find(where)).lean().exec()) as { _id: unknown }[];
      if (rows.length === 0) return [];
      await attachSession(m.deleteMany({ _id: { $in: rows.map(d => d._id) } })).exec();
      return rows as Row<TDoc>[];
    },

    async softDelete(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      if (!hasDeletedAt) throw new Error("softDelete: schema has no deletedAt path.");
      const where = composeWhere(withId(undefined, idKey as string, id), false);
      const q: AnyQuery = m.findOneAndUpdate(where, forUpdate({ deletedAt: new Date() }), { returnDocument: "after" });
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as Row<TDoc> | undefined;
    },

    async restore(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      if (!hasDeletedAt) throw new Error("restore: schema has no deletedAt path.");
      const where = composeWhere(withId(undefined, idKey as string, id), true);
      const q: AnyQuery = m.findOneAndUpdate(where, forUpdate({ deletedAt: null }), { returnDocument: "after" });
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as Row<TDoc> | undefined;
    },

    async aggregate(spec: AggregateSpec<TDoc>) {
      // An aggregate spec can also come from a request, and `min(password)` or a
      // `groupBy` on a hidden field leaks just as much as a projection — so the
      // same guard applies here (matching the drizzle-pg adapter).
      const aggregable = (key: string) => (permits(key) ? resolveField(m, key) : undefined);
      const groupKeys = (toArr(spec.groupBy) as string[]).filter(key => Boolean(aggregable(key)));
      // Aggregate `$match` doesn't auto-cast values the way `find()` does; cast
      // the filter against the schema so wire strings (dates / ObjectIds) become
      // proper BSON types — keeping aggregate filters consistent with reads.
      const rawMatch = composeWhere(spec.filter, spec.withDeleted);
      let match: Record<string, unknown> = rawMatch;
      try {
        const q = m.find(rawMatch);
        q.cast(m);
        match = q.getFilter();
      } catch {
        /* fall back to the uncast filter */
      }
      const groupId = groupKeys.length ? Object.fromEntries(groupKeys.map(k => [k, `$${aggregable(k) ?? k}`])) : null;
      const group: Record<string, unknown> = { _id: groupId };
      if (spec.count) group.count = { $sum: 1 };
      const addAgg = (op: "$sum" | "$avg" | "$min" | "$max", keys: string[], prefix: string) => {
        for (const k of keys) {
          const field = aggregable(k);
          if (field) group[`${prefix}_${k}`] = { [op]: `$${field}` };
        }
      };
      addAgg("$sum", toArr(spec.sum) as string[], "sum");
      addAgg("$avg", toArr(spec.avg) as string[], "avg");
      addAgg("$min", toArr(spec.min) as string[], "min");
      addAgg("$max", toArr(spec.max) as string[], "max");

      let agg = m.aggregate([{ $match: match }, { $group: group }] as never);
      const session = runtime.getSession();
      if (session) agg = agg.session(session);
      const rows = (await agg.exec()) as Record<string, unknown>[];
      // Flatten the group `_id` fields back into each row (matches drizzle's shape).
      return rows.map(({ _id, ...rest }) => ({ ...(typeof _id === "object" && _id ? _id : {}), ...rest })) as AggregateRow[];
    },

    scoped(scope: Scope<TDoc>) {
      return buildRepository(runtime, model, { ...config, scope: { ...config.scope, ...scope } });
    },
  };

  return repository as unknown as Repository<TDoc>;
}
