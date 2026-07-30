import { resolveField, type ModelMeta } from "./fields";

/**
 * A Prisma projection. ⚠️ Prisma rejects `select` and `include` **at the same
 * level**, so when a caller asks for both columns and relations they are
 * composed into a single `select` (relations are legal keys inside a `select`).
 */
export interface Projection {
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

/** Read/aggregate projection guards — identical semantics to the other adapters. */
export interface ProjectionGuard {
  /** Forced selection: the caller's `columns` is ignored entirely. */
  forcedKeys?: string[];
  /** Allowlist: the caller's `columns` is intersected with it. */
  allowed?: Set<string>;
}

/** Inclusion-only: `{ a: true, b: false }` selects `a`; `false` values are dropped. */
export function truthyKeys(selection: Record<string, boolean | undefined>): string[] {
  return Object.entries(selection)
    .filter(([, on]) => on)
    .map(([key]) => key);
}

/**
 * Resolve the effective column keys for a request.
 *
 * With `forcedKeys` the caller's selection is ignored outright. With `allowed`
 * it is intersected, and an empty intersection falls back to the allowlist —
 * **never** to the full row, which is what makes a request for a forbidden
 * column safe instead of catastrophic. Identical to drizzle-pg's `pickColumns`
 * and mongoose's `projection`.
 */
export function pickColumns(guard: ProjectionGuard, columns?: Record<string, boolean | undefined>): string[] | undefined {
  if (guard.forcedKeys) return guard.forcedKeys;

  const requested = columns ? truthyKeys(columns) : [];
  if (!guard.allowed) return requested.length > 0 ? requested : undefined;

  const intersection = requested.filter(key => guard.allowed!.has(key));
  return intersection.length > 0 ? intersection : [...guard.allowed];
}

/**
 * Build the Prisma `select` / `include` for a request.
 *
 * @param forceKeys - fields the query needs regardless of the caller's selection
 *   (the cursor key). Only applied when a `select` is actually being built.
 */
export function buildProjection(
  meta: ModelMeta,
  guard: ProjectionGuard,
  columns?: Record<string, boolean | undefined>,
  withRelations?: Record<string, unknown>,
  forceKeys: string[] = [],
): Projection {
  // Relations the caller actually asked for (`false`/`null` entries dropped).
  const relations: Record<string, unknown> = {};
  if (withRelations) {
    for (const [key, value] of Object.entries(withRelations)) {
      if (value) relations[key] = value;
    }
  }
  const hasRelations = Object.keys(relations).length > 0;

  const keys = pickColumns(guard, columns);
  const select: Record<string, unknown> = {};
  if (keys) {
    for (const key of [...keys, ...forceKeys]) {
      const field = resolveField(meta, key);
      // Unknown keys are dropped, matching the filter/sort compilers.
      if (field) select[field] = true;
    }
  }
  const hasSelect = Object.keys(select).length > 0;

  // No usable selection → full row (plus `include` if relations were requested).
  if (!hasSelect) return hasRelations ? { include: relations } : {};

  // Both → one `select` carrying the relations (Prisma forbids select+include).
  if (hasRelations) return { select: { ...select, ...relations } };
  return { select };
}
