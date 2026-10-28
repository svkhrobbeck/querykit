import type { Filter, Id, Insert, RepositoryOptions, Row, UpsertOptions } from "../types";
import { resolveField } from "../internal/fields";
import type { Where } from "../internal/where";
import { toArray, type RepoContext } from "./context";
import { keyedIn, keySelect, requirePrimaryKey, uniqueWhere } from "./keys";

/** Rows per batch in `upsertMany` (bounds the promise pressure of the sequential loop). */
const CHUNK_SIZE = 1000;

/** `create*`, `upsert*`, `update*`, `delete*`, `softDelete`, `restore`. */
export function mutateMethods<TDelegate>(ctx: RepoContext<TDelegate>, config: RepositoryOptions<TDelegate>) {
  const { meta, delegate, composeWhere, withId } = ctx;

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

    async updateWhere(filter: Filter<TDelegate>, patch: Partial<Insert<TDelegate>>) {
      const key = requirePrimaryKey(meta, "updateWhere");
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
      const key = requirePrimaryKey(meta, "deleteById");
      const d = delegate();
      const target = await d.findFirst({ where: composeWhere(withId(undefined, idKey, id)) });
      if (!target) return undefined;
      return (await d.delete({ where: uniqueWhere(meta, key, target) })) as Row<TDelegate>;
    },

    async deleteWhere(filter: Filter<TDelegate>) {
      const key = requirePrimaryKey(meta, "deleteWhere");
      const d = delegate();
      const rows = await d.findMany({ where: composeWhere(filter) });
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
  };
}
