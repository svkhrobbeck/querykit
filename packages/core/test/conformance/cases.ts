/**
 * The conformance table: one wire request per case and what it must return on
 * every adapter, written against `fixtures.ts`. Adapter-specific output (SQL,
 * Prisma args, Mongo filter) is not here — each adapter's fake driver turns its
 * own output back into rows, and the runner compares those rows to `expect`.
 *
 * A case an adapter fails today is marked `knownDifference` for that adapter
 * (with the reason) instead of being fixed here: this table locks today's
 * behaviour, later tasks change the expectations.
 */
import type { SkipReason, SkipSite, WireBaseParams, WireCursorParams, WireInfiniteParams, WireOffsetParams } from "../../src/types";

export type AdapterName = "drizzle-pg" | "prisma-pg" | "mongoose";

export type CaseGroup = "operator" | "group" | "sort" | "pagination" | "diagnostics" | "projection";

export type Call =
  | { method: "findAll"; params: WireBaseParams }
  | { method: "findList"; params: WireOffsetParams }
  | { method: "findInfinite"; params: WireInfiniteParams }
  | { method: "findCursor"; params: WireCursorParams; followNext?: boolean };

export interface CaseOptions {
  strict?: boolean;
  forcedColumns?: Record<string, true>;
  allowedColumns?: readonly string[];
}

export interface SkipExpectation {
  site: SkipSite;
  key: string;
  reason: SkipReason;
}

export interface Expectation {
  /** Rows by `name`; compared as a set unless `ordered`. */
  names?: readonly string[];
  ordered?: boolean;
  /** Every returned row has exactly these keys. */
  keys?: readonly string[];
  meta?: Record<string, unknown>;
  /** Conditions reported through `onSkippedCondition` (default: none). */
  skipped?: readonly SkipExpectation[];
  /** The call throws a `QueryKitError` with this info. */
  error?: SkipExpectation;
}

export interface ConformanceCase {
  name: string;
  group: CaseGroup;
  call: Call;
  options?: CaseOptions;
  expect: Expectation;
  knownDifference?: Partial<Record<AdapterName, string>>;
}

/** The cursor token every adapter emits: base64url of `{"v": <value>}` (dates as ISO strings). */
export const cursorToken = (value: unknown): string => Buffer.from(JSON.stringify({ v: value }), "utf8").toString("base64url");

const ALL = ["Alice", "Bob", "Carol", "dave", "Eve_Ann", "Frank", "Alina"] as const;
const BY_CREATED = ["Alice", "Bob", "Carol", "dave", "Eve_Ann", "Frank", "Alina"] as const;

const where = (filter: WireBaseParams["filter"], names: readonly string[], extra: Partial<ConformanceCase> = {}): Omit<ConformanceCase, "name" | "group"> => ({
  call: { method: "findAll", params: { filter } },
  expect: { names },
  ...extra,
});

const op = (name: string, key: string, operation: string, value: unknown, names: readonly string[], extra: Partial<ConformanceCase> = {}): ConformanceCase => ({
  name,
  group: "operator",
  ...where([value === undefined ? { key, operation } : { key, operation, value }] as WireBaseParams["filter"], names, extra),
});

