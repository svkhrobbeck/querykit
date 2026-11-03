/**
 * Wire-contract checks for validator authors: the filter, the sort and the
 * pagination params exactly as they arrive from JSON. Framework-free and
 * text-free — an issue carries a path, a message key and its arguments; each
 * validator renders its own message. The size walk runs first, iteratively, so
 * an oversized payload never reaches the recursive shape check.
 */
import { DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE, resolveLimits, type QueryLimits } from "../defaults";
import { FILTER_OPERATORS } from "../operators";
import type { FilterOperator } from "../types";
import { findFilterLimitViolation, offsetOf, type LimitPath } from "./limits";

export type WireFilterIssueKey =
  | "querykit.filter.invalid_node"
  | "querykit.filter.missing_key"
  | "querykit.filter.unknown_key"
  | "querykit.filter.invalid_operator"
  | "querykit.filter.invalid_value"
  | "querykit.filter.invalid_group"
  | "querykit.filter.max_depth"
  | "querykit.filter.value_requires_array"
  | "querykit.filter.value_requires_tuple"
  | "querykit.filter.value_forbidden"
  | "querykit.limit.exceeded";

export type WireSortIssueKey =
  | "querykit.sort.not_array"
  | "querykit.sort.invalid_item"
  | "querykit.sort.missing_key"
  | "querykit.sort.unknown_key"
  | "querykit.sort.invalid_direction"
  | "querykit.limit.exceeded";

export type WireParamsIssueKey =
  "querykit.params.invalid_type" | "querykit.params.not_integer" | "querykit.params.out_of_range" | "querykit.params.invalid_enum";

export type WireIssueKey = WireFilterIssueKey | WireSortIssueKey | WireParamsIssueKey;

/** Message arguments: strings and numbers only, so any message catalog can interpolate them. */
export type WireIssueArgs = Record<string, string | number>;

/** One rejected spot: object keys and array indexes from the checked value, the message key and its arguments. */
export interface WireIssue<TKey extends WireIssueKey = WireIssueKey> {
  path: LimitPath;
  key: TKey;
  args: WireIssueArgs;
}

export interface WireFilterOptions extends Partial<Pick<QueryLimits, "maxDepth" | "maxConditions" | "maxInItems" | "maxStringLength">> {
  /** Only these keys may be filtered on; another key is an issue. Absent — any string key. */
  allowedKeys?: readonly string[];
  /** Absent — every core operator. */
  allowedOperators?: readonly FilterOperator[];
  /** `in`/`notIn` need an array, `between`/`notBetween` exactly two values, `isNull`/`isNotNull` no value. */
  strictValue?: boolean;
}

export interface WireSortOptions extends Partial<Pick<QueryLimits, "maxSortFields">> {
  /** Only these keys may be sorted on. */
  allowedKeys?: readonly string[];
}

/** Request fields only the server may set; a client sends them only where `allow` opens them. */
export type WireServerOwnedField = "columns" | "with" | "withDeleted";

/** The same names and defaults as the `@querykitjs/zod` params factories. */
export interface WireParamsOptions {
  /** Default `DEFAULT_MAX_PER_PAGE` (200). */
  maxPerPage?: number;
  /** Default `DEFAULT_MAX_LIMIT` (200). */
  maxLimit?: number;
  limits?: Partial<QueryLimits>;
  allow?: readonly WireServerOwnedField[];
}

export type WireParamsKind = "offset" | "infinite" | "cursor";

export interface WireParamsResult {
  /** The accepted fields only (unknown and closed server-owned fields stripped); absent when there are issues. */
  value?: Record<string, unknown>;
  issues: WireIssue[];
}

type UnknownRecord = Record<string, unknown>;

const ALL_OPERATORS: ReadonlySet<string> = /* @__PURE__ */ new Set<string>(FILTER_OPERATORS);

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

/** JSON has no `Date`, `NaN` or `Infinity`; a date arrives as an ISO string. */
const isScalar = (value: unknown): boolean =>
  value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

