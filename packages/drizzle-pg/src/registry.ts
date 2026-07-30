import type { AnyPgTable } from "drizzle-orm/pg-core";
import { DEFAULT_LIMIT, DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE, DEFAULT_PER_PAGE } from "@querykitjs/core";

import type { AnyDb, Registry, RegistryOptions, Repository, RepositoryExtender, RepositoryOptions } from "./types";
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
 * @param options - `defaultPerPage` (findList) / `defaultLimit` (infinite/cursor).
 *   Berilmasa `@querykitjs/core`ning `DEFAULT_PER_PAGE`/`DEFAULT_LIMIT` (20).
 * @returns Jadval repositorylari chiqaruvchi {@link Registry}.
 * @example
 * ```ts
 * // registry.ts (bir marta)
 * export const registry = createRegistry(db, schema, { defaultPerPage: 20 });
 *
 * // users.repository.ts — custom metodlar bilan kengaytirish
 * export const usersRepository = registry.repository(users, base => ({
 *   findByEmail: (email: string) =>
 *     base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
 * }));
 * ```
 */
export function createRegistry<TSchema extends Record<string, unknown>>(db: AnyDb, schema: TSchema, options: RegistryOptions = {}): Registry<TSchema> {
  const ctx = createContextStore();
  const runtime: RepoRuntime = {
    baseDb: db,
    getExecutor: () => ctx.get()?.executor ?? db,
    defaultPerPage: options.defaultPerPage ?? DEFAULT_PER_PAGE,
    defaultLimit: options.defaultLimit ?? DEFAULT_LIMIT,
    maxPerPage: options.maxPerPage ?? DEFAULT_MAX_PER_PAGE,
    maxLimit: options.maxLimit ?? DEFAULT_MAX_LIMIT,
  };

  function repository<TTable extends AnyPgTable>(table: TTable): Repository<TTable, TSchema>;
  function repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(
    table: TTable,
    extend: RepositoryExtender<TTable, TSchema, TExt>,
  ): Repository<TTable, TSchema> & TExt;
  function repository<TTable extends AnyPgTable>(table: TTable, options: RepositoryOptions<TTable>): Repository<TTable, TSchema>;
  function repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(
    table: TTable,
    options: RepositoryOptions<TTable>,
    extend: RepositoryExtender<TTable, TSchema, TExt>,
  ): Repository<TTable, TSchema> & TExt;
  function repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(
    table: TTable,
    arg2?: RepositoryOptions<TTable> | RepositoryExtender<TTable, TSchema, TExt>,
    arg3?: RepositoryExtender<TTable, TSchema, TExt>,
  ) {
    // 2nd arg is either the options object or the extender fn (same dispatch as
    // the mongoose adapter, so both registries read identically).
    const repoOptions = typeof arg2 === "function" ? undefined : arg2;
    const extend = typeof arg2 === "function" ? arg2 : arg3;
    const base = buildRepository(runtime, schema, table, repoOptions);
    return extend ? { ...base, ...extend(base) } : base;
  }

  const transaction = <T>(fn: () => Promise<T>): Promise<T> => {
    const executor = runtime.getExecutor();
    return executor.transaction(tx => ctx.run({ executor: tx as AnyDb }, fn));
  };

  return { schema, repository, transaction };
}
