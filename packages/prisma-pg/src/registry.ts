import { DEFAULT_LIMIT, DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE, DEFAULT_PER_PAGE } from "@querykitjs/core";

import type { AnyClient, DelegateOf, ModelKey, Registry, RegistryOptions, Repository, RepositoryExtender, RepositoryOptions } from "./types";
import { buildRepository, type RepoRuntime } from "./repository";
import { createContextStore, type AnyExecutor } from "./internal/context";

/** A Prisma client's interactive-transaction method. */
interface Transactional {
  $transaction<T>(fn: (tx: AnyExecutor) => Promise<T>): Promise<T>;
}

/**
 * Create the DB **registry** once. It holds the Prisma client (for transactions)
 * and yields a {@link Repository} per model. Transactions flow ambiently via
 * AsyncLocalStorage — repositories used inside `registry.transaction(...)`
 * automatically run on that transaction client, with no `tx` threading.
 *
 * Framework-agnostic by design: this package knows nothing about HTTP, so the
 * same registry serves Express, Hono, NestJS or a background worker. Parse and
 * validate the request in your app (`@querykitjs/zod` or
 * `@querykitjs/class-validator`), then hand the params straight to a repository.
 *
 * @param prisma - your `PrismaClient` instance.
 * @param options - pagination defaults/bounds and diagnostics; defaults come
 *   from `@querykitjs/core` (`DEFAULT_PER_PAGE`/`DEFAULT_LIMIT` = 20).
 * @example
 * ```ts
 * // registry.ts (once)
 * export const registry = createRegistry(prisma);
 *
 * // users.repository.ts — with custom methods
 * export const usersRepository = registry.repository("user", base => ({
 *   findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", value: email }] }),
 * }));
 * ```
 */
export function createRegistry<TClient extends AnyClient>(prisma: TClient, options: RegistryOptions = {}): Registry<TClient> {
  const ctx = createContextStore();
  const runtime: RepoRuntime = {
    baseClient: prisma as AnyExecutor,
    getExecutor: () => ctx.get()?.executor ?? (prisma as AnyExecutor),
    defaultPerPage: options.defaultPerPage ?? DEFAULT_PER_PAGE,
    defaultLimit: options.defaultLimit ?? DEFAULT_LIMIT,
    maxPerPage: options.maxPerPage ?? DEFAULT_MAX_PER_PAGE,
    maxLimit: options.maxLimit ?? DEFAULT_MAX_LIMIT,
    strict: options.strict ?? false,
    onSkippedCondition: options.onSkippedCondition,
  };

  function repository<TKey extends ModelKey<TClient>>(model: TKey): Repository<DelegateOf<TClient, TKey>>;
  function repository<TKey extends ModelKey<TClient>, TExt extends Record<string, unknown>>(
    model: TKey,
    extend: RepositoryExtender<DelegateOf<TClient, TKey>, TExt>,
  ): Repository<DelegateOf<TClient, TKey>> & TExt;
  function repository<TKey extends ModelKey<TClient>>(
    model: TKey,
    options: RepositoryOptions<DelegateOf<TClient, TKey>>,
  ): Repository<DelegateOf<TClient, TKey>>;
  function repository<TKey extends ModelKey<TClient>, TExt extends Record<string, unknown>>(
    model: TKey,
    options: RepositoryOptions<DelegateOf<TClient, TKey>>,
    extend: RepositoryExtender<DelegateOf<TClient, TKey>, TExt>,
  ): Repository<DelegateOf<TClient, TKey>> & TExt;
  function repository<TKey extends ModelKey<TClient>, TExt extends Record<string, unknown>>(
    model: TKey,
    arg2?: RepositoryOptions<DelegateOf<TClient, TKey>> | RepositoryExtender<DelegateOf<TClient, TKey>, TExt>,
    arg3?: RepositoryExtender<DelegateOf<TClient, TKey>, TExt>,
  ) {
    // 2nd arg is either the options object or the extender fn (same dispatch as
    // the drizzle-pg and mongoose adapters, so all three registries read alike).
    const repoOptions = typeof arg2 === "function" ? undefined : arg2;
    const extend = typeof arg2 === "function" ? arg2 : arg3;
    const base = buildRepository<DelegateOf<TClient, TKey>>(runtime, model, repoOptions);
    return extend ? { ...base, ...extend(base) } : base;
  }

  const transaction = <T>(fn: () => Promise<T>): Promise<T> => {
    // Prisma has no savepoints, so a nested call reuses the ambient transaction
    // rather than opening a second one (the mongoose adapter does the same;
    // drizzle-pg can create a real savepoint there).
    if (ctx.get()?.executor) return fn();
    return (prisma as unknown as Transactional).$transaction(tx => ctx.run({ executor: tx }, fn));
  };

  return { client: prisma, repository, transaction };
}
