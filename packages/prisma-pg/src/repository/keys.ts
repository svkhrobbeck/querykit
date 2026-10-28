/**
 * Addressing one row by its primary key. Prisma's `update`/`delete` accept only
 * a unique `where`, while querykit's filters are arbitrary predicates (they also
 * carry the scope and soft-delete guards). So the row is located first, then
 * written by key. Works for a single `@id` and for a composite `@@id` alike.
 */
import type { ModelMeta } from "../internal/fields";
import type { Where } from "../internal/where";

/** The model's primary key fields; throws when it has none. */
export function requirePrimaryKey(meta: ModelMeta, method: string): string[] {
  if (meta.primaryKey.length === 0) {
    throw new Error(
      `${method}: model "${meta.name}" has no primary key, so a row cannot be addressed individually. ` +
        `Use updateWhere/deleteWhere with an explicit filter instead.`,
    );
  }
  return meta.primaryKey;
}

/** `select` that fetches just the key fields. */
export const keySelect = (key: string[]): Record<string, true> => Object.fromEntries(key.map(field => [field, true]));

/**
 * Prisma's unique `where` for one row. A composite `@@id` is addressed through
 * its compound key (`{ a_b: { a, b } }`), the name Prisma generates from the
 * field list unless `@@id(name:)` says otherwise.
 */
export function uniqueWhere(meta: ModelMeta, key: string[], row: Record<string, unknown>): Record<string, unknown> {
  if (key.length === 1) return { [key[0]!]: row[key[0]!] };
  return { [meta.primaryKeyName ?? key.join("_")]: Object.fromEntries(key.map(field => [field, row[field]])) };
}

/** A `where` matching exactly the given rows by key (used for bulk re-reads). */
export function keyedIn(key: string[], rows: Record<string, unknown>[]): Where {
  if (key.length === 1) return { [key[0]!]: { in: rows.map(row => row[key[0]!]) } };
  return { OR: rows.map(row => Object.fromEntries(key.map(field => [field, row[field]]))) };
}
