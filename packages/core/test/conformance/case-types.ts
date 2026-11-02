/**
 * Types and small builders of the conformance table (`cases.ts` assembles the
 * cases). Expectations are written against `fixtures.ts`.
 */
import type { QueryLimits } from "../../src/defaults";
import type { Filterable, SkipReason, SkipSite, WireBaseParams, WireCursorParams, WireInfiniteParams, WireOffsetParams } from "../../src/types";

export type AdapterName = "drizzle-pg" | "prisma-pg" | "mongoose" | "mongodb";

export type CaseGroup = "operator" | "group" | "sort" | "pagination" | "diagnostics" | "projection" | "policy" | "mutation" | "scope";

/** Repository request policy (task 009). `"default"` — none given, the adapter's safe default applies. */
export type CasePolicy = "default" | { filterable?: Filterable; sortable?: readonly string[]; limits?: Partial<QueryLimits> };

export type Call =
  | { method: "findAll"; params: WireBaseParams }
  | { method: "findList"; params: WireOffsetParams }
  | { method: "findInfinite"; params: WireInfiniteParams }
  | { method: "findCursor"; params: WireCursorParams; followNext?: boolean; walk?: "forward" | "forward-back" }
  | { method: "updateWhere"; params: { filter?: unknown; patch: Record<string, unknown>; options?: unknown } }
  | { method: "deleteWhere"; params: { filter?: unknown; options?: unknown } };

export interface CaseOptions {
  strict?: boolean;
  forcedColumns?: Record<string, true>;
  allowedColumns?: readonly string[];
  /** Rows for this case instead of the shared `ROWS` (task 012: 25 rows with one `createdAt`). */
  rows?: readonly import("./fixtures").ConformanceRow[];
  /** Absent ⇒ the open 3.x policy (every field and operator, every sort field), so the older cases keep their meaning. */
  policy?: CasePolicy;
  /** Registry `cursorSecret` (task 012): tokens are signed and an unsigned one is refused. */
  cursorSecret?: string;
  /** Repository `scope` (RBAC / tenancy filter, task 013). */
  scope?: Record<string, unknown>;
  /** Registry `timestamps` (task 014): the createdAt / deletedAt field names. */
  timestamps?: { createdAt?: string; deletedAt?: string };
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
  /** `walk` cases: the number of distinct ids collected over all pages, and the page sizes. */
  walk?: { ids: number; pages: readonly number[] };
  /** Every returned row has exactly these keys. */
  keys?: readonly string[];
  meta?: Record<string, unknown>;
  /** Conditions reported through `onSkippedCondition` (default: none). */
  skipped?: readonly SkipExpectation[];
  /** The call throws a `QueryKitError` with this info. */
  error?: SkipExpectation;
  /** Names of the rows left after the call (a set) — also checked when the call throws. */
  remaining?: readonly string[];
  /** Number of rows the call returned (`returning: { limit }` mutations). */
  returned?: number;
  /** Driver calls as `driverCalls` records them (a multiset) — also checked when the call throws. */
  calls?: readonly string[];
}

export interface ConformanceCase {
  name: string;
  group: CaseGroup;
  call: Call;
  options?: CaseOptions;
  expect: Expectation;
  knownDifference?: Partial<Record<AdapterName, string>>;
  /**
   * A driver-specific result documented in that adapter's README (R11) — used instead of
   * `expect` for that adapter. Not a gap: it does not count as a known difference.
   */
  expectFor?: Partial<Record<AdapterName, Expectation>>;
  /** A payload the `@querykitjs/web` builders never produce (they normalize it away), so the web runner skips it. */
  notBuiltByWeb?: string;
}

/** A v2 cursor token for an expectation (task 012) — the runner compares tokens by their cursor value `k` only. */
export const cursorToken = (value: unknown): string => Buffer.from(JSON.stringify({ v: 2, k: value, id: null }), "utf8").toString("base64url");

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
