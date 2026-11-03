/**
 * Wire-contract table: one raw payload per case and the issues a validator must
 * report, as `{ path, key }` with the path relative to the checked value. Pure
 * data — the core checks (`checkFilter` / `checkSort` / `checkParams`) must
 * return exactly `expect`; `@querykitjs/class-validator` runs the filter and sort
 * rows; `@querykitjs/zod` runs the rows without validator-only options and must
 * accept exactly the rows whose `expect` is empty.
 */
import type { QueryLimits } from "../../src/defaults";
import type { FilterOperator } from "../../src/types";
import { notChain } from "./cases-limits";

export type WirePath = (string | number)[];

export interface WireExpectedIssue {
  path: WirePath;
  key: string;
}

/** Options only a class-validator-style check has; a row that sets one is skipped by zod. */
export interface WireFilterOnlyOptions {
  allowedKeys?: readonly string[];
  allowedOperators?: readonly FilterOperator[];
  strictValue?: boolean;
}

export interface WireFilterCase {
  kind: "filter";
  name: string;
  value: unknown;
  options?: WireFilterOnlyOptions;
  limits?: Partial<QueryLimits>;
  expect: WireExpectedIssue[];
}

export interface WireSortCase {
  kind: "sort";
  name: string;
  value: unknown;
  /** Sort allow-list — class-validator only. */
  allowedKeys?: readonly string[];
  limits?: Partial<QueryLimits>;
  expect: WireExpectedIssue[];
}

export type WireParamsKind = "offset" | "infinite" | "cursor";

export interface WireParamsCase {
  kind: "params";
  name: string;
  params: WireParamsKind;
  value: unknown;
  options?: { maxPerPage?: number; maxLimit?: number; limits?: Partial<QueryLimits>; allow?: ("columns" | "with" | "withDeleted")[] };
  expect: WireExpectedIssue[];
  /** The cleaned value when `expect` is empty. */
  cleaned?: Record<string, unknown>;
}

export type WireCase = WireFilterCase | WireSortCase | WireParamsCase;

const cond = (key = "name", operation: unknown = "=", value: unknown = "a") => ({ key, operation, value });
const conditions = (count: number) => Array.from({ length: count }, (_, index) => cond("age", ">", index));
const andChain = (depth: number): unknown => {
  let node: unknown = cond();
  for (let level = 1; level < depth; level++) node = { and: [node] };
  return node;
};

const filter = (name: string, value: unknown, expect: WireExpectedIssue[], extra: Partial<WireFilterCase> = {}): WireFilterCase => ({
  kind: "filter",
  name,
  value,
  expect,
  ...extra,
});
const sort = (name: string, value: unknown, expect: WireExpectedIssue[], extra: Partial<WireSortCase> = {}): WireSortCase => ({
  kind: "sort",
  name,
  value,
  expect,
  ...extra,
});
const params = (name: string, kind: WireParamsKind, value: unknown, expect: WireExpectedIssue[], extra: Partial<WireParamsCase> = {}): WireParamsCase => ({
  kind: "params",
  name,
  params: kind,
  value,
  expect,
  ...extra,
});

const at = (key: string, ...path: WirePath): WireExpectedIssue => ({ path, key });

