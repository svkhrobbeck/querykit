/**
 * The shared wire table (`cases-wire.ts`) on the zod factories: zod has its own
 * issue codes, so only the verdict is compared — a row is accepted exactly when
 * the core checks find no issue — plus, for accepted params rows, the same
 * cleaned fields. Rows with class-validator-only options (`allowedKeys`,
 * `allowedOperators`, `strictValue`) are skipped. Imported by `smoke.ts`; sets
 * `process.exitCode` on failure.
 */
import { WIRE_FILTER_CASES, WIRE_PARAMS_CASES, WIRE_SORT_CASES, type WireParamsCase } from "../../core/test/conformance/cases-wire";
import { makeCursorParamsSchema, makeInfiniteParamsSchema, makeOffsetParamsSchema } from "../src/index";

let passed = 0;
const problems: string[] = [];

const verdict = (name: string, accepted: boolean, expectAccepted: boolean): void => {
  if (accepted === expectAccepted) passed++;
  else problems.push(`${name}: zod ${accepted ? "accepted" : "rejected"}, core ${expectAccepted ? "accepts" : "rejects"}`);
};

/** Key-sorted JSON, so zod's field order does not matter. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b))) : inner,
  );

for (const testCase of WIRE_FILTER_CASES) {
  if (testCase.options) continue;
  verdict(testCase.name, makeOffsetParamsSchema({ limits: testCase.limits }).safeParse({ filter: testCase.value }).success, testCase.expect.length === 0);
}
for (const testCase of WIRE_SORT_CASES) {
  if (testCase.allowedKeys) continue;
  verdict(testCase.name, makeOffsetParamsSchema({ limits: testCase.limits }).safeParse({ sort: testCase.value }).success, testCase.expect.length === 0);
}

const paramsSchema = ({ params, options = {} }: WireParamsCase) => {
  if (params === "offset") return makeOffsetParamsSchema(options);
  if (params === "infinite") return makeInfiniteParamsSchema(options);
  return makeCursorParamsSchema(options);
};

for (const testCase of WIRE_PARAMS_CASES) {
  const result = paramsSchema(testCase).safeParse(testCase.value);
  verdict(testCase.name, result.success, testCase.expect.length === 0);
  if (result.success && testCase.cleaned && canonical(result.data) !== canonical(testCase.cleaned)) {
    problems.push(`${testCase.name}: zod kept ${canonical(result.data)}, core keeps ${canonical(testCase.cleaned)}`);
  }
}

for (const problem of problems) console.log(`❌ [zod wire] ${problem}`);
console.log(`${problems.length ? "❌" : "✅"} [zod wire] ${passed} passed, ${problems.length} failed`);
if (problems.length) process.exitCode = 1;
