/**
 * English message texts for the wire-check issue keys, shared by the
 * validators so a rejected payload reads the same everywhere. `{placeholder}`s
 * are filled from the issue's `args`; `{path}` is the issue path as text.
 */

/**
 * The filter, sort and limit messages — the canonical key list of
 * `@querykitjs/class-validator`, which also ships `uz` and `ru` catalogs for it.
 */
export const QUERYKIT_MESSAGES_EN = {
  "querykit.filter.invalid_node": "{path} must be a filter condition or an and/or/not group",
  "querykit.filter.missing_key": "{path} is missing the required `key` string",
  "querykit.filter.unknown_key": "{path}: `{key}` is not an allowed filter key",
  "querykit.filter.invalid_operator": "{path}: `{operation}` is not a supported filter operator",
  "querykit.filter.invalid_value": "{path} must be a string, number, boolean, null, or an array of those",
  "querykit.filter.invalid_group": "{path} must be an array of filter nodes",
  "querykit.filter.max_depth": "{path} exceeds maxDepth ({max})",
  "querykit.filter.value_requires_array": "{path}: `{operation}` requires an array value",
  "querykit.filter.value_requires_tuple": "{path}: `{operation}` requires exactly two values",
  "querykit.filter.value_forbidden": "{path}: `{operation}` must not carry a value",
  "querykit.sort.not_array": "{path} must be an array of { key, direction } items",
  "querykit.sort.invalid_item": "{path} must be an object with a `key` string",
  "querykit.sort.missing_key": "{path} is missing the required `key` string",
  "querykit.sort.unknown_key": "{path}: `{key}` is not an allowed sort key",
  "querykit.sort.invalid_direction": "{path}: direction must be `asc` or `desc`",
  "querykit.limit.exceeded": "{path} exceeds {limit} ({max})",
} as const satisfies Record<string, string>;

/** The pagination-params messages (`checkParams`); kept apart so the class-validator catalogs keep their key set. */
export const QUERYKIT_PARAMS_MESSAGES_EN = {
  "querykit.params.invalid_type": "{path} must be {expected}",
  "querykit.params.not_integer": "{path} must be an integer",
  // args carry only the crossed bound (`min` or `max`), so the text names neither
  "querykit.params.out_of_range": "{path} is out of the allowed range",
  "querykit.params.invalid_enum": "{path} must be one of: {values}",
} as const satisfies Record<string, string>;

/** A filter, sort or limit message key. */
export type QueryKitMessageKey = keyof typeof QUERYKIT_MESSAGES_EN;

/** One language's full catalog — every key required, so a new key breaks every catalog at compile time. */
export type QueryKitMessageCatalog = Record<QueryKitMessageKey, string>;

/** Interpolation arguments. */
export type MessageArgs = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills `{name}` placeholders from `args`; a placeholder with no argument stays as it is, so a message is never empty. */
export const interpolate = (template: string, args: MessageArgs): string =>
  template.replace(PLACEHOLDER, (match, name: string) => {
    const value = args[name];
    return value === undefined ? match : String(value);
  });

/**
 * The message for `key` from `catalog` (default English), placeholders filled.
 *
 * @example
 * ```ts
 * formatMessage("querykit.limit.exceeded", { path: "filter", limit: "maxConditions", max: 30 });
 * // "filter exceeds maxConditions (30)"
 * ```
 */
export function formatMessage(key: QueryKitMessageKey, args: MessageArgs = {}, catalog: QueryKitMessageCatalog = QUERYKIT_MESSAGES_EN): string {
  return interpolate(catalog[key], args);
}
