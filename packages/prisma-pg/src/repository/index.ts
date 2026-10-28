import type { Repository, RepositoryOptions, Scope } from "../types";
import { aggregateMethods } from "./aggregate";
import { buildRepoContext, type RepoRuntime } from "./context";
import { cursorMethods } from "./cursor";
import { mutateMethods } from "./mutate";
import { readMethods } from "./read";

export type { RepoRuntime } from "./context";

/**
 * Build a model-scoped repository. `runtime` (client + ambient transaction
 * context) comes from the registry, so this module never touches the app's
 * database handle directly.
 */
export function buildRepository<TDelegate>(runtime: RepoRuntime, modelKey: string, config: RepositoryOptions<TDelegate> = {}): Repository<TDelegate> {
  const ctx = buildRepoContext<TDelegate>(runtime, modelKey, config);

  const repository = {
    get delegate() {
      return ctx.delegate() as unknown as TDelegate;
    },
    ...readMethods(ctx),
    ...cursorMethods(ctx),
    ...mutateMethods(ctx, config),
    ...aggregateMethods(ctx),

    scoped(scope: Scope<TDelegate>) {
      return buildRepository<TDelegate>(runtime, modelKey, { ...config, scope: { ...config.scope, ...scope } });
    },
  };

  return repository as unknown as Repository<TDelegate>;
}
