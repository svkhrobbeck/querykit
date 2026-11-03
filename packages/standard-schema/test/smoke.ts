/**
 * @querykitjs/standard-schema smoke: the shared wire table (`cases-wire.ts`)
 * through the `~standard.validate` of every schema — the same verdict, paths
 * and keys as the core checks, the same cleaned value — plus English messages,
 * the hostile payloads and the Hono interop. Sets `process.exitCode` on failure.
 */
import { HOSTILE_DEPTH, notChain } from "../../core/test/conformance/cases-limits";
import { WIRE_FILTER_CASES, WIRE_PARAMS_CASES, WIRE_SORT_CASES, type WireExpectedIssue, type WireParamsCase } from "../../core/test/conformance/cases-wire";
import {
  filterSchema,
  makeCursorParamsSchema,
  makeFilterSchema,
  makeInfiniteParamsSchema,
  makeOffsetParamsSchema,
  sortSchema,
  type QueryKitIssue,
  type StandardSchemaResult,
} from "../src/index";
import "./hono";

let passed = 0;
const problems: string[] = [];

function check(label: string, ok: boolean, extra = ""): void {
  if (ok) passed++;
  else problems.push(`${label}${extra ? ` — ${extra}` : ""}`);
}

/** `validate` must be synchronous; a promise here is a failure of its own. */
function run<T>(result: StandardSchemaResult<T> | Promise<StandardSchemaResult<T>>): StandardSchemaResult<T> {
  if (result instanceof Promise) throw new Error("validate returned a promise");
  return result;
}

const shape = (issues: readonly { path?: unknown; key: string }[]): string => JSON.stringify(issues.map(({ path, key }) => ({ path, key })));
const issuesOf = (result: StandardSchemaResult<unknown>): QueryKitIssue[] => (result.issues ?? []) as QueryKitIssue[];

const expectRow = (name: string, result: StandardSchemaResult<unknown>, expect: readonly WireExpectedIssue[], cleaned?: unknown): void => {
  check(`${name}: issues`, shape(issuesOf(result)) === shape(expect), `got ${shape(issuesOf(result))}`);
  if (cleaned !== undefined) check(`${name}: value`, JSON.stringify(result.issues ? undefined : result.value) === JSON.stringify(cleaned));
};

/* The wire table: a row whose value is undefined is skipped for the standalone filter/sort schemas, which require a value. */
for (const row of WIRE_FILTER_CASES) {
  if (row.value === undefined) continue;
  expectRow(row.name, run(makeFilterSchema({ ...row.options, limits: row.limits })["~standard"].validate(row.value)), row.expect);
}
/* `sortSchema` has no options: rows with an allow-list or other limits are left to the params schemas. */
for (const row of WIRE_SORT_CASES) {
  if (row.value === undefined || row.allowedKeys || row.limits) continue;
  expectRow(row.name, run(sortSchema["~standard"].validate(row.value)), row.expect);
}

const paramsSchema = ({ params, options = {} }: WireParamsCase) =>
  params === "offset" ? makeOffsetParamsSchema(options) : params === "infinite" ? makeInfiniteParamsSchema(options) : makeCursorParamsSchema(options);

for (const row of WIRE_PARAMS_CASES) expectRow(row.name, run(paramsSchema(row)["~standard"].validate(row.value)), row.expect, row.cleaned);

/* Acceptance 1–2 and the schema's identity. */
const offset = makeOffsetParamsSchema();
check("vendor is querykit, version 1", offset["~standard"].vendor === "querykit" && offset["~standard"].version === 1);
const stripped = run(offset["~standard"].validate({ page: 2, perPage: 20, withDeleted: true }));
check("withDeleted stripped", JSON.stringify(stripped) === JSON.stringify({ value: { page: 2, perPage: 20 } }), JSON.stringify(stripped));
const tooBig = issuesOf(run(offset["~standard"].validate({ perPage: 201 })))[0];
check(
  "perPage 201 → out_of_range, English message",
  JSON.stringify(tooBig?.path) === '["perPage"]' && tooBig?.key === "querykit.params.out_of_range" && tooBig.message === "perPage is out of the allowed range",
  JSON.stringify(tooBig),
);
const nested = issuesOf(run(offset["~standard"].validate({ filter: { and: [{ key: "a", operation: "~" }] } })))[0];
check("nested filter message names the path", nested?.message === "filter.and[0].operation: `~` is not a supported filter operator", nested?.message);
const rootFilter = issuesOf(run(filterSchema["~standard"].validate("x")))[0];
check("filterSchema root message", rootFilter?.message === "filter must be a filter condition or an and/or/not group", rootFilter?.message);
const rootSort = issuesOf(run(sortSchema["~standard"].validate({})))[0];
check("sortSchema root message", rootSort?.message === "sort must be an array of { key, direction } items", rootSort?.message);
check("filterSchema requires a value", issuesOf(run(filterSchema["~standard"].validate(undefined))).length === 1);
check("params must be an object", issuesOf(run(offset["~standard"].validate(undefined)))[0]?.message === "params must be an object");

/* Hostile payloads (T1): the limit issue alone, fast. */
for (const [name, value] of [
  ["10 000-level not chain", { filter: notChain(HOSTILE_DEPTH) }],
  ["10 000 conditions", { filter: Array.from({ length: 10_000 }, () => ({ key: "a", operation: "~", value: {} })) }],
] as const) {
  const started = performance.now();
  const issues = issuesOf(run(offset["~standard"].validate(value)));
  const elapsed = performance.now() - started;
  check(
    `hostile ${name}`,
    issues.length === 1 && /max_depth|limit\.exceeded/.test(issues[0]?.key ?? "") && elapsed < 50,
    `${issues.length}, ${elapsed.toFixed(1)} ms`,
  );
}

for (const problem of problems) console.log(`❌ [standard-schema] ${problem}`);
console.log(`${problems.length ? "❌" : "🎉"} [standard-schema] ${passed} passed, ${problems.length} failed`);
if (problems.length) process.exitCode = 1;