const isFilterValue = (value: unknown): boolean => (Array.isArray(value) ? value.every(isScalar) : isScalar(value));

/** Text for a message argument; the input is untrusted, so `String()` may throw. */
const label = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const wireIssue = <TKey extends WireIssueKey>(key: TKey, path: LimitPath, args: WireIssueArgs = {}): WireIssue<TKey> => ({ path, key, args });

/* --------------------------------- filter ---------------------------------- */

interface FilterWalk {
  issues: WireIssue<WireFilterIssueKey>[];
  allowedKeys?: ReadonlySet<string>;
  operators: ReadonlySet<string>;
  maxDepth: number;
  strictValue: boolean;
}

/** Extra properties (a legacy `type`) are ignored, as the zod schemas strip them. */
function checkCondition(node: unknown, path: LimitPath, walk: FilterWalk): void {
  if (!isRecord(node)) {
    walk.issues.push(wireIssue("querykit.filter.invalid_node", path));
    return;
  }
  const { key, operation, value } = node;
  if (typeof key !== "string") {
    walk.issues.push(wireIssue("querykit.filter.missing_key", path));
    return;
  }
  if (walk.allowedKeys && !walk.allowedKeys.has(key)) walk.issues.push(wireIssue("querykit.filter.unknown_key", path, { key }));

  let operator: string | undefined;
  if (operation !== undefined) {
    if (typeof operation === "string" && walk.operators.has(operation)) operator = operation;
    else walk.issues.push(wireIssue("querykit.filter.invalid_operator", [...path, "operation"], { operation: label(operation) }));
  }
  if (value !== undefined && !isFilterValue(value)) walk.issues.push(wireIssue("querykit.filter.invalid_value", [...path, "value"]));
  if (walk.strictValue && operator !== undefined) checkValueShape(operator, value, [...path, "value"], walk);
}

/** The `strictValue` check: `in`/`notIn` an array, `between`/`notBetween` two values, `isNull`/`isNotNull` none. */
function checkValueShape(operator: string, value: unknown, path: LimitPath, walk: FilterWalk): void {
  const key =
    (operator === "in" || operator === "notIn") && !Array.isArray(value)
      ? "querykit.filter.value_requires_array"
      : (operator === "between" || operator === "notBetween") && (!Array.isArray(value) || value.length !== 2)
        ? "querykit.filter.value_requires_tuple"
        : (operator === "isNull" || operator === "isNotNull") && value !== undefined
          ? "querykit.filter.value_forbidden"
          : undefined;
  if (key) walk.issues.push(wireIssue(key, path, { operation: operator }));
}

function walkGroup(group: unknown, depth: number, path: LimitPath, walk: FilterWalk): void {
  if (!Array.isArray(group)) {
    walk.issues.push(wireIssue("querykit.filter.invalid_group", path));
    return;
  }
  group.forEach((child, index) => walkNode(child, depth + 1, [...path, index], walk));
}

/** Recursive, but only after the size walk has bounded the depth. */
function walkNode(node: unknown, depth: number, path: LimitPath, walk: FilterWalk): void {
  if (depth > walk.maxDepth) {
    walk.issues.push(wireIssue("querykit.filter.max_depth", path, { max: walk.maxDepth }));
    return;
  }
  if (!isRecord(node)) {
    walk.issues.push(wireIssue("querykit.filter.invalid_node", path));
    return;
  }
  // The zod union tries the condition first: any object with `key` is a condition.
  if ("key" in node) checkCondition(node, path, walk);
  else if ("and" in node) walkGroup(node.and, depth, [...path, "and"], walk);
  else if ("or" in node) walkGroup(node.or, depth, [...path, "or"], walk);
  else if ("not" in node) walkNode(node.not, depth + 1, [...path, "not"], walk);
  else walk.issues.push(wireIssue("querykit.filter.missing_key", path));
}

