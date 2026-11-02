import type { AnyBulkWriteOperation, Document, OptionalUnlessRequiredId } from "mongodb";
import type { AllRows, MutationOptions } from "@querykitjs/core";
import { clampPageSize, scopeDefaults } from "@querykitjs/core/internal";

import type { FieldKey, Filter, Id, Insert, RepositoryOptions, Row, UpsertOptions } from "../types";
import { resolveField } from "../internal/fields";
import type { Query } from "../internal/where";
import { toArr, type RepoContext } from "./context";

/** `bulkWrite` batch size for `upsertMany`. */
const CHUNK = 1000;
/** Joins the upsert target values into one map key (a byte no field value holds). */
const KEY_SEPARATOR = String.fromCharCode(0);

/**
 * Writes. Values are stored as given — the zod schema is the API layer's validator; the driver
 * casts nothing. Scope equality values are forced on insert, so a scoped repository cannot
 * write outside its scope.
 */
export function mutateMethods<TDoc extends Document>(ctx: RepoContext<TDoc>, config: RepositoryOptions<TDoc>) {
  const { runtime, collection, shape, hasDeletedAt, deletedAtPath, forUpdate, composeWhere, mutationWhere, withId, session, runFind } = ctx;

  const returningLimit = (returning: { limit: number }): number => clampPageSize(returning.limit, runtime.defaultLimit, runtime.maxLimit);

  const forInsert = (values: object): Record<string, unknown> => ({
    ...scopeDefaults(config.scope as Record<string, unknown> | undefined),
    ...values,
    ...scopeDefaults(config.scope as Record<string, unknown> | undefined),
  });

  const buildUpsert = (values: Insert<TDoc>, options: UpsertOptions<TDoc>) => {
    const targetKeys = toArr(options.target) as string[];
    const inserted = forInsert(values);
    const filter: Record<string, unknown> = {};
    for (const key of targetKeys) {
      const field = resolveField(shape, key);
      if (!field) throw new Error(`upsert: unknown target field "${key}".`);
      filter[field] = inserted[key];
    }
    const set: Record<string, unknown> = options.set
      ? { ...(options.set as Record<string, unknown>) }
      : Object.fromEntries(Object.entries(inserted).filter(([k]) => !targetKeys.includes(k)));
    const setOnInsert = Object.fromEntries(Object.entries(inserted).filter(([k]) => !targetKeys.includes(k) && !(k in set)));
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(setOnInsert).length) update.$setOnInsert = setOnInsert;
    return { filter, update };
  };

  const updateOne = async (where: Query, patch: object) => {
    const row = await collection.findOneAndUpdate(where as never, { $set: patch } as never, { returnDocument: "after", ...session() });
    return (row ?? undefined) as Row<TDoc> | undefined;
  };

  return {
    async create(values: Insert<TDoc>) {
      const doc = forInsert(values);
      const { insertedId } = await collection.insertOne(doc as OptionalUnlessRequiredId<TDoc>, session());
      return { ...doc, _id: insertedId } as unknown as Row<TDoc>;
    },

    async createMany(values: Insert<TDoc>[]) {
      if (values.length === 0) return [];
      const docs = values.map(forInsert);
      const { insertedIds } = await collection.insertMany(docs as OptionalUnlessRequiredId<TDoc>[], session());
      return docs.map((doc, index) => ({ ...doc, _id: insertedIds[index] })) as unknown as Row<TDoc>[];
    },

    async upsert(values: Insert<TDoc>, options: UpsertOptions<TDoc>) {
      const { filter, update } = buildUpsert(values, options);
      return (await collection.findOneAndUpdate(filter as never, update as never, { returnDocument: "after", upsert: true, ...session() })) as Row<TDoc>;
    },

    async upsertMany(values: Insert<TDoc>[], options: UpsertOptions<TDoc>) {
      if (values.length === 0) return [];
      const entries = values.map(v => buildUpsert(v, options)); // input order preserved
      for (let i = 0; i < entries.length; i += CHUNK) {
        const ops = entries.slice(i, i + CHUNK).map(e => ({ updateOne: { filter: e.filter, update: e.update, upsert: true } }));
        await collection.bulkWrite(ops as AnyBulkWriteOperation<TDoc>[], session());
      }
      const rows = (await runFind({ $or: entries.map(e => e.filter) }, {})) as Record<string, unknown>[];
      const targetFields = (toArr(options.target) as string[]).map(k => resolveField(shape, k)).filter((f): f is string => Boolean(f));
      const keyOf = (o: Record<string, unknown>): string => targetFields.map(f => String(o[f])).join(KEY_SEPARATOR);
      const byKey = new Map(rows.map(r => [keyOf(r), r]));
      return entries.map(e => byKey.get(keyOf(e.filter))).filter((r): r is Record<string, unknown> => Boolean(r)) as Row<TDoc>[];
    },

    updateById(id: Id, patch: Partial<Insert<TDoc>>, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      return updateOne(composeWhere(withId(undefined, idKey as string, id)), forUpdate(patch));
    },

    /** One `updateMany` (task 013): no read before the write; `returning` reads after it. */
    async updateWhere(filter: Filter<TDoc> | AllRows, patch: Partial<Insert<TDoc>>, options: MutationOptions = {}) {
      const where = mutationWhere(filter, "updateWhere");
      const { matchedCount: count } = await collection.updateMany(where as never, { $set: forUpdate(patch) } as never, session());
      if (!options.returning) return { count };
      const rows = (await runFind(where, { limit: returningLimit(options.returning) })) as Row<TDoc>[];
      return { count, rows };
    },

    async deleteById(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      const row = await collection.findOneAndDelete(composeWhere(withId(undefined, idKey as string, id)) as never, session());
      return (row ?? undefined) as Row<TDoc> | undefined;
    },

    async deleteWhere(filter: Filter<TDoc> | AllRows, options: MutationOptions = {}) {
      const where = mutationWhere(filter, "deleteWhere");
      const rows = options.returning ? ((await runFind(where, { limit: returningLimit(options.returning) })) as Row<TDoc>[]) : undefined;
      const { deletedCount: count } = await collection.deleteMany(where as never, session());
      return rows ? { count, rows } : { count };
    },

    async softDelete(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      if (!hasDeletedAt) throw new Error("softDelete: schema has no deletedAt field.");
      return updateOne(composeWhere(withId(undefined, idKey as string, id), false), forUpdate({ [deletedAtPath]: new Date() }));
    },

    async restore(id: Id, idKey: FieldKey<TDoc> = "id" as FieldKey<TDoc>) {
      if (!hasDeletedAt) throw new Error("restore: schema has no deletedAt field.");
      return updateOne(composeWhere(withId(undefined, idKey as string, id), true), forUpdate({ [deletedAtPath]: null }));
    },
  };
}
