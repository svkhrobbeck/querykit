/**
 * Projection guards. `columns` may arrive straight from the wire, so the safe
 * selection belongs here rather than in every route — the same reasoning as
 * `scope`. Both options are validated once, at build time, so a
 * misconfiguration surfaces in development instead of quietly returning full
 * documents in production. Identical semantics to the drizzle-pg adapter.
 */

import type { ColumnSelection, QueryParams, RepositoryOptions } from "../types";
import { resolveField, type DocShape } from "../internal/fields";

export type MongoProjection = Record<string, 0 | 1>;

export interface Projection<TDoc> {
  /** `forcedColumns` or `allowedColumns` is configured. */
  guarded: boolean;
  /** Whether a field may appear in a result at all. */
  permits: (key: string) => boolean;
  /**
   * Column selection → Mongo projection, or undefined when empty. Adds `_id: 0`
   * unless the caller selected `id`/`_id`, so the runtime shape matches the
   * inferred `Pick<...>` type (Mongo otherwise always returns `_id`). Returns
   * undefined (full doc) when no requested column resolves.
   *
   * With `forcedColumns` the caller's selection is ignored outright; with
   * `allowedColumns` it is intersected, and an empty intersection falls back to
   * the allowlist — **never** to the full document.
   */
  projection: (columns?: QueryParams<TDoc>["columns"]) => MongoProjection | undefined;
}

const truthyKeys = (selection: object): string[] =>
  Object.entries(selection)
    .filter(([, on]) => on)
    .map(([key]) => key);

export function buildProjection<TDoc>(shape: DocShape, config: RepositoryOptions<TDoc>): Projection<TDoc> {
  const forcedKeys = config.forcedColumns ? truthyKeys(config.forcedColumns) : undefined;
  if (config.forcedColumns && forcedKeys!.length === 0) {
    throw new Error("buildRepository: forcedColumns must select at least one field (an empty selection would return the full document).");
  }

  const allowed = config.allowedColumns ? new Set<string>(config.allowedColumns as readonly string[]) : undefined;
  if (config.allowedColumns && allowed!.size === 0) {
    throw new Error("buildRepository: allowedColumns must list at least one field (an empty allowlist would return the full document).");
  }

  const permits = (key: string): boolean => (forcedKeys ? forcedKeys.includes(key) : allowed ? allowed.has(key) : true);

  /** Client selection ∩ allowlist; empty intersection → the allowlist itself. */
  const intersectAllowed = (requested: string[]): string[] => {
    const hit = requested.filter(key => allowed!.has(key));
    return hit.length > 0 ? hit : [...allowed!];
  };

  const projection = (columns?: QueryParams<TDoc>["columns"]): MongoProjection | undefined => {
    const requested = columns ? truthyKeys(columns as ColumnSelection<TDoc>) : [];
    const keys = forcedKeys ?? (allowed ? intersectAllowed(requested) : requested);
    if (keys.length === 0) return undefined;
    const proj: MongoProjection = {};
    let includesId = false;
    for (const k of keys) {
      const field = resolveField(shape, k);
      if (!field) continue;
      proj[field] = 1;
      if (field === "_id") includesId = true;
    }
    if (Object.keys(proj).length === 0) return undefined; // all unknown → full doc
    if (!includesId) proj._id = 0; // exclude _id unless explicitly selected (exact columns, like drizzle)
    return proj;
  };

  return { guarded: Boolean(forcedKeys ?? allowed), permits, projection };
}
