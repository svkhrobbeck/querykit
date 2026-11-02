import type { ClientSession, Collection, Document, MongoClient } from "mongodb";
import { DEFAULT_LIMIT, DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE, DEFAULT_PER_PAGE } from "@querykitjs/core";
import { createContextStore } from "@querykitjs/core/internal";

import type { Registry, RegistryOptions, Repository, RepositoryExtender, RepositoryOptions } from "./types";
import { buildRepository, type RepoRuntime } from "./repository";

/** Server time limit per read (ms) when the registry does not set one — the mongoose adapter's default. */
const DEFAULT_MAX_TIME_MS = 2000;

/**
 * Create a registry over a connected `MongoClient`: defaults once, then
 * `registry.repository(db.collection("users"), { schema })` per collection.
 *
 * @example
 * ```ts
 * const qk = createRegistry(client, { maxPerPage: 100 });
 * const users = qk.repository(client.db("app").collection<User>("users"), {
 *   schema: UserSchema,
 *   filterable: { name: ["=", "%_"], status: ["=", "in"] },
 * });
 * const { data, meta } = await users.findList({ page: 1, perPage: 20 });
 * ```
 */
export function createRegistry(client: MongoClient, options: RegistryOptions = {}): Registry {
  const ctx = createContextStore<{ session?: ClientSession }>();
  const runtime: RepoRuntime = {
    getSession: () => ctx.get()?.session,
    defaultPerPage: options.defaultPerPage ?? DEFAULT_PER_PAGE,
    defaultLimit: options.defaultLimit ?? DEFAULT_LIMIT,
    maxPerPage: options.maxPerPage ?? DEFAULT_MAX_PER_PAGE,
    maxLimit: options.maxLimit ?? DEFAULT_MAX_LIMIT,
    strict: options.strict ?? false,
    onSkippedCondition: options.onSkippedCondition,
    limits: options.limits,
    cursorSecret: options.cursorSecret,
    timestamps: options.timestamps,
    maxTimeMS: options.maxTimeMS ?? DEFAULT_MAX_TIME_MS,
  };

  function repository<TDoc extends Document>(collection: Collection<TDoc>, repoOptions: RepositoryOptions<TDoc>): Repository<TDoc>;
  function repository<TDoc extends Document, TExt extends Record<string, unknown>>(
    collection: Collection<TDoc>,
    repoOptions: RepositoryOptions<TDoc>,
    extend: RepositoryExtender<TDoc, TExt>,
  ): Repository<TDoc> & TExt;
  function repository<TDoc extends Document, TExt extends Record<string, unknown>>(
    collection: Collection<TDoc>,
    repoOptions: RepositoryOptions<TDoc>,
    extend?: RepositoryExtender<TDoc, TExt>,
  ) {
    const base = buildRepository(runtime, collection, repoOptions);
    return extend ? { ...base, ...extend(base) } : base;
  }

  /** Nested calls join the outer transaction; MongoDB transactions need a replica set or sharded cluster. */
  const transaction = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (ctx.get()?.session) return fn();
    return client.withSession(async session => {
      let result!: T;
      await session.withTransaction(async () => {
        result = await ctx.run({ session }, fn);
      });
      return result;
    });
  };

  return { repository, transaction };
}
