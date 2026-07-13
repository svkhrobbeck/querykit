import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { AnyDb, Registry, Repository, RepositoryExtender } from "./types";
import { buildRepository, type RepoRuntime } from "./repository";
import { createContextStore } from "./internal/context";

/**
 * DB **registry**'sini bir marta yaratadi. Registry — Drizzle `db` va `schema`'ni
 * ushlab turadigan, undan har bir jadval uchun {@link Repository} chiqaradigan
 * markaziy nuqta. Odatda `registry.ts` da bir marta yaratiladi, so'ng har bir
 * `*.repository.ts` faylida ishlatiladi.
 *
 * Tranzaksiyalar **ambient** (AsyncLocalStorage) kontekst orqali oqadi:
 * `registry.transaction(...)` ichida ishlatilgan repositorylar avtomatik ravishda
 * o'sha tranzaksiya ulanishida ishlaydi — qo'lda `tx` uzatish shart emas.
 *
 * @typeParam TSchema - `drizzle(client, { schema })` ga berilgan schema tipi.
 * @param db - Drizzle Postgres bazasi (`drizzle-orm/postgres-js` va h.k.).
 * @param schema - `db.query` uchun ishlatilgan to'liq schema obyekti.
 * @returns Jadval repositorylari chiqaruvchi {@link Registry}.
 * @example
 * ```ts
 * // registry.ts (bir marta)
 * export const registry = createRegistry(db, schema);
 *
 * // users.repository.ts — custom metodlar bilan kengaytirish
 * export const usersRepository = registry.repository(users, base => ({
 *   findByEmail: (email: string) =>
 *     base.findOne({ filter: [{ key: "email", op: "=", value: email }] }),
 * }));
 * ```
 */
export function createRegistry<TSchema extends Record<string, unknown>>(db: AnyDb, schema: TSchema): Registry<TSchema> {
  const ctx = createContextStore();
  const runtime: RepoRuntime = {
    baseDb: db,
    getExecutor: () => ctx.get()?.executor ?? db,
  };

  function repository<TTable extends AnyPgTable>(table: TTable): Repository<TTable, TSchema>;
  function repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(
    table: TTable,
    extend: RepositoryExtender<TTable, TSchema, TExt>,
  ): Repository<TTable, TSchema> & TExt;
  function repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(table: TTable, extend?: RepositoryExtender<TTable, TSchema, TExt>) {
    const base = buildRepository(runtime, schema, table);
    return extend ? { ...base, ...extend(base) } : base;
  }

  const transaction = <T>(fn: () => Promise<T>): Promise<T> => {
    const executor = runtime.getExecutor();
    return executor.transaction(tx => ctx.run({ executor: tx as AnyDb }, fn));
  };

  return { schema, repository, transaction };
}
