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
import type { ConformanceCase } from "./case-types";
import { GROUP_CASES, OPERATOR_CASES } from "./cases-filter";
import { DIAGNOSTIC_CASES, PAGINATION_CASES, PROJECTION_CASES, SORT_CASES } from "./cases-query";
import { POLICY_CASES } from "./cases-policy";

export * from "./case-types";

export const CASES: readonly ConformanceCase[] = [
  ...OPERATOR_CASES,
  ...GROUP_CASES,
  ...SORT_CASES,
  ...PAGINATION_CASES,
  ...DIAGNOSTIC_CASES,
  ...PROJECTION_CASES,
  ...POLICY_CASES,
];