export const WIRE_FILTER_CASES: readonly WireFilterCase[] = [
  filter("filter: absent", undefined, []),
  filter("filter: empty array", [], []),
  filter("filter: flat condition", [cond()], []),
  filter("filter: and/or/not tree", { and: [cond(), { or: [cond("age", ">", 3), { not: cond("status", "in", ["a", "b"]) }] }] }, []),
  filter("filter: node is a string", "x", [at("querykit.filter.invalid_node")]),
  filter("filter: flat item is a number", [1], [at("querykit.filter.invalid_node", 0)]),
  filter("filter: node without key or group", { operation: "=" }, [at("querykit.filter.missing_key")]),
  filter("filter: key is not a string", { key: 1, operation: "=" }, [at("querykit.filter.missing_key")]),
  filter("filter: unknown key with allowedKeys", cond("secret"), [at("querykit.filter.unknown_key")], { options: { allowedKeys: ["name"] } }),
  filter("filter: allowed key with allowedKeys", cond("name"), [], { options: { allowedKeys: ["name"] } }),
  filter("filter: unsupported operator", cond("name", "~"), [at("querykit.filter.invalid_operator", "operation")]),
  filter("filter: operator outside allowedOperators", cond("name", "like", "a%"), [at("querykit.filter.invalid_operator", "operation")], {
    options: { allowedOperators: ["="] },
  }),
  filter("filter: object value", cond("age", ">", { $gt: 1 }), [at("querykit.filter.invalid_value", "value")]),
  filter("filter: NaN value", cond("age", ">", Number.NaN), [at("querykit.filter.invalid_value", "value")]),
  filter("filter: array of objects", cond("age", "in", [{}]), [at("querykit.filter.invalid_value", "value")]),
  filter("filter: and is not an array", { and: 1 }, [at("querykit.filter.invalid_group", "and")]),
  filter("filter: bad child in or", { or: [cond(), 5] }, [at("querykit.filter.invalid_node", "or", 1)]),
  filter("filter: bad operator under not", { not: cond("name", "x") }, [at("querykit.filter.invalid_operator", "not", "operation")]),
  filter(
    "filter: two bad conditions in order",
    [cond("a", "~"), cond("b", "=", {})],
    [at("querykit.filter.invalid_operator", 0, "operation"), at("querykit.filter.invalid_value", 1, "value")],
  ),
  filter("filter: strictValue in needs an array", cond("age", "in", 1), [at("querykit.filter.value_requires_array", "value")], {
    options: { strictValue: true },
  }),
  filter("filter: strictValue between needs two", cond("age", "between", [1, 2, 3]), [at("querykit.filter.value_requires_tuple", "value")], {
    options: { strictValue: true },
  }),
  filter("filter: strictValue isNull takes no value", cond("age", "isNull", 1), [at("querykit.filter.value_forbidden", "value")], {
    options: { strictValue: true },
  }),
  filter("filter: in with a scalar without strictValue", cond("age", "in", 1), []),
  filter("filter: depth 5", andChain(5), []),
  filter("filter: depth 6", andChain(6), [at("querykit.filter.max_depth", "and", 0, "and", 0, "and", 0, "and", 0, "and", 0)]),
  filter("filter: not depth 6", notChain(6), [at("querykit.filter.max_depth", "not", "not", "not", "not", "not")]),
  filter("filter: 30 conditions", conditions(30), []),
  filter("filter: 31 conditions", conditions(31), [at("querykit.limit.exceeded", 30)]),
  filter(
    "filter: in 200 items",
    cond(
      "age",
      "in",
      Array.from({ length: 200 }, (_, i) => i),
    ),
    [],
  ),
  filter(
    "filter: in 201 items",
    cond(
      "age",
      "in",
      Array.from({ length: 201 }, (_, i) => i),
    ),
    [at("querykit.limit.exceeded", "value")],
  ),
  filter("filter: string 256", cond("name", "=", "a".repeat(256)), []),
  filter("filter: string 257", cond("name", "=", "a".repeat(257)), [at("querykit.limit.exceeded", "value")]),
  filter(
    "filter: maxInItems 500 override",
    cond(
      "age",
      "in",
      Array.from({ length: 300 }, (_, i) => i),
    ),
    [],
    { limits: { maxInItems: 500 } },
  ),
];

export const WIRE_SORT_CASES: readonly WireSortCase[] = [
  sort("sort: absent", undefined, []),
  sort("sort: valid desc", [{ key: "name", direction: "desc" }], []),
  sort("sort: without direction", [{ key: "name" }], []),
  sort("sort: not an array", { key: "name" }, [at("querykit.sort.not_array")]),
  sort(
    "sort: 3 fields",
    ["a", "b", "c"].map(key => ({ key })),
    [],
  ),
  sort(
    "sort: 4 fields",
    ["a", "b", "c", "d"].map(key => ({ key })),
    [at("querykit.limit.exceeded")],
  ),
  sort("sort: item is a string", ["name"], [at("querykit.sort.invalid_item", 0)]),
  sort("sort: item without key", [{ direction: "asc" }], [at("querykit.sort.missing_key", 0)]),
  sort("sort: unknown key with allowedKeys", [{ key: "secret" }], [at("querykit.sort.unknown_key", 0)], { allowedKeys: ["name"] }),
  sort("sort: bad direction", [{ key: "name", direction: "up" }], [at("querykit.sort.invalid_direction", 0, "direction")]),
];