const OPERATOR_CASES: ConformanceCase[] = [
  op("= on a number", "age", "=", 25, ["Bob", "Eve_Ann"]),
  op("eq alias", "age", "eq", 30, ["Alice"]),
  op("!= drops NULL rows", "age", "!=", 25, ["Alice", "dave", "Frank"]),
  op("ne alias", "age", "ne", 30, ["Bob", "dave", "Eve_Ann", "Frank"]),
  op("> on a number", "age", ">", 25, ["Alice", "dave"]),
  op("gt alias", "age", "gt", 30, ["dave"]),
  op(">= on a number", "age", ">=", 25, ["Alice", "Bob", "dave", "Eve_Ann"]),
  op("gte alias", "age", "gte", 41, ["dave"]),
  op("< on a number", "age", "<", 25, ["Frank"]),
  op("lt alias", "age", "lt", 30, ["Bob", "Eve_Ann", "Frank"]),
  op("<= on a number", "age", "<=", 25, ["Bob", "Eve_Ann", "Frank"]),
  op("lte alias", "age", "lte", 17, ["Frank"]),
  op("like is case-sensitive", "name", "like", "A%", ["Alice", "Alina"]),
  op("like with a lowercase pattern", "name", "like", "%a%", ["Carol", "dave", "Frank", "Alina"]),
  op("like _ is a one-character wildcard", "name", "like", "A_i%", ["Alice", "Alina"], {
    knownDifference: { "prisma-pg": "an anchored LIKE becomes `startsWith`, so `_` is matched literally" },
  }),
  op("ilike is case-insensitive", "name", "ilike", "%A%", ["Alice", "Carol", "dave", "Eve_Ann", "Frank", "Alina"]),
  op("notLike drops matches", "name", "notLike", "%a%", ["Alice", "Bob", "Eve_Ann"]),
  op("contains is case-insensitive", "name", "contains", "AL", ["Alice", "Alina"]),
  op("%_% token = contains", "name", "%_%", "ar", ["Carol"]),
  op("contains treats _ literally", "name", "contains", "_", ["Eve_Ann"], {
    knownDifference: { "drizzle-pg": "the value is not LIKE-escaped, so `_` matches any character" },
  }),
  op("startsWith is case-insensitive", "name", "startsWith", "a", ["Alice", "Alina"]),
  op("%_ token = startsWith", "name", "%_", "D", ["dave"]),
  op("endsWith is case-insensitive", "name", "endsWith", "E", ["Alice", "dave"]),
  op("_% token = endsWith", "name", "_%", "nn", ["Eve_Ann"]),
  op("in", "age", "in", [17, 41], ["dave", "Frank"]),
  op("notIn drops NULL rows", "age", "notIn", [25, 30], ["dave", "Frank"]),
  op("between is inclusive", "age", "between", [25, 30], ["Alice", "Bob", "Eve_Ann"]),
  op("notBetween drops NULL rows", "age", "notBetween", [20, 35], ["dave", "Frank"]),
  op("isNull", "age", "isNull", undefined, ["Carol", "Alina"]),
  op("isNotNull", "age", "isNotNull", undefined, ["Alice", "Bob", "dave", "Eve_Ann", "Frank"]),
  {
    name: "operation defaults to =",
    group: "operator",
    ...where([{ key: "name", value: "Bob" }], ["Bob"]),
  },
  op(">= on a date with an ISO string", "createdAt", ">=", "2026-05-01T00:00:00.000Z", ["Eve_Ann", "Frank", "Alina"]),
  op("< on a date with an ISO string", "createdAt", "<", "2026-02-01T00:00:00.000Z", ["Alice"]),
  op("between on dates with ISO strings", "createdAt", "between", ["2026-02-01T00:00:00.000Z", "2026-04-30T00:00:00.000Z"], ["Bob", "Carol", "dave"]),
];

const GROUP_CASES: ConformanceCase[] = [
  {
    name: "flat array is an implicit AND",
    group: "group",
    ...where(
      [
        { key: "age", operation: ">=", value: 25 },
        { key: "name", operation: "like", value: "%a%" },
      ],
      ["dave"],
    ),
  },
  {
    name: "and group",
    group: "group",
    ...where(
      {
        and: [
          { key: "age", operation: ">", value: 20 },
          { key: "name", operation: "ilike", value: "%e%" },
        ],
      },
      ["Alice", "dave", "Eve_Ann"],
    ),
  },
  {
    name: "or group",
    group: "group",
    ...where(
      {
        or: [
          { key: "age", operation: "=", value: 17 },
          { key: "age", operation: "isNull" },
        ],
      },
      ["Frank", "Carol", "Alina"],
    ),
  },
  {
    name: "not on one field drops NULL rows (three-valued logic)",
    group: "group",
    ...where({ not: { key: "age", operation: ">", value: 25 } }, ["Bob", "Eve_Ann", "Frank"]),
  },
  {
    name: "not over several fields drops rows where the inner group is unknown",
    group: "group",
    ...where(
      {
        not: {
          and: [
            { key: "name", operation: "=", value: "Carol" },
            { key: "age", operation: ">", value: 3 },
          ],
        },
      },
      ["Alice", "Bob", "dave", "Eve_Ann", "Frank", "Alina"],
    ),
    knownDifference: { mongoose: "a multi-field `not` is a bare `$nor`, which keeps documents where the inner group is unknown (Carol, age null)" },
  },
  {
    name: "nested or / and / not",
    group: "group",
    ...where(
      {
        or: [
          {
            and: [
              { key: "age", operation: ">=", value: 25 },
              { key: "age", operation: "<=", value: 30 },
            ],
          },
          { not: { key: "name", operation: "startsWith", value: "a" } },
        ],
      },
      ["Alice", "Bob", "Carol", "dave", "Eve_Ann", "Frank"],
    ),
  },
  { name: "empty filter returns every row", group: "group", ...where([], ALL) },
];

