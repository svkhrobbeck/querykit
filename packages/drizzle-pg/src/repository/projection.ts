/**
 * Projection guards. `columns` may arrive straight from the wire, so the safe
 * selection belongs here rather than in every route — the same reasoning as
 * `scope`. Both options are validated once, at build time, so a
 * misconfiguration surfaces in development instead of quietly returning full
 * rows in production.
 */
import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { ColumnSelection, QueryParams, RepositoryOptions } from "../types";

type Selection = Record<string, true>;

export interface Projection<TTable extends AnyPgTable> {
  /** `forcedColumns` or `allowedColumns` is configured. */
  guarded: boolean;
  /** Whether a column may appear in a result at all. */
  permits: (key: string) => boolean;
  /**
   * The drizzle `columns` selection for a request, or `undefined` for the full
   * row. Inclusion-only: `{a:true,b:false}` includes only `a`, and an
   * all-`false`/empty object returns the full row (matches the mongoose adapter
   * and the `Pick<Row,K>` contract).
   *
   * With `forcedColumns` the caller's selection is ignored outright. With
   * `allowedColumns` it is intersected, and an empty intersection falls back to
   * the allowlist — **never** to the full row, which is what makes a request for
   * a forbidden column safe instead of catastrophic.
   */
  pickColumns: (columns?: QueryParams<TTable>["columns"]) => Selection | undefined;
}

const truthyKeys = (selection: object): string[] =>
  Object.entries(selection)
    .filter(([, on]) => on)
    .map(([key]) => key);

const toSelection = (keys: string[]): Selection => Object.fromEntries(keys.map(key => [key, true]));

export function buildProjection<TTable extends AnyPgTable>(config: RepositoryOptions<TTable>): Projection<TTable> {
  const forcedKeys = config.forcedColumns ? truthyKeys(config.forcedColumns) : undefined;
  if (config.forcedColumns && forcedKeys!.length === 0) {
    throw new Error("buildRepository: forcedColumns must select at least one column (an empty selection would return the full row).");
  }

  const allowed = config.allowedColumns ? new Set<string>(config.allowedColumns as readonly string[]) : undefined;
  if (config.allowedColumns && allowed!.size === 0) {
    throw new Error("buildRepository: allowedColumns must list at least one column (an empty allowlist would return the full row).");
  }

  const permits = (key: string): boolean => (forcedKeys ? forcedKeys.includes(key) : allowed ? allowed.has(key) : true);

  const pickColumns = (columns?: QueryParams<TTable>["columns"]): Selection | undefined => {
    if (forcedKeys) return toSelection(forcedKeys);

    const requested = columns ? truthyKeys(columns as ColumnSelection<TTable>) : [];
    if (!allowed) return requested.length > 0 ? toSelection(requested) : undefined;

    const intersection = requested.filter(key => allowed.has(key));
    return toSelection(intersection.length > 0 ? intersection : [...allowed]);
  };

  return { guarded: Boolean(forcedKeys ?? allowed), permits, pickColumns };
}
