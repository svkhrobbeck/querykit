/**
 * Document fields from the repository's zod schema (task 017 Locked 2): the field kinds the
 * filter casts to, the enum values a string field allows, and which fields hold an ObjectId.
 * The driver has no schema of its own, so the zod object is the one source of field types.
 */
import type { z } from "zod";

/** How a wire (JSON) value is cast for a field. `other` — arrays, objects, unions: primitives only. */
export type FieldKind = "string" | "number" | "boolean" | "date" | "objectId" | "other";

export interface Field {
  kind: FieldKind;
  /** Allowed values of a `z.enum` / `z.literal` field; a value outside them can never match. */
  values?: readonly unknown[];
}

export interface DocShape {
  /** Collection name — the `source` of a `QueryKitError` / skipped condition. */
  source: string;
  fields: ReadonlyMap<string, Field>;
}

/** Wrappers that do not change what a stored value looks like. */
const WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch", "nonoptional"]);
const KINDS: Readonly<Record<string, FieldKind>> = { string: "string", number: "number", boolean: "boolean", date: "date" };

interface SchemaDef {
  type: string;
  innerType?: { def: SchemaDef };
  entries?: Record<string, unknown>;
  values?: readonly unknown[];
}

function fieldOf(schema: { def: SchemaDef }): Field {
  let def = schema.def;
  while (WRAPPERS.has(def.type) && def.innerType) def = def.innerType.def;
  if (def.type === "enum" && def.entries) return { kind: "string", values: Object.values(def.entries) };
  if (def.type === "literal" && def.values) return { kind: typeof def.values[0] === "number" ? "number" : "string", values: def.values };
  return { kind: KINDS[def.type] ?? "other" };
}

/**
 * Fields of a zod object schema. `objectId` names the fields stored as `ObjectId` (default
 * `["_id"]`): a JSON body carries them as 24-hex strings, so they are cast here. `_id` is
 * always a field, an ObjectId unless the schema or `objectId` says otherwise.
 */
export function shapeFromSchema(source: string, schema: z.ZodObject, objectId: readonly string[] = ["_id"]): DocShape {
  const fields = new Map<string, Field>();
  for (const [name, field] of Object.entries(schema.shape)) fields.set(name, fieldOf(field as unknown as { def: SchemaDef }));
  for (const name of objectId) fields.set(name, { kind: "objectId" });
  if (!fields.has("_id")) fields.set("_id", { kind: "objectId" });
  return { source, fields };
}

/** A wire key → the stored field name (`id` means `_id`), or `undefined` when the schema has no such field. */
export function resolveField(shape: DocShape, key: string): string | undefined {
  const name = key === "id" ? "_id" : key;
  return shape.fields.has(name) ? name : undefined;
}

export const fieldKind = (shape: DocShape, field: string): FieldKind | undefined => shape.fields.get(field)?.kind;