const SORT_CASES: ConformanceCase[] = [
  {
    name: "sort by one field",
    group: "sort",
    call: { method: "findAll", params: { sort: [{ key: "createdAt", direction: "desc" }] } },
    expect: { names: [...BY_CREATED].reverse(), ordered: true },
  },
  {
    name: "sort by two fields",
    group: "sort",
    call: {
      method: "findAll",
      params: {
        filter: [{ key: "age", operation: "isNotNull" }],
        sort: [
          { key: "age", direction: "desc" },
          { key: "name", direction: "asc" },
        ],
      },
    },
    expect: { names: ["dave", "Alice", "Bob", "Eve_Ann", "Frank"], ordered: true },
  },
  {
    name: "sort on a nullable field puts NULL last on asc",
    group: "sort",
    call: {
      method: "findAll",
      params: {
        sort: [
          { key: "age", direction: "asc" },
          { key: "createdAt", direction: "desc" },
        ],
      },
    },
    expect: { names: ["Frank", "Eve_Ann", "Bob", "Alice", "dave", "Alina", "Carol"], ordered: true },
    knownDifference: { mongoose: "MongoDB sorts null lowest, so NULL rows come first on asc" },
  },
  {
    name: "unknown sort key is skipped and reported",
    group: "sort",
    call: { method: "findAll", params: { sort: [{ key: "nope", direction: "asc" }] } },
    expect: { names: ALL, skipped: [{ site: "sort", key: "nope", reason: "unknown-key" }] },
  },
];

const byCreated = [{ key: "createdAt", direction: "asc" as const }];

const PAGINATION_CASES: ConformanceCase[] = [
  {
    name: "offset page 2",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 2, perPage: 3 } },
    expect: {
      names: ["dave", "Eve_Ann", "Frank"],
      ordered: true,
      meta: { total_items: 7, total_pages: 3, current_page: 2, per_page: 3, has_next: true, has_prev: true },
    },
  },
  {
    name: "offset with a filter",
    group: "pagination",
    call: { method: "findList", params: { filter: [{ key: "age", operation: "isNotNull" }], sort: [{ key: "age", direction: "desc" }], page: 1, perPage: 2 } },
    expect: {
      names: ["dave", "Alice"],
      ordered: true,
      meta: { total_items: 5, total_pages: 3, current_page: 1, per_page: 2, has_next: true, has_prev: false },
    },
  },
  {
    name: "perPage above the cap is clamped to 200",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 500 } },
    expect: {
      names: BY_CREATED,
      ordered: true,
      meta: { total_items: 7, total_pages: 1, current_page: 1, per_page: 200, has_next: false, has_prev: false },
    },
  },
  {
    name: "infinite with more rows",
    group: "pagination",
    call: { method: "findInfinite", params: { sort: byCreated, limit: 2, offset: 2 } },
    expect: { names: ["Carol", "dave"], ordered: true, meta: { limit: 2, offset: 2, count: 2, has_more: true, next_offset: 4 } },
  },
  {
    name: "infinite last page",
    group: "pagination",
    call: { method: "findInfinite", params: { sort: byCreated, limit: 5, offset: 5 } },
    expect: { names: ["Frank", "Alina"], ordered: true, meta: { limit: 5, offset: 5, count: 2, has_more: false, next_offset: null } },
  },
  {
    name: "cursor first page",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 3, order: "asc" } },
    expect: {
      names: ["Alice", "Bob", "Carol"],
      ordered: true,
      meta: { limit: 3, has_next: true, has_prev: false, next_cursor: cursorToken("2026-03-20T09:00:00.000Z"), prev_cursor: null },
    },
  },
  {
    name: "cursor next page from the token",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 3, order: "asc" }, followNext: true },
    expect: {
      names: ["dave", "Eve_Ann", "Frank"],
      ordered: true,
      meta: {
        limit: 3,
        has_next: true,
        has_prev: true,
        next_cursor: cursorToken("2026-06-30T09:00:00.000Z"),
        prev_cursor: cursorToken("2026-04-05T09:00:00.000Z"),
      },
    },
  },
  {
    name: "cursor descending",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 4, order: "desc" } },
    expect: {
      names: ["Alina", "Frank", "Eve_Ann", "dave"],
      ordered: true,
      meta: { limit: 4, has_next: true, has_prev: false, next_cursor: cursorToken("2026-04-05T09:00:00.000Z"), prev_cursor: null },
    },
  },
];

