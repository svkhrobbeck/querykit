import type { AllRows, MutationOptions } from "@querykitjs/core";
import { clampPageSize } from "@querykitjs/core/internal";

import type { FieldKey, Filter, Id, Insert, RepositoryOptions, Row, UpsertOptions } from "../types";
import { resolveField } from "../internal/fields";
import type { Query } from "../internal/where";
import { toArr, type AnyQuery, type RepoContext } from "./context";

/** Upserts per `bulkWrite` call in `upsertMany`. */
const CHUNK = 1000;

/**
 * Joins the target-field values of one row into a lookup key. NUL never occurs
 * in the string form of a field value, so the parts cannot run together.
 */
const KEY_SEPARATOR = String.fromCharCode(0);

/** `create*`, `upsert*`, `update*`, `delete*`, `softDelete`, `restore`. */
export function mutateMethods<TDoc>(ctx: RepoContext<TDoc>, config: RepositoryOptions<TDoc>) {
  const { runtime, m, hasDeletedAt, forUpdate, composeWhere, mutationWhere, withId, attachSession } = ctx;

  /** At most this many rows back from `returning: { limit }` (the cursor/infinite caps). */
  const returningLimit = (returning: { limit: number }): number => clampPageSize(returning.limit, runtime.defaultLimit, runtime.maxLimit);

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

  /** `findOneAndUpdate(where, patch)` → the updated document or `undefined`. */
  const updateOne = async (where: Query, patch: object) => {
    const q: AnyQuery = m.findOneAndUpdate(where, patch, { returnDocument: "after" });
    const row = await attachSession(q).lean().exec();
    return (row ?? undefined) as Row<TDoc> | undefined;
  };

  return {
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
      const keyOf = (o: Record<string, unknown>): string => targetFields.map(f => String(o[f])).join(KEY_SEPARATOR);
      const byKey = new Map(rows.map(r => [keyOf(r), r]));
      return entries.map(e => byKey.get(keyOf(e.filter))).filter((r): r is Record<string, unknown> => Boolean(r)) as Row<TDoc>[];
    },

    updateById(id: Id, patch: Partial<Insert<TDoc>>, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      return updateOne(composeWhere(withId(undefined, idKey as string, id)), forUpdate(patch));
    },

    async updateWhere(filter: Filter<TDoc> | AllRows, patch: Partial<Insert<TDoc>>, options: MutationOptions = {}) {
      // Task 013: one updateMany with the filter — no read before the write.
      const where = mutationWhere(filter, "updateWhere");
      const { matchedCount: count } = (await attachSession(m.updateMany(where, forUpdate(patch))).exec()) as { matchedCount: number };
      if (!options.returning) return { count };
      // Mongo has no multi-document "update and return": read right after, same filter (not atomic, README).
      const rows = (await attachSession(m.find(where).limit(returningLimit(options.returning)))
        .lean()
        .exec()) as Row<TDoc>[];
      return { count, rows };
    },

    async deleteById(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      const where = composeWhere(withId(undefined, idKey as string, id));
      const row = await attachSession(m.findOneAndDelete(where)).lean().exec();
      return (row ?? undefined) as Row<TDoc> | undefined;
    },

    async deleteWhere(filter: Filter<TDoc> | AllRows, options: MutationOptions = {}) {
      const where = mutationWhere(filter, "deleteWhere");
      // The rows are read just before the delete (not atomic, README).
      const rows = options.returning
        ? ((await attachSession(m.find(where).limit(returningLimit(options.returning)))
            .lean()
            .exec()) as Row<TDoc>[])
        : undefined;
      const { deletedCount: count } = (await attachSession(m.deleteMany(where)).exec()) as { deletedCount: number };
      return rows ? { count, rows } : { count };
    },

    async softDelete(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      if (!hasDeletedAt) throw new Error("softDelete: schema has no deletedAt path.");
      return updateOne(composeWhere(withId(undefined, idKey as string, id), false), forUpdate({ deletedAt: new Date() }));
    },

    async restore(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      if (!hasDeletedAt) throw new Error("restore: schema has no deletedAt path.");
      return updateOne(composeWhere(withId(undefined, idKey as string, id), true), forUpdate({ deletedAt: null }));
    },
  };
}
