import type { Collection, Document } from "mongodb";

import type { Repository, RepositoryOptions, Scope } from "../types";
import { aggregateMethods } from "./aggregate";
import { buildRepoContext, type RepoRuntime } from "./context";
import { cursorMethods } from "./cursor";
import { mutateMethods } from "./mutate";
import { readMethods } from "./read";

export type { RepoRuntime } from "./context";

/** A repository over one collection; `registry.repository(...)` is the usual way to get one. */
export function buildRepository<TDoc extends Document>(runtime: RepoRuntime, collection: Collection<TDoc>, config: RepositoryOptions<TDoc>): Repository<TDoc> {
  const ctx = buildRepoContext(runtime, collection, config);

  const repository = {
    collection,
    ...readMethods(ctx),
    ...cursorMethods(ctx),
    ...mutateMethods(ctx, config),
    ...aggregateMethods(ctx),

    scoped(scope: Scope<TDoc>) {
      return buildRepository(runtime, collection, { ...config, scope: { ...config.scope, ...scope } });
    },
  };

  return repository as unknown as Repository<TDoc>;
}
