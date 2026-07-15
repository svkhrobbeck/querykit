import type { Model } from "mongoose";

/** Any Mongoose model, regardless of its document type. */
export type AnyModel = Model<any>;

/**
 * Map a public field key to a real Mongoose schema path. `"id"` is aliased to
 * `"_id"` so the wire contract stays identical across adapters. Unknown fields
 * return `undefined` (the caller skips them silently, like the Drizzle adapter).
 */
export function resolveField(model: AnyModel, key: string): string | undefined {
  const name = key === "id" ? "_id" : key;
  if (name === "_id") return "_id";
  return model.schema.path(name) ? name : undefined;
}

/** Whether the schema has a given path (e.g. `deletedAt`, `updatedAt`). */
export function hasPath(model: AnyModel, path: string): boolean {
  return Boolean(model.schema.path(path));
}

/**
 * Cast a raw (decoded cursor) value to the field's schema type so keyset
 * comparisons (`$gt`/`$lt`) work — e.g. a hex string → `ObjectId`, an ISO
 * string → `Date`. Falls back to the raw value if casting fails.
 */
export function castValue(model: AnyModel, field: string, value: unknown): unknown {
  const path = model.schema.path(field);
  if (!path) return value;
  try {
    return path.cast(value);
  } catch {
    return value;
  }
}
