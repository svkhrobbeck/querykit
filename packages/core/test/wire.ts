/**
 * The shared wire table (`conformance/cases-wire.ts`) on the core checks:
 * `checkFilter` / `checkSort` / `checkParams` must return exactly each row's
 * `{ path, key }` list, and `checkParams` the row's cleaned value. Plus the
 * hostile payloads: the limit key comes first and the check stays fast.
 * Imported by `internal.ts`; sets `process.exitCode` on failure.
 */
import { DEFAULT_MAX_PER_PAGE } from "../src/defaults";
import {
  QUERYKIT_MESSAGES_EN,
  QUERYKIT_PARAMS_MESSAGES_EN,
  checkFilter,
  checkParams,
  checkSort,
  formatMessage,
  interpolate,
  type WireIssue,
  type WireIssueKey,
} from "../src/internal";
import { HOSTILE_DEPTH, notChain } from "./conformance/cases-limits";
import { WIRE_FILTER_CASES, WIRE_PARAMS_CASES, WIRE_SORT_CASES, type WireExpectedIssue } from "./conformance/cases-wire";

/** The hostile payloads must be refused well inside one request budget. */
const HOSTILE_BUDGET_MS = 50;

let passed = 0;
const problems: string[] = [];

const shape = (issues: readonly (WireIssue | WireExpectedIssue)[]): string => JSON.stringify(issues.map(({ path, key }) => ({ path, key })));

const expectIssues = (name: string, got: readonly WireIssue[], want: readonly WireExpectedIssue[]): void => {
  if (shape(got) === shape(want)) passed++;
  else problems.push(`${name}: got ${shape(got)}, want ${shape(want)}`);
};

for (const testCase of WIRE_FILTER_CASES) {
  expectIssues(testCase.name, checkFilter(testCase.value, { ...testCase.options, ...testCase.limits }), testCase.expect);
}
for (const testCase of WIRE_SORT_CASES) {
  expectIssues(testCase.name, checkSort(testCase.value, { allowedKeys: testCase.allowedKeys, ...testCase.limits }), testCase.expect);
}
for (const testCase of WIRE_PARAMS_CASES) {
  const result = checkParams(testCase.params, testCase.value, testCase.options);
  expectIssues(testCase.name, result.issues, testCase.expect);
  if (testCase.cleaned && JSON.stringify(result.value) !== JSON.stringify(testCase.cleaned)) {
    problems.push(`${testCase.name}: cleaned ${JSON.stringify(result.value)}, want ${JSON.stringify(testCase.cleaned)}`);
  }
  if (testCase.expect.length > 0 && result.value !== undefined) problems.push(`${testCase.name}: a rejected payload has no value`);
}

/* The issue args the docs promise. */
const perPageIssue = checkParams("offset", { page: 2, perPage: 201 }).issues[0];
if (JSON.stringify(perPageIssue) === JSON.stringify({ path: ["perPage"], key: "querykit.params.out_of_range", args: { max: DEFAULT_MAX_PER_PAGE } })) passed++;
else problems.push(`perPage 201 issue: ${JSON.stringify(perPageIssue)}`);

/* Hostile payloads: the size walk answers before any shape check, without recursion. */
const hostile: [string, unknown][] = [
  ["depth 6 (and)", { and: [{ and: [{ and: [{ and: [{ and: [{ key: "a" }] }] }] }] }] }],
  [`${HOSTILE_DEPTH}-level not chain`, notChain(HOSTILE_DEPTH)],
  ["10 000 conditions", Array.from({ length: 10_000 }, () => ({ key: "a", operation: "~", value: {} }))],
];
for (const [name, value] of hostile) {
  const started = performance.now();
  const issues = checkFilter(value, {});
  const elapsed = performance.now() - started;
  const first = issues[0]?.key;
  if (issues.length === 1 && (first === "querykit.filter.max_depth" || first === "querykit.limit.exceeded") && elapsed < HOSTILE_BUDGET_MS) passed++;
  else problems.push(`hostile ${name}: ${issues.length} issue(s), first ${first}, ${elapsed.toFixed(1)} ms`);
}

/* Every wire issue key has an English message, and the catalogs hold nothing else. */
type Expect<T extends true> = T;
type CatalogKey = keyof typeof QUERYKIT_MESSAGES_EN | keyof typeof QUERYKIT_PARAMS_MESSAGES_EN;
export type CatalogCoversWireKeys = Expect<[WireIssueKey] extends [CatalogKey] ? ([CatalogKey] extends [WireIssueKey] ? true : false) : false>;

const message = formatMessage("querykit.limit.exceeded", { path: "filter", limit: "maxConditions", max: 30 });
if (message === "filter exceeds maxConditions (30)") passed++;
else problems.push(`formatMessage: ${message}`);
const kept = interpolate("{path} must be {expected}", { path: "page" });
if (kept === "page must be {expected}") passed++;
else problems.push(`interpolate keeps a missing placeholder: ${kept}`);

for (const problem of problems) console.log(`❌ [core wire] ${problem}`);
console.log(`${problems.length ? "❌" : "✅"} [core wire] ${passed} passed, ${problems.length} failed`);
if (problems.length) process.exitCode = 1;
