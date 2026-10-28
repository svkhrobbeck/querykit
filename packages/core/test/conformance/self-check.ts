/**
 * Checks the conformance table itself, before any adapter runs:
 *
 * 1. every row expectation matches the reference evaluator (`reference.ts`);
 * 2. coverage — every operator, `and`/`or`/`not`, one- and two-field sort, the
 *    three pagination modes, strict errors, skip reports and the projection guard.
 *
 *   bun run packages/core/test/conformance/self-check.ts
 */
import { FILTER_OPERATORS } from "../../src/operators";
import type { Filter, FilterNode, SortItem } from "../../src/types";

import { CASES, type ConformanceCase } from "./cases";
import { ROWS } from "./fixtures";
import { referenceFilter, referenceSort } from "./reference";

type Row = (typeof ROWS)[number];

const problems: string[] = [];

/** Reference rows for a case, or undefined when the reference cannot judge it (errors, dropped conditions). */
function referenceNames(testCase: ConformanceCase): string[] | undefined {
  const { call, expect } = testCase;
  if (expect.error || (expect.skipped?.length ?? 0) > 0) return undefined;
  const filtered = referenceFilter<Row>(ROWS, call.params.filter);
  const names = (rows: Row[]) => rows.map(row => row.name);
  switch (call.method) {
    case "findAll":
      return names(referenceSort(filtered, call.params.sort));
    case "findList": {
      const perPage = Math.min(call.params.perPage ?? 20, 200);
      const start = ((call.params.page ?? 1) - 1) * perPage;
      return names(referenceSort(filtered, call.params.sort).slice(start, start + perPage));
    }
    case "findInfinite": {
      const offset = call.params.offset ?? 0;
      return names(referenceSort(filtered, call.params.sort).slice(offset, offset + (call.params.limit ?? 20)));
    }
    case "findCursor": {
      const limit = call.params.limit ?? 20;
      const ordered = referenceSort(filtered, [{ key: call.params.cursorKey ?? "id", direction: call.params.order ?? "asc" }]);
      const start = call.followNext ? limit : 0;
      return names(ordered.slice(start, start + limit));
    }
  }
}

for (const testCase of CASES) {
  const reference = referenceNames(testCase);
  if (!reference || !testCase.expect.names) continue;
  const got = testCase.expect.ordered ? [...testCase.expect.names] : [...testCase.expect.names].sort();
  const want = testCase.expect.ordered ? reference : [...reference].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`"${testCase.name}": expect ${JSON.stringify(got)}, reference ${JSON.stringify(want)}`);
}

/* ------------------------------- coverage -------------------------------- */

const operators = new Set<string>();
const groups = new Set<string>();
function walk(node: FilterNode | undefined): void {
  if (!node) return;
  if ("and" in node) return (groups.add("and"), node.and.forEach(walk));
  if ("or" in node) return (groups.add("or"), node.or.forEach(walk));
  if ("not" in node) return (groups.add("not"), walk(node.not));
  operators.add(node.operation ?? "=");
}
const walkFilter = (filter: Filter | undefined) => (Array.isArray(filter) ? filter.forEach(walk) : walk(filter));

const sortSizes = new Set<number>();
const methods = new Set<string>();
for (const { call } of CASES) {
  walkFilter(call.params.filter);
  methods.add(call.method);
  const sort = (call.params as { sort?: SortItem[] }).sort;
  if (sort) sortSizes.add(sort.length);
}

const require = (ok: boolean, what: string) => ok || problems.push(`coverage: ${what}`);
for (const operation of FILTER_OPERATORS) require(operators.has(operation), `operator "${operation}" has no case`);
for (const group of ["and", "or", "not"]) require(groups.has(group), `no "${group}" group`);
require(sortSizes.has(1) && sortSizes.has(2), "sort by one and by two fields");
for (const method of ["findList", "findInfinite", "findCursor"]) require(methods.has(method), `no ${method} case`);
require(CASES.some(c => c.options?.strict && c.expect.error?.reason === "unknown-key"), "strict → QueryKitError unknown-key");
require(CASES.some(c => (c.expect.skipped?.length ?? 0) > 0), "onSkippedCondition is called");
require(CASES.some(c => c.options?.forcedColumns && c.expect.keys && !c.expect.keys.includes("email")), "forcedColumns hides a column");

if (problems.length > 0) {
  for (const problem of problems) console.log(`❌ ${problem}`);
  process.exitCode = 1;
}
console.log(`conformance table: ${CASES.length} cases, ${operators.size}/${FILTER_OPERATORS.length} operators, ${problems.length} problems`);