export const WIRE_PARAMS_CASES: readonly WireParamsCase[] = [
  params("offset: empty", "offset", {}, [], { cleaned: {} }),
  params("offset: perPage 200", "offset", { page: 1, perPage: 200 }, [], { cleaned: { page: 1, perPage: 200 } }),
  params("offset: perPage 201", "offset", { page: 2, perPage: 201 }, [at("querykit.params.out_of_range", "perPage")]),
  params("offset: maxPerPage 50, perPage 51", "offset", { perPage: 51 }, [at("querykit.params.out_of_range", "perPage")], { options: { maxPerPage: 50 } }),
  params("offset: page 0", "offset", { page: 0 }, [at("querykit.params.out_of_range", "page")]),
  params("offset: page 1.5", "offset", { page: 1.5 }, [at("querykit.params.not_integer", "page")]),
  params("offset: page as a string", "offset", { page: "2" }, [at("querykit.params.invalid_type", "page")]),
  params("offset: offset 10 000", "offset", { page: 501, perPage: 20 }, [], { cleaned: { page: 501, perPage: 20 } }),
  params("offset: offset 10 020", "offset", { page: 502, perPage: 20 }, [at("querykit.limit.exceeded", "page")]),
  params("offset: default perPage depth", "offset", { page: 502 }, [at("querykit.limit.exceeded", "page")]),
  params("offset: withTotal string", "offset", { withTotal: "true" }, [at("querykit.params.invalid_type", "withTotal")]),
  params("offset: withDeleted stripped", "offset", { page: 1, withDeleted: true }, [], { cleaned: { page: 1 } }),
  params("offset: withDeleted allowed", "offset", { page: 1, withDeleted: true }, [], {
    options: { allow: ["withDeleted"] },
    cleaned: { page: 1, withDeleted: true },
  }),
  params("offset: withDeleted allowed, wrong type", "offset", { withDeleted: "yes" }, [at("querykit.params.invalid_type", "withDeleted")], {
    options: { allow: ["withDeleted"] },
  }),
  params("offset: columns allowed, wrong value", "offset", { columns: { name: "x" } }, [at("querykit.params.invalid_type", "columns", "name")], {
    options: { allow: ["columns"] },
  }),
  params("offset: columns and with allowed", "offset", { columns: { name: true }, with: { author: { columns: ["id"] } } }, [], {
    options: { allow: ["columns", "with"] },
    cleaned: { columns: { name: true }, with: { author: { columns: ["id"] } } },
  }),
  params("offset: with not an object", "offset", { with: [1] }, [at("querykit.params.invalid_type", "with")], { options: { allow: ["with"] } }),
  params("offset: unknown key stripped", "offset", { foo: 1, perPage: 10 }, [], { cleaned: { perPage: 10 } }),
  params("offset: bad filter", "offset", { filter: { and: 1 } }, [at("querykit.filter.invalid_group", "filter", "and")]),
  params("offset: filter and sort kept", "offset", { filter: [cond()], sort: [{ key: "name", direction: "asc" }] }, [], {
    cleaned: { filter: [cond()], sort: [{ key: "name", direction: "asc" }] },
  }),
  params("offset: sort with 4 fields", "offset", { sort: ["a", "b", "c", "d"].map(key => ({ key })) }, [at("querykit.limit.exceeded", "sort")]),
  params("offset: not an object", "offset", [1], [at("querykit.params.invalid_type")]),
  params("offset: null", "offset", null, [at("querykit.params.invalid_type")]),
  params("infinite: limit 200 offset 10 000", "infinite", { limit: 200, offset: 10_000 }, [], { cleaned: { limit: 200, offset: 10_000 } }),
  params("infinite: limit 201", "infinite", { limit: 201 }, [at("querykit.params.out_of_range", "limit")]),
  params("infinite: offset 10 001", "infinite", { offset: 10_001 }, [at("querykit.limit.exceeded", "offset")]),
  params("infinite: offset -1", "infinite", { offset: -1 }, [at("querykit.params.out_of_range", "offset")]),
  params("infinite: page stripped", "infinite", { page: 3, limit: 5 }, [], { cleaned: { limit: 5 } }),
  params("cursor: full", "cursor", { limit: 10, cursor: "abc", cursorKey: "createdAt", order: "desc", direction: "backward" }, [], {
    cleaned: { limit: 10, cursor: "abc", cursorKey: "createdAt", order: "desc", direction: "backward" },
  }),
  params("cursor: cursor null", "cursor", { cursor: null }, [], { cleaned: { cursor: null } }),
  params("cursor: sort stripped", "cursor", { limit: 5, sort: [{ key: "name" }] }, [], { cleaned: { limit: 5 } }),
  params("cursor: direction up", "cursor", { direction: "up" }, [at("querykit.params.invalid_enum", "direction")]),
  params("cursor: order ASC", "cursor", { order: "ASC" }, [at("querykit.params.invalid_enum", "order")]),
  params("cursor: cursor is a number", "cursor", { cursor: 5 }, [at("querykit.params.invalid_type", "cursor")]),
  params("cursor: cursorKey is a number", "cursor", { cursorKey: 1 }, [at("querykit.params.invalid_type", "cursorKey")]),
  params("cursor: limit Infinity", "cursor", { limit: Number.POSITIVE_INFINITY }, [at("querykit.params.invalid_type", "limit")]),
];

export const WIRE_CASES: readonly WireCase[] = [...WIRE_FILTER_CASES, ...WIRE_SORT_CASES, ...WIRE_PARAMS_CASES];
