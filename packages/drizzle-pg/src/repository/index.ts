import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { Repository, RepositoryOptions, Scope } from "../types";
import { aggregateMethods } from "./aggregate";
import { buildRepoContext, type RepoRuntime } from "./context";
import { cursorMethods } from "./cursor";
import { mutateMethods } from "./mutate";
import { readMethods } from "./read";

export type { RepoRuntime } from "./context";

/**
 * Build a table-scoped repository. `runtime` (db + context) comes from the
 * registry, so this module never imports the app's database directly.
 */
export function buildRepository<TTable extends AnyPgTable, TSchema extends Record<string, unknown>>(
  runtime: RepoRuntime,
  schema: TSchema,
  table: TTable,
  config: RepositoryOptions<TTable> = {},
): Repository<TTable, TSchema> {
  const ctx = buildRepoContext(runtime, schema, table, config);

  const repository = {
    table,
    ...readMethods(ctx),
    ...cursorMethods(ctx),
    ...aggregateMethods(ctx),
    ...mutateMethods(ctx, config),

    scoped(scope: Scope<TTable>) {
      return buildRepository(runtime, schema, table, {
        ...config,
        scope: { ...config.scope, ...scope },
      });
    },
  };

  return repository as unknown as Repository<TTable, TSchema>;
}
