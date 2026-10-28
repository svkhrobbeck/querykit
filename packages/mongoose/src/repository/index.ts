import type { Model } from "mongoose";

import type { Repository, RepositoryOptions, Scope } from "../types";
import { aggregateMethods } from "./aggregate";
import { buildRepoContext, type RepoRuntime } from "./context";
import { cursorMethods } from "./cursor";
import { mutateMethods } from "./mutate";
import { readMethods } from "./read";

export type { RepoRuntime } from "./context";

/**
 * Build a model-scoped repository. `runtime` (session getter + defaults) comes
 * from the registry, so this module never touches the connection directly.
 */
export function buildRepository<TDoc>(runtime: RepoRuntime, model: Model<TDoc>, config: RepositoryOptions<TDoc> = {}): Repository<TDoc> {
  const ctx = buildRepoContext(runtime, model, config);

  const repository = {
    model,
    ...readMethods(ctx),
    ...cursorMethods(ctx),
    ...mutateMethods(ctx, config),
    ...aggregateMethods(ctx),

    scoped(scope: Scope<TDoc>) {
      return buildRepository(runtime, model, { ...config, scope: { ...config.scope, ...scope } });
    },
  };

  return repository as unknown as Repository<TDoc>;
}
