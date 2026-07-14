import type { FilterOperator, FilterValue } from "./types";

/** Forbids the listed keys (`?: never`) so modes can't be mixed. */
type Without<K extends string> = { [P in K]?: never };

/** Filter-key override, shared by the single-key modes. */
interface KeyBase {
  /** Backend field key (defaults to the schema param name). */
  key?: string;
}

/**
 * **Simple** mode — one URL param → one condition. `operation` defaults to `"="`;
 * `trim`/`default`/`split` shape the value.
 */
export interface SimpleField extends KeyBase {
  /** Filter operation (default `"="`). */
  operation?: FilterOperator;
  /** Trim the string value. */
  trim?: boolean;
  /** Value used when the URL param is absent. */
  default?: FilterValue;
  /**
   * For array operations (`in`/`notIn`): split a comma-string into an array.
   * `true` → delimiter `","`; or a custom delimiter. Guarded: absent/empty →
   * pruned; parts trimmed, empties dropped.
   */
  split?: boolean | string;
}

/** **Range** mode — `[fromParam, toParam]` → two inclusive conditions (`>=`, `<=`). */
export interface RangeField extends KeyBase {
  range: [string, string];
}

/** **Between** mode — `[fromParam, toParam]` → one `between` condition (2-tuple). */
export interface BetweenField extends KeyBase {
  between: [string, string];
}

/** **Search** mode — one URL param → OR of `contains` across these field keys. */
export interface SearchField {
  search: string[];
  trim?: boolean;
  default?: FilterValue;
}

/**
 * One list field's URL→filter mapping. Exactly **one mode** per descriptor —
 * Simple / Range / Between / Search — enforced at compile time (mixing e.g.
 * `range` + `search`, or `range` + `between`, is a type error).
 */
export type FieldDescriptor =
  | (SimpleField & Without<"range" | "between" | "search">)
  | (RangeField & Without<"operation" | "trim" | "default" | "split" | "between" | "search">)
  | (BetweenField & Without<"operation" | "trim" | "default" | "split" | "range" | "search">)
  | (SearchField & Without<"key" | "operation" | "split" | "range" | "between">);

/** URL param → {@link FieldDescriptor} map. */
export type ListSchema = Record<string, FieldDescriptor>;

/**
 * Declares a list filter schema (identity helper — preserves the literal type).
 * Maps URL params to `{key, operation, value}` conditions so pages never build
 * `IFilter[]` by hand.
 *
 * @example
 * ```ts
 * const buyersSchema = defineListSchema({
 *   id: { operation: "=" },
 *   status: { operation: "=", default: "active" },
 *   ids: { operation: "in", split: true },
 *   q: { search: ["name", "email"] },
 *   createdAt: { range: ["fromDate", "toDate"] },
 * });
 * ```
 */
export function defineListSchema<S extends ListSchema>(schema: S): S {
  return schema;
}
