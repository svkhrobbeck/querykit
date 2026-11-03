/**
 * `@querykitjs/standard-schema` — the querykit request contract (filter, sort,
 * offset / infinite / cursor params) as Standard Schema v1 validators, for a
 * backend with no zod or class-validator: valibot, arktype or Effect projects,
 * Hono `sValidator`, tRPC `.input()`. The same names, options and results as
 * the `@querykitjs/zod` factories; the same rejection paths and keys as
 * `@querykitjs/class-validator` — all three run the core wire checks.
 */
import type { FilterOperator, QueryLimits, SortItem, WireCursorParams, WireInfiniteParams, WireOffsetParams, Filter } from "@querykitjs/core";
import {
  QUERYKIT_MESSAGES_EN,
  QUERYKIT_PARAMS_MESSAGES_EN,
  checkFilter,
  checkParams,
  checkSort,
  interpolate,
  type WireIssue,
  type WireIssueArgs,
  type WireIssueKey,
  type WireParamsKind,
  type WireServerOwnedField,
} from "@querykitjs/core/internal";
import type { StandardSchemaIssue, StandardSchemaResult, StandardSchemaV1 } from "./spec";

export type {
  InferOutput,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaOptions,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
  StandardSchemaTypes,
  StandardSchemaV1,
} from "./spec";

/** Request fields only the server may set; a client sends them only where `allow` opens them. */
export type ServerOwnedField = WireServerOwnedField;

/** Options of the params factories — the names and defaults of `@querykitjs/zod`. */
export interface ParamsSchemaOptions<TAllow extends readonly ServerOwnedField[] = []> {
  /** `perPage` upper bound. Default core `DEFAULT_MAX_PER_PAGE` (200); `Infinity` removes it (⚠️ a DoS surface). */
  maxPerPage?: number;
  /** `limit` upper bound. Default core `DEFAULT_MAX_LIMIT` (200). */
  maxLimit?: number;
  /** Request limits over the core `DEFAULT_QUERY_LIMITS` (depth 5, conditions 30, array 200, string 256, offset 10 000, sort 3). */
  limits?: Partial<QueryLimits>;
  /** Server-owned fields to accept from the client. Default none: `columns`, `with` and `withDeleted` are stripped. */
  allow?: TAllow;
}

/** Options of {@link makeFilterSchema}. */
export interface FilterSchemaOptions {
  limits?: Partial<QueryLimits>;
  /** Only these keys may be filtered on; another key is an issue. */
  allowedKeys?: readonly string[];
  /** Absent — every core operator. */
  allowedOperators?: readonly FilterOperator[];
}

/** A Standard Schema issue plus the querykit message key and its arguments, for i18n. */
export interface QueryKitIssue extends StandardSchemaIssue {
  readonly path: readonly (string | number)[];
  readonly key: WireIssueKey;
  readonly args: WireIssueArgs;
}

type Accepted<TWire, TAllow extends readonly ServerOwnedField[]> = Omit<TWire, ServerOwnedField> & Pick<TWire, Extract<TAllow[number], keyof TWire>>;

/** The validated output of `makeOffsetParamsSchema(...)`. */
export type MadeOffsetParams<TAllow extends readonly ServerOwnedField[] = []> = Accepted<WireOffsetParams, TAllow>;
export type MadeInfiniteParams<TAllow extends readonly ServerOwnedField[] = []> = Accepted<WireInfiniteParams, TAllow>;
export type MadeCursorParams<TAllow extends readonly ServerOwnedField[] = []> = Accepted<WireCursorParams, TAllow>;

const VENDOR = "querykit";

/** `filter.and[1].value` — the path as text for the message; the empty path is the schema's own name. */
const pathText = (root: string, path: readonly (string | number)[]): string =>
  path.reduce<string>((text, part) => (typeof part === "number" ? `${text}[${part}]` : text ? `${text}.${part}` : part), root) || root || "params";

const template = (key: WireIssueKey): string =>
  key in QUERYKIT_MESSAGES_EN
    ? QUERYKIT_MESSAGES_EN[key as keyof typeof QUERYKIT_MESSAGES_EN]
    : QUERYKIT_PARAMS_MESSAGES_EN[key as keyof typeof QUERYKIT_PARAMS_MESSAGES_EN];

const toIssue = (root: string, found: WireIssue): QueryKitIssue => ({
  message: interpolate(template(found.key), { path: pathText(root, found.path), ...found.args }),
  path: found.path,
  key: found.key,
  args: found.args,
});

/**
 * One schema around a check. `validate` is synchronous; the value it returns is
 * the checked input (or the cleaned params object), typed by the factory.
 */
function standardSchema<TOutput>(
  root: string,
  check: (value: unknown) => { value?: unknown; issues: readonly WireIssue[] },
): StandardSchemaV1<unknown, TOutput> {
  return {
    "~standard": {
      version: 1,
      vendor: VENDOR,
      validate: (value): StandardSchemaResult<TOutput> => {
        const result = check(value);
        if (result.issues.length > 0) return { issues: result.issues.map(found => toIssue(root, found)) };
        // the check accepted it: every field matches the wire type the factory declares
        return { value: result.value as TOutput };
      },
    },
  };
}

const paramsSchema = <TOutput>(kind: WireParamsKind, options: ParamsSchemaOptions<readonly ServerOwnedField[]>): StandardSchemaV1<unknown, TOutput> =>
  standardSchema<TOutput>("", value => checkParams(kind, value, options));

/**
 * Offset (page) params — `perPage` capped, server-owned fields stripped unless allowed,
 * `(page - 1) × perPage` within `maxOffset`.
 *
 * @example
 * ```ts
 * app.post("/users/list", sValidator("json", makeOffsetParamsSchema({ maxPerPage: 100 })), c => c.json(c.req.valid("json")));
 * ```
 */
export function makeOffsetParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(
  options: ParamsSchemaOptions<TAllow> = {},
): StandardSchemaV1<unknown, MadeOffsetParams<TAllow>> {
  return paramsSchema("offset", options);
}

/** Infinite-scroll params — `limit` capped, `offset` within `maxOffset`. See {@link makeOffsetParamsSchema}. */
export function makeInfiniteParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(
  options: ParamsSchemaOptions<TAllow> = {},
): StandardSchemaV1<unknown, MadeInfiniteParams<TAllow>> {
  return paramsSchema("infinite", options);
}

/** Cursor (keyset) params — `limit` capped; no `sort`, the order is `order` + `direction`. */
export function makeCursorParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(
  options: ParamsSchemaOptions<TAllow> = {},
): StandardSchemaV1<unknown, MadeCursorParams<TAllow>> {
  return paramsSchema("cursor", options);
}

/** A filter on its own (a node, or a flat array as an implicit AND); a value is required. */
export function makeFilterSchema(options: FilterSchemaOptions = {}): StandardSchemaV1<unknown, Filter> {
  return standardSchema<Filter>("filter", value => ({
    value,
    issues: value === undefined ? [{ path: [], key: "querykit.filter.invalid_node", args: {} }] : checkFilter(value, { ...options, ...options.limits }),
  }));
}

/** A filter under the core default limits. */
export const filterSchema = /* @__PURE__ */ makeFilterSchema();

/** A sort, `{ key, direction }[]`, under the core `maxSortFields` (3); a value is required. */
export const sortSchema: StandardSchemaV1<unknown, SortItem[]> = /* @__PURE__ */ standardSchema<SortItem[]>("sort", value => ({
  value,
  issues: value === undefined ? [{ path: [], key: "querykit.sort.not_array", args: {} }] : checkSort(value),
}));
