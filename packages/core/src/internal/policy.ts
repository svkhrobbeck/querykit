/**
 * The server-side request policy every adapter applies (task 009): which fields
 * a client may filter by and with which operators (`filterable`), which it may
 * sort and page by (`sortable`), and the request limits (`limits`, task 008).
 *
 * A refused request never reaches the driver and is never dropped silently:
 * every check throws `QueryKitError`, whatever `strict` / `onSkippedCondition`
 * say. A key the model does not have is **not** the policy's business — it goes
 * on to the adapter's own `unknown-key` handling, unchanged.
 */
import { resolveLimits, type QueryLimits } from "../defaults";
import { QueryKitError } from "../errors";
import type { Filterable, SkipReason, SkipSite } from "../types";
import { findFilterLimitViolation, offsetOf } from "./limits";

export interface PolicyOptions {
  /** Table / model name for the error. */
  source: string;
  /** Wire key → the model's canonical field name, or `undefined` when the model has no such field. */
  fieldOf: (key: string) => string | undefined;
  /** Canonical primary-key field — the last-resort safe default. */
  primaryKey: string;
  /** Canonical `createdAt` field when the model has one (default `sortable`). */
  createdAt?: string;
  filterable?: Filterable;
  sortable?: readonly string[];
  allowedColumns?: readonly string[];
  forcedColumns?: Readonly<Record<string, unknown>>;
  limits?: Partial<QueryLimits>;
}

export interface Policy {
  readonly limits: QueryLimits;
  /** Limits, then every condition's field and operator. */
  checkFilter(filter: unknown): void;
  /** Field count, then every sort field. */
  checkSort(sort: readonly { key?: unknown }[] | undefined): void;
  checkCursorKey(key: string): void;
  /** Offset pagination: the clamped `page` × `perPage`. Infinite: the clamped `offset`. */
  checkPage(page: { page: number; perPage: number } | { offset: number }): void;
  /** A `groupBy` / `sum` / `avg` / `min` / `max` field must be filterable. */
  checkAggregateKey(key: string): void;
}

/** The safe default when `filterable` is not given: equality only. */
const DEFAULT_OPERATORS = ["=", "in"] as const;

/** Alias → the token it means, so `["="]` also admits `eq` and `["contains"]` admits `%_%`. */
const OPERATOR_TOKEN: Readonly<Record<string, string>> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  contains: "%_%",
  startsWith: "%_",
  endsWith: "_%",
};
const tokenOf = (operation: string): string => OPERATOR_TOKEN[operation] ?? operation;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Field → admitted operator tokens, or `"*"`. */
type Rules = ReadonlyMap<string, ReadonlySet<string> | "*">;

function filterRules(options: PolicyOptions, canonical: (key: string) => string): Rules {
  const rules = new Map<string, ReadonlySet<string> | "*">();
  if (options.filterable) {
    for (const [key, operators] of Object.entries(options.filterable)) {
      if (operators) rules.set(canonical(key), operators === "*" ? "*" : new Set(operators.map(tokenOf)));
    }
    return rules;
  }
  const fields =
    options.allowedColumns ?? (options.forcedColumns ? Object.keys(options.forcedColumns).filter(key => options.forcedColumns![key]) : [options.primaryKey]);
  const equality = new Set<string>(DEFAULT_OPERATORS);
  for (const field of fields) rules.set(canonical(field), equality);
  return rules;
}

export function resolvePolicy(options: PolicyOptions): Policy {
  const limits = resolveLimits(options.limits);
  const canonical = (key: string) => options.fieldOf(key) ?? key;
  const rules = filterRules(options, canonical);
  const sortable = new Set((options.sortable ?? [options.primaryKey, ...(options.createdAt ? [options.createdAt] : [])]).map(canonical));

  const refuse = (site: SkipSite, key: string, reason: SkipReason, operation?: string): never => {
    throw new QueryKitError({ source: options.source, site, key, reason, ...(operation ? { operation: operation as never } : {}) });
  };

  const checkCondition = (node: Record<string, unknown>): void => {
    const key = String(node.key);
    const field = options.fieldOf(key);
    if (field === undefined) return; // not in the model — the adapter's unknown-key path
    const operation = typeof node.operation === "string" ? node.operation : "=";
    const rule = rules.get(field);
    if (!rule) refuse("filter", key, "forbidden-key", operation);
    if (rule !== "*" && !rule!.has(tokenOf(operation))) refuse("filter", key, "forbidden-operator", operation);
  };

  const checkSortKey = (site: SkipSite, key: string): void => {
    const field = options.fieldOf(key);
    if (field !== undefined && !sortable.has(field)) refuse(site, key, "forbidden-key");
  };

  return {
    limits,

    checkFilter(filter) {
      const violation = findFilterLimitViolation(filter, limits);
      if (violation) refuse("filter", violation.limit, "limit-exceeded");
      /* Bounded by maxDepth now, but kept iterative so `maxDepth: Infinity` cannot overflow the stack. */
      const pending: unknown[] = Array.isArray(filter) ? [...filter] : [filter];
      while (pending.length > 0) {
        const node = pending.pop();
        if (!isRecord(node)) continue;
        if ("key" in node) checkCondition(node);
        else if (Array.isArray(node.and)) pending.push(...node.and);
        else if (Array.isArray(node.or)) pending.push(...node.or);
        else if ("not" in node) pending.push(node.not);
      }
    },

    checkSort(sort) {
      if (!sort) return;
      if (sort.length > limits.maxSortFields) refuse("sort", "maxSortFields", "limit-exceeded");
      for (const item of sort) if (item && typeof item.key === "string" && item.key) checkSortKey("sort", item.key);
    },

    checkCursorKey(key) {
      checkSortKey("cursorKey", key);
    },

    checkPage(page) {
      const offset = "offset" in page ? page.offset : offsetOf(page.page, page.perPage);
      if (offset > limits.maxOffset) refuse("page", "maxOffset", "limit-exceeded");
    },

    checkAggregateKey(key) {
      const field = options.fieldOf(key);
      if (field !== undefined && !rules.has(field)) refuse("aggregate", key, "forbidden-key");
    },
  };
}
