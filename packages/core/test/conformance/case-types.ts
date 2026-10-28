/**
 * Types and small builders of the conformance table (`cases.ts` assembles the
 * cases). Expectations are written against `fixtures.ts`.
 */
import type { QueryLimits } from "../../src/defaults";
import type { Filterable, SkipReason, SkipSite, WireBaseParams, WireCursorParams, WireInfiniteParams, WireOffsetParams } from "../../src/types";

export type AdapterName = "drizzle-pg" | "prisma-pg" | "mongoose";

export type CaseGroup = "operator" | "group" | "sort" | "pagination" | "diagnostics" | "projection" | "policy";

/** Repository request policy (task 009). `"default"` — none given, the adapter's safe default applies. */
export type CasePolicy = "default" | { filterable?: Filterable; sortable?: readonly string[]; limits?: Partial<QueryLimits> };

export type Call =
  | { method: "findAll"; params: WireBaseParams }
  | { method: "findList"; params: WireOffsetParams }
  | { method: "findInfinite"; params: WireInfiniteParams }
  | { method: "findCursor"; params: WireCursorParams; followNext?: boolean };

export interface CaseOptions {
  strict?: boolean;
  forcedColumns?: Record<string, true>;
  allowedColumns?: readonly string[];
  /** Absent ⇒ the open 3.x policy (every field and operator, every sort field), so the older cases keep their meaning. */
  policy?: CasePolicy;
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

/** Every fixture name, and the same in `createdAt` order. */
export const ALL = ["Alice", "Bob", "Carol", "dave", "Eve_Ann", "Frank", "Alina"] as const;
export const BY_CREATED = ["Alice", "Bob", "Carol", "dave", "Eve_Ann", "Frank", "Alina"] as const;
export const byCreated = [{ key: "createdAt", direction: "asc" as const }];

/** A `findAll` with a filter and the rows it selects. */
export const where = (
  filter: WireBaseParams["filter"],
  names: readonly string[],
  extra: Partial<ConformanceCase> = {},
): Omit<ConformanceCase, "name" | "group"> => ({
  call: { method: "findAll", params: { filter } },
  expect: { names },
  ...extra,
});

/** One operator case: `key operation value` selects `names`. */
export const op = (
  name: string,
  key: string,
  operation: string,
  value: unknown,
  names: readonly string[],
  extra: Partial<ConformanceCase> = {},
): ConformanceCase => ({
  name,
  group: "operator",
  ...where([value === undefined ? { key, operation } : { key, operation, value }] as WireBaseParams["filter"], names, extra),
});
