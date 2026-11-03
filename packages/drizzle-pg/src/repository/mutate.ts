import { sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import type { MutationOptions } from "@querykitjs/core";
import { clampPageSize, scopeDefaults } from "@querykitjs/core/internal";

import type { AllRows } from "@querykitjs/core";
import type { ColumnKey, Filter, Id, Insert, RepositoryOptions, Row, UpsertOptions } from "../types";
import { resolveColumn } from "../internal/columns";
import { buildWhere } from "../internal/where";
import { toArray, type RepoContext } from "./context";

/** Rows per `INSERT … ON CONFLICT` statement in `upsertMany`. */
const CHUNK_SIZE = 1000;

/** `create*`, `upsert*`, `update*`, `delete*`, `softDelete`, `restore`. */
export function mutateMethods<TTable extends AnyPgTable>(ctx: RepoContext<TTable>, config: RepositoryOptions<TTable>) {
  const { runtime, table, executor, handle, updatedAtCol, deletedAtCol, deletedAtKey, createdAtKey, composeWhere, mutationWhere, withId } = ctx;

  /** At most this many rows back from `returning: { limit }` (the cursor/infinite caps). */
  const returningLimit = (returning: { limit: number }): number => clampPageSize(returning.limit, runtime.defaultLimit, runtime.maxLimit);

  /** One atomic statement → `{ count }`, or `{ count, rows }` cut to the limit. */
  const counted = async (
    query: { returning(selection?: Record<string, unknown>): Promise<unknown[]> },
    options: MutationOptions,
  ): Promise<{ count: number; rows?: Row<TTable>[] }> => {
    if (!options.returning) return { count: (await query.returning({ affected: sql`1` })).length };
    const rows = (await query.returning()) as Row<TTable>[];
    return { count: rows.length, rows: rows.slice(0, returningLimit(options.returning)) };
  };

  /** Apply scope defaults to insert values (scope wins). */
  const forInsert = (values: object): object => ({
    ...scopeDefaults(config.scope as Record<string, unknown> | undefined),
    ...values,
    ...scopeDefaults(config.scope as Record<string, unknown> | undefined),
  });

  /** Bump updatedAt on update if the column exists. */
  const forUpdate = (patch: object): object => {
    const stamped: Record<string, unknown> = { ...patch };
    if (updatedAtCol) stamped.updatedAt = new Date();
    return stamped;
  };

  const resolveTargets = (target: UpsertOptions<TTable>["target"]): AnyPgColumn[] =>
    toArray(target).map(key => {
      const column = resolveColumn(table, key);
      if (!column) throw new Error(`upsert: unknown target column "${key}".`);
      return column;
    });

  /** Default ON CONFLICT SET: provided columns (minus target/creation) → excluded. */
  const defaultConflictSet = (sample: object, targetKeys: string[]): Record<string, unknown> => {
    const set: Record<string, unknown> = {};
    const skip = new Set([...targetKeys, createdAtKey ?? "createdAt"]);
    for (const key of Object.keys(sample)) {
      if (skip.has(key)) continue;
      const column = resolveColumn(table, key);
      if (column) set[key] = sql`excluded.${sql.identifier(column.name)}`;
    }
    if (updatedAtCol) set.updatedAt = sql`now()`;
    return set;
  };

  /** `UPDATE … SET patch WHERE id-predicate RETURNING *` → the row or `undefined`. */
  const updateOne = async (id: Id, idKey: string, patch: object, withDeleted?: boolean) => {
    const [row] = await executor()
      .update(table)
      .set(forUpdate(patch) as never)
      .where(composeWhere(withId(undefined, idKey, id), withDeleted))
      .returning();
    return (row ?? undefined) as Row<TTable> | undefined;
  };

  return {
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

    updateById(id: Id, patch: Partial<Insert<TTable>>, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      return updateOne(id, idKey, patch);
    },

    async updateWhere(filter: Filter<TTable> | AllRows, patch: Partial<Insert<TTable>>, options: MutationOptions = {}) {
      const where = mutationWhere(filter, "updateWhere");
      return counted(
        executor()
          .update(table)
          .set(forUpdate(patch) as never)
          .where(where) as never,
        options,
      );
    },

    async deleteById(id: Id, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      const where = composeWhere(withId(undefined, idKey, id));
      const [row] = await executor().delete(table).where(where).returning();
      return (row ?? undefined) as Row<TTable> | undefined;
    },

    async deleteWhere(filter: Filter<TTable> | AllRows, options: MutationOptions = {}) {
      const where = mutationWhere(filter, "deleteWhere");
      return counted(executor().delete(table).where(where) as never, options);
    },

    async softDelete(id: Id, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      if (!deletedAtCol) throw new Error("softDelete: table has no deletedAt column.");
      return updateOne(id, idKey, { [deletedAtKey!]: new Date() }, false);
    },

    async restore(id: Id, idKey: ColumnKey<TTable> = "id" as ColumnKey<TTable>) {
      if (!deletedAtCol) throw new Error("restore: table has no deletedAt column.");
      return updateOne(id, idKey, { [deletedAtKey!]: null }, true);
    },
  };
}
