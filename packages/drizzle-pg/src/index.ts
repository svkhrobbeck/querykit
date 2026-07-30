/**
 * `@querykitjs/drizzle-pg` — Drizzle ORM (PostgreSQL) uchun **advanced filtering**
 * va **moslashuvchan paginatsiya** beruvchi repository qatlami.
 *
 * Bir marta registry'ni Drizzle `db` + `schema` bilan ulaysiz, so'ng undan
 * har bir jadval uchun repository chiqarasiz.
 *
 * @example
 * ```ts
 * // registry.ts (bir marta)
 * import { createRegistry } from "@querykitjs/drizzle-pg";
 * import { db } from "./db";
 * import * as schema from "./schema";
 *
 * export const registry = createRegistry(db, schema);
 *
 * // users.repository.ts
 * import { registry } from "./registry";
 * import { users } from "./schema";
 *
 * export const usersRepository = registry.repository(users);
 * ```
 */
export { createRegistry } from "./registry";
export { buildRepository, type RepoRuntime } from "./repository";
export { createFilters, f } from "./filters";
export * from "./types";