/**
 * Checks a wire filter (a node, or a flat array as an implicit AND). An empty
 * list means valid; `undefined` is valid. A crossed size limit is the only issue.
 *
 * @example
 * ```ts
 * checkFilter({ key: "age", operation: "~" }); // [{ path: ["operation"], key: "querykit.filter.invalid_operator", args: { operation: "~" } }]
 * ```
 */
export function checkFilter(value: unknown, options: WireFilterOptions = {}): WireIssue<WireFilterIssueKey>[] {
  if (value === undefined) return [];
  const limits = resolveLimits(options);
  const violation = findFilterLimitViolation(value, limits);
  if (violation) {
    const key = violation.limit === "maxDepth" ? "querykit.filter.max_depth" : "querykit.limit.exceeded";
    return [wireIssue(key, violation.path, { limit: violation.limit, max: violation.max })];
  }

  const walk: FilterWalk = {
    issues: [],
    allowedKeys: options.allowedKeys ? new Set(options.allowedKeys) : undefined,
    operators: options.allowedOperators ? new Set<string>(options.allowedOperators) : ALL_OPERATORS,
    maxDepth: limits.maxDepth,
    strictValue: options.strictValue ?? false,
  };
  // A flat array holds conditions only, never nested groups — as the core `FieldCondition[]` type says.
  if (Array.isArray(value)) value.forEach((item, index) => checkCondition(item, [index], walk));
  else walkNode(value, 1, [], walk);
  return walk.issues;
}

/* ---------------------------------- sort ----------------------------------- */

/** Checks a wire sort, `{ key, direction }[]`. An empty list means valid; `undefined` is valid. */
export function checkSort(value: unknown, options: WireSortOptions = {}): WireIssue<WireSortIssueKey>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [wireIssue("querykit.sort.not_array", [])];
  const { maxSortFields } = resolveLimits(options);
  if (value.length > maxSortFields) return [wireIssue("querykit.limit.exceeded", [], { limit: "maxSortFields", max: maxSortFields })];

  const allowedKeys = options.allowedKeys ? new Set(options.allowedKeys) : undefined;
  const issues: WireIssue<WireSortIssueKey>[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push(wireIssue("querykit.sort.invalid_item", [index]));
      return;
    }
    const { key, direction } = item;
    if (typeof key !== "string") {
      issues.push(wireIssue("querykit.sort.missing_key", [index]));
      return;
    }
    if (allowedKeys && !allowedKeys.has(key)) issues.push(wireIssue("querykit.sort.unknown_key", [index], { key }));
    if (direction !== undefined && direction !== "asc" && direction !== "desc") {
      issues.push(wireIssue("querykit.sort.invalid_direction", [index, "direction"]));
    }
  });
  return issues;
}

/* --------------------------------- params ---------------------------------- */

/** Checks one present field and reports into `issues`; the field is kept when it adds none. */
type FieldCheck = (value: unknown, path: LimitPath, issues: WireIssue[]) => void;

const prefixed = (path: LimitPath, issues: readonly WireIssue[]): WireIssue[] => issues.map(found => ({ ...found, path: [...path, ...found.path] }));

type Expected = "boolean" | "string" | "object" | "string or null";

const accepts = (expected: Expected, value: unknown): boolean =>
  expected === "object" ? isRecord(value) : expected === "string or null" ? value === null || typeof value === "string" : typeof value === expected;

const typed =
  (expected: Expected): FieldCheck =>
  (value, path, issues) => {
    if (!accepts(expected, value)) issues.push(wireIssue("querykit.params.invalid_type", path, { expected }));
  };

const oneOf =
  (values: readonly string[]): FieldCheck =>
  (value, path, issues) => {
    if (typeof value !== "string" || !values.includes(value)) issues.push(wireIssue("querykit.params.invalid_enum", path, { values: values.join(", ") }));
  };

