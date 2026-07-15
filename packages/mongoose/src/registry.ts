import type { Connection, Model } from "mongoose";
import { DEFAULT_LIMIT, DEFAULT_PER_PAGE } from "@querykitjs/core";

import type { RelationDocs, RelationMap, Registry, RegistryOptions, Repository, RepositoryExtender, RepositoryOptions } from "./types";
import { buildRepository, type RepoRuntime } from "./repository";
import { createContextStore } from "./internal/context";

/**
 * Create the DB **registry** once. It holds the Mongoose connection (for
 * transactions) and yields a {@link Repository} per model. Transactions flow
 * ambiently via AsyncLocalStorage — repositories used inside
 * `registry.transaction(...)` automatically run on that session.
 *
 * @param connection - the Mongoose `Connection` the models belong to.
 * @param options - `defaultPerPage` (findList) / `defaultLimit` (infinite/cursor);
 *   defaults to `@querykitjs/core`'s `DEFAULT_PER_PAGE` / `DEFAULT_LIMIT` (20).
 * @example
 * ```ts
 * const registry = createRegistry(mongoose.connection);
 * const usersRepo = registry.repository(User);
 * ```
 */
export function createRegistry(connection: Connection, options: RegistryOptions = {}): Registry {
  const ctx = createContextStore();
  const runtime: RepoRuntime = {
    getSession: () => ctx.get()?.session,
    defaultPerPage: options.defaultPerPage ?? DEFAULT_PER_PAGE,
    defaultLimit: options.defaultLimit ?? DEFAULT_LIMIT,
  };

  function repository<TDoc>(model: Model<TDoc>): Repository<TDoc>;
  function repository<TDoc, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    extend: RepositoryExtender<TDoc, Record<never, never>, TExt>,
  ): Repository<TDoc> & TExt;
  function repository<TDoc, TRel extends RelationMap>(model: Model<TDoc>, options: RepositoryOptions<TRel>): Repository<TDoc, RelationDocs<TRel>>;
  function repository<TDoc, TRel extends RelationMap, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    options: RepositoryOptions<TRel>,
    extend: RepositoryExtender<TDoc, RelationDocs<TRel>, TExt>,
  ): Repository<TDoc, RelationDocs<TRel>> & TExt;
  function repository<TDoc, TRel extends RelationMap, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    arg2?: RepositoryOptions<TRel> | RepositoryExtender<TDoc, RelationDocs<TRel>, TExt>,
    arg3?: RepositoryExtender<TDoc, RelationDocs<TRel>, TExt>,
  ) {
    // 2nd arg is either the relations options object or the extender fn.
    // `relations` is type-only (drives `with` inference); runtime populate is
    // opt-in per call, so nothing to wire from it here.
    const extend = typeof arg2 === "function" ? arg2 : arg3;
    const base = buildRepository(runtime, model) as unknown as Repository<TDoc, RelationDocs<TRel>>;
    return extend ? { ...base, ...extend(base) } : base;
  }

  const transaction = async <T>(fn: () => Promise<T>): Promise<T> => {
    // Already inside a transaction (Mongo has no nested tx/savepoints) → reuse it.
    if (ctx.get()?.session) return fn();

    const session = await connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await ctx.run({ session }, fn);
      });
      return result;
    } finally {
      await session.endSession();
    }
  };

  return { repository, transaction };
}
