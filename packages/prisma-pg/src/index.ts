/**
 * `@querykitjs/prisma-pg` — a repository layer over **Prisma (PostgreSQL)** with
 * advanced filtering and three pagination modes.
 *
 * Create the registry once from your `PrismaClient`, then take a repository per
 * model. The package is **framework-agnostic**: it knows nothing about HTTP, so
 * the same repository serves Express, Hono, NestJS or a background job. Parse
 * and validate the request in your app (`@querykitjs/zod` or
 * `@querykitjs/class-validator`) and pass the params straight through.
 *
 * Its filter DSL, pagination meta and cursor tokens are the same as
 * `@querykitjs/drizzle-pg` and `@querykitjs/mongoose`, so a `@querykitjs/web`
 * frontend keeps working if the backend swaps ORMs. `test/contract.ts` holds
 * that guarantee: it drives all three adapters from the real web builders.
 *
 * @example
 * ```ts
 * // registry.ts (once)
 * import { PrismaClient } from "@prisma/client";
 * import { createRegistry } from "@querykitjs/prisma-pg";
 *
 * export const prisma = new PrismaClient();
 * export const registry = createRegistry(prisma);
 *
 * // users.repository.ts
 * export const usersRepository = registry.repository("user");
 *
 * const { data, meta } = await usersRepository.findList({
 *   page: 1,
 *   filter: [{ key: "name", operation: "%_%", value: "ali" }],
 *   sort: [{ key: "createdAt", direction: "desc" }],
 * });
 * ```
 */
export { createRegistry } from "./registry";
export { buildRepository, type RepoRuntime } from "./repository";
export { createFilters, f } from "./filters";
export type { FieldMeta, ModelMeta } from "./internal/fields";
export * from "./types";