const DIAGNOSTIC_CASES: ConformanceCase[] = [
  {
    name: "unknown filter key is skipped and reported",
    group: "diagnostics",
    ...where([{ key: "nope", operation: "=", value: 1 }], ALL),
    expect: { names: ALL, skipped: [{ site: "filter", key: "nope", reason: "unknown-key" }] },
  },
  {
    name: "invalid value is skipped and reported",
    group: "diagnostics",
    ...where([{ key: "age", operation: "=", value: "abc" }], ALL),
    expect: { names: ALL, skipped: [{ site: "filter", key: "age", reason: "invalid-value" }] },
    knownDifference: {
      "drizzle-pg": "only date columns are cast; `age = 'abc'` reaches PostgreSQL, which rejects the query (500)",
      mongoose: "number fields are not cast by the adapter; mongoose throws a CastError at exec (500)",
    },
  },
  {
    name: "a skipped condition leaves the others in force",
    group: "diagnostics",
    ...where(
      [
        { key: "age", operation: ">=", value: 30 },
        { key: "nope", operation: "=", value: 1 },
      ],
      ["Alice", "dave"],
    ),
    expect: { names: ["Alice", "dave"], skipped: [{ site: "filter", key: "nope", reason: "unknown-key" }] },
  },
  {
    name: "strict: unknown filter key throws",
    group: "diagnostics",
    call: { method: "findAll", params: { filter: [{ key: "nope", operation: "=", value: 1 }] } },
    options: { strict: true },
    expect: { error: { site: "filter", key: "nope", reason: "unknown-key" } },
  },
  {
    name: "strict: invalid value throws",
    group: "diagnostics",
    call: { method: "findAll", params: { filter: [{ key: "age", operation: "=", value: "abc" }] } },
    options: { strict: true },
    expect: { error: { site: "filter", key: "age", reason: "invalid-value" } },
    knownDifference: {
      "drizzle-pg": "only date columns are cast; strict mode does not see `age = 'abc'`, PostgreSQL rejects it (500)",
      mongoose: "number fields are not cast by the adapter; strict mode does not see it, mongoose throws a CastError (500)",
    },
  },
  {
    name: "strict: unknown sort key throws",
    group: "diagnostics",
    call: { method: "findAll", params: { sort: [{ key: "nope", direction: "asc" }] } },
    options: { strict: true },
    expect: { error: { site: "sort", key: "nope", reason: "unknown-key" } },
  },
  {
    name: "unknown cursorKey always throws",
    group: "diagnostics",
    call: { method: "findCursor", params: { cursorKey: "nope", limit: 2 } },
    expect: { error: { site: "cursorKey", key: "nope", reason: "unknown-key" } },
  },
];

const PROJECTION_CASES: ConformanceCase[] = [
  {
    name: "forcedColumns ignores the client selection",
    group: "projection",
    call: { method: "findAll", params: { columns: { email: true } } },
    options: { forcedColumns: { id: true, name: true } },
    expect: { names: ALL, keys: ["id", "name"] },
  },
  {
    name: "forcedColumns applies to offset pages",
    group: "projection",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 2 } },
    options: { forcedColumns: { id: true, name: true } },
    expect: {
      names: ["Alice", "Bob"],
      ordered: true,
      keys: ["id", "name"],
      meta: { total_items: 7, total_pages: 4, current_page: 1, per_page: 2, has_next: true, has_prev: false },
    },
  },
  {
    name: "allowedColumns intersects the client selection",
    group: "projection",
    call: { method: "findAll", params: { columns: { name: true, email: true } } },
    options: { allowedColumns: ["id", "name"] },
    expect: { names: ALL, keys: ["name"] },
  },
  {
    name: "allowedColumns with no overlap falls back to the allow-list",
    group: "projection",
    call: { method: "findAll", params: { columns: { email: true } } },
    options: { allowedColumns: ["id", "name"] },
    expect: { names: ALL, keys: ["id", "name"] },
  },
  {
    name: "cursor column is not leaked past allowedColumns",
    group: "projection",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 2, order: "asc", columns: { name: true } } },
    options: { allowedColumns: ["name"] },
    expect: {
      names: ["Alice", "Bob"],
      ordered: true,
      keys: ["name"],
      meta: { limit: 2, has_next: true, has_prev: false, next_cursor: cursorToken("2026-02-15T09:00:00.000Z"), prev_cursor: null },
    },
  },
];

export const CASES: readonly ConformanceCase[] = [
  ...OPERATOR_CASES,
  ...GROUP_CASES,
  ...SORT_CASES,
  ...PAGINATION_CASES,
  ...DIAGNOSTIC_CASES,
  ...PROJECTION_CASES,
];