/** An integer in `[min, max]`; above `maxOffset`, a limit issue instead of a range issue. */
const integer =
  (min: number, max: number, overLimit?: keyof QueryLimits): FieldCheck =>
  (value, path, issues) => {
    if (typeof value !== "number" || !Number.isFinite(value)) issues.push(wireIssue("querykit.params.invalid_type", path, { expected: "number" }));
    else if (!Number.isInteger(value)) issues.push(wireIssue("querykit.params.not_integer", path));
    else if (value < min) issues.push(wireIssue("querykit.params.out_of_range", path, { min }));
    else if (value > max && overLimit) issues.push(wireIssue("querykit.limit.exceeded", path, { limit: overLimit, max }));
    else if (value > max) issues.push(wireIssue("querykit.params.out_of_range", path, { max }));
  };

/** `columns` is a map of column name → boolean. */
const checkColumns: FieldCheck = (value, path, issues) => {
  typed("object")(value, path, issues);
  if (isRecord(value)) for (const [name, flag] of Object.entries(value)) typed("boolean")(flag, [...path, name], issues);
};

const serverOwnedCheck = (field: WireServerOwnedField): FieldCheck => (field === "columns" ? checkColumns : typed(field === "with" ? "object" : "boolean"));

function fieldChecks(kind: WireParamsKind, options: WireParamsOptions, limits: QueryLimits): Map<string, FieldCheck> {
  const checks = new Map<string, FieldCheck>();
  checks.set("filter", (value, path, issues) => issues.push(...prefixed(path, checkFilter(value, limits))));
  if (kind !== "cursor") checks.set("sort", (value, path, issues) => issues.push(...prefixed(path, checkSort(value, limits))));
  for (const field of options.allow ?? []) checks.set(field, serverOwnedCheck(field));

  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;
  if (kind === "offset") {
    checks.set("page", integer(1, Number.POSITIVE_INFINITY));
    checks.set("perPage", integer(1, options.maxPerPage ?? DEFAULT_MAX_PER_PAGE));
    checks.set("withTotal", typed("boolean"));
  } else if (kind === "infinite") {
    checks.set("limit", integer(1, maxLimit));
    checks.set("offset", integer(0, limits.maxOffset, "maxOffset"));
  } else {
    checks.set("limit", integer(1, maxLimit));
    checks.set("cursor", typed("string or null"));
    checks.set("cursorKey", typed("string"));
    checks.set("order", oneOf(["asc", "desc"]));
    checks.set("direction", oneOf(["forward", "backward"]));
  }
  return checks;
}

/**
 * Checks offset, infinite or cursor params the way the `@querykitjs/zod`
 * factories do: unknown fields and closed server-owned fields are stripped,
 * `(page - 1) × perPage` stays within `maxOffset`, and a cursor request has no `sort`.
 *
 * @example
 * ```ts
 * checkParams("offset", { page: 2, perPage: 201 }).issues;
 * // [{ path: ["perPage"], key: "querykit.params.out_of_range", args: { max: 200 } }]
 * ```
 */
export function checkParams(kind: WireParamsKind, value: unknown, options: WireParamsOptions = {}): WireParamsResult {
  if (!isRecord(value)) return { issues: [wireIssue("querykit.params.invalid_type", [], { expected: "object" })] };

  const limits = resolveLimits(options.limits);
  const checks = fieldChecks(kind, options, limits);
  const issues: WireIssue[] = [];
  const accepted: UnknownRecord = {};
  for (const [name, field] of Object.entries(value)) {
    const check = checks.get(name);
    if (!check || field === undefined) continue;
    const before = issues.length;
    check(field, [name], issues);
    if (issues.length === before) accepted[name] = field;
  }

  if (kind === "offset" && issues.length === 0) {
    const page = typeof accepted.page === "number" ? accepted.page : undefined;
    const perPage = typeof accepted.perPage === "number" ? accepted.perPage : undefined;
    if (offsetOf(page, perPage) > limits.maxOffset) issues.push(wireIssue("querykit.limit.exceeded", ["page"], { limit: "maxOffset", max: limits.maxOffset }));
  }
  return issues.length ? { issues } : { value: accepted, issues };
}
