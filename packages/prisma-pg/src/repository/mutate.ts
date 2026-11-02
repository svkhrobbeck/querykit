import type { AllRows, MutationOptions } from "@querykitjs/core";
import { clampPageSize } from "@querykitjs/core/internal";

import type { Filter, Id, Insert, RepositoryOptions, Row, UpsertOptions } from "../types";
import { resolveField } from "../internal/fields";
import type { Where } from "../internal/where";
import { toArray, type RepoContext } from "./context";
import { keySelect, requirePrimaryKey, uniqueWhere } from "./keys";

/** Rows per batch in `upsertMany` (bounds the promise pressure of the sequential loop). */
const CHUNK_SIZE = 1000;

/** `create*`, `upsert*`, `update*`, `delete*`, `softDelete`, `restore`. */
export function mutateMethods<TDelegate>(ctx: RepoContext<TDelegate>, config: RepositoryOptions<TDelegate>) {
  const { runtime, meta, delegate, composeWhere, mutationWhere, withId } = ctx;

  /** At most this many rows back from `returning: { limit }` (the cursor/infinite caps). */
  const returningLimit = (returning: { limit: number }): number => clampPageSize(returning.limit, runtime.defaultLimit, runtime.maxLimit);

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

  const upsertOne = async (value: object, options: UpsertOptions<TDelegate>, targetKeys: string[]) => {
    const inserted = forInsert(value);
    const update = options.set ? forUpdate(options.set as object) : defaultConflictSet(inserted, targetKeys);
    return (await delegate().upsert({ where: upsertWhere(targetKeys, inserted), create: inserted, update })) as Row<TDelegate>;
  };

  /**
   * Update the single row matching an arbitrary predicate: located first, then
   * updated by its primary key (see `keys.ts`).
   */
  const updateOne = async (where: Where | undefined, data: Record<string, unknown>, method: string): Promise<Row<TDelegate> | undefined> => {
    const key = requirePrimaryKey(meta, method);
    const d = delegate();
    const target = await d.findFirst({ where, select: keySelect(key) });
    if (!target) return undefined;
    return (await d.update({ where: uniqueWhere(meta, key, target), data })) as Row<TDelegate>;
  };

  return {
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

    upsert(values: Insert<TDelegate>, options: UpsertOptions<TDelegate>) {
      return upsertOne(values as object, options, toArray(options.target) as string[]);
    },

    async upsertMany(values: Insert<TDelegate>[], options: UpsertOptions<TDelegate>) {
      if (values.length === 0) return [];
      const targetKeys = toArray(options.target) as string[];
      const out: Row<TDelegate>[] = [];
      // Prisma has no bulk upsert, so this is a sequential loop (chunked only to
      // keep the promise pressure bounded). Input order is preserved, matching
      // the other adapters' return contract.
      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        for (const value of values.slice(i, i + CHUNK_SIZE)) out.push(await upsertOne(value as object, options, targetKeys));
      }
      return out;
    },

    async updateById(id: Id, patch: Partial<Insert<TDelegate>>, idKey: string = "id") {
      return updateOne(composeWhere(withId(undefined, idKey, id)), forUpdate(patch as object), "updateById");
    },

    async updateWhere(filter: Filter<TDelegate> | AllRows, patch: Partial<Insert<TDelegate>>, options: MutationOptions = {}) {
      // Task 013: one atomic statement — no read before the write, so a row that stops
      // matching between a read and the write can never be updated.
      const where = mutationWhere(filter, "updateWhere");
      const data = forUpdate(patch as object);
      if (!options.returning) return { count: (await delegate().updateMany({ where, data })).count };
      const rows = (await delegate().updateManyAndReturn({ where, data })) as Row<TDelegate>[];
      return { count: rows.length, rows: rows.slice(0, returningLimit(options.returning)) };
    },

    async deleteById(id: Id, idKey: string = "id") {
      const key = requirePrimaryKey(meta, "deleteById");
      const d = delegate();
      const target = await d.findFirst({ where: composeWhere(withId(undefined, idKey, id)) });
      if (!target) return undefined;
      return (await d.delete({ where: uniqueWhere(meta, key, target) })) as Row<TDelegate>;
    },

    async deleteWhere(filter: Filter<TDelegate> | AllRows, options: MutationOptions = {}) {
      const where = mutationWhere(filter, "deleteWhere");
      // Prisma has no deleteManyAndReturn: the rows are read just before the delete (not atomic, README).
      const rows = options.returning ? ((await delegate().findMany({ where, take: returningLimit(options.returning) })) as Row<TDelegate>[]) : undefined;
      const { count } = await delegate().deleteMany({ where });
      return rows ? { count, rows } : { count };
    },

    async softDelete(id: Id, idKey: string = "id") {
      if (!meta.hasDeletedAt) throw new Error("softDelete: model has no deletedAt field.");
      return updateOne(composeWhere(withId(undefined, idKey, id), false), forUpdate({ deletedAt: new Date() }), "softDelete");
    },

    async restore(id: Id, idKey: string = "id") {
      if (!meta.hasDeletedAt) throw new Error("restore: model has no deletedAt field.");
      return updateOne(composeWhere(withId(undefined, idKey, id), true), forUpdate({ deletedAt: null }), "restore");
    },
  };
}
