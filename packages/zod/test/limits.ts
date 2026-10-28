/**
 * Request limits (task 008) for @querykitjs/zod: the shared limit table on the
 * factories and on the legacy constant schemas, the hostile-depth payload and
 * the error text. Imported by `smoke.ts`; sets `process.exitCode` on failure.
 */
import { HOSTILE_DEPTH, LIMIT_CASES, type LimitCase } from "../../core/test/conformance/cases-limits";
import { runLimitCases } from "../../core/test/conformance/limits-runner";
import {
  infiniteParamsSchema,
  makeCursorParamsSchema,
  makeInfiniteParamsSchema,
  makeOffsetParamsSchema,
  offsetParamsSchema,
  type ParamsSchemaOptions,
} from "../src/index";

/** The limits are built: a mismatch fails. */
const PENDING = false;

const withLimits = (limits: LimitCase["limits"]): ParamsSchemaOptions => ({ limits });

const factoryJudge = (testCase: LimitCase): boolean => {
  const options = withLimits(testCase.limits);
  const schema = testCase.kind === "infinite" ? makeInfiniteParamsSchema(options) : makeOffsetParamsSchema(options);
  return schema.safeParse(testCase.params).success;
};

const legacyJudge = (testCase: LimitCase): boolean =>
  (testCase.kind === "infinite" ? infiniteParamsSchema : offsetParamsSchema).safeParse(testCase.params).success;

const cursorJudge = (testCase: LimitCase): boolean => makeCursorParamsSchema(withLimits(testCase.limits)).safeParse({ filter: testCase.params.filter }).success;

const results = [
  runLimitCases("zod factory", factoryJudge, { pending: PENDING }),
  runLimitCases("zod legacy", legacyJudge, { pending: PENDING, cases: LIMIT_CASES.filter(c => !c.limits) }),
  runLimitCases("zod cursor factory (filter)", cursorJudge, {
    pending: PENDING,
    cases: LIMIT_CASES.filter(c => c.kind === "filter"),
  }),
];

let passed = results.reduce((sum, r) => sum + r.passed, 0);
let failed = results.reduce((sum, r) => sum + r.failed, 0);
let todo = results.reduce((sum, r) => sum + r.todo, 0);

function check(label: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`✅ ${label}`);
  } else if (PENDING) {
    todo++;
    console.log(`⏳ todo ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`❌ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

/* T-1: `{"not":{"not":…}}` 10 000 levels deep — an error, no stack overflow, fast. */
const hostileJson = `${'{"not":'.repeat(HOSTILE_DEPTH - 1)}{"key":"name","value":"a"}${"}".repeat(HOSTILE_DEPTH - 1)}`;
const hostile = { filter: JSON.parse(hostileJson) as unknown };
for (const [label, schema] of [
  ["factory", makeOffsetParamsSchema()],
  ["legacy", offsetParamsSchema],
] as const) {
  const started = performance.now();
  let outcome: string;
  try {
    outcome = schema.safeParse(hostile).success ? "accepted" : "rejected";
  } catch (error) {
    outcome = error instanceof RangeError ? "RangeError" : `threw ${String(error)}`;
  }
  const elapsed = performance.now() - started;
  check(`hostile depth ${HOSTILE_DEPTH} (${label}, ${hostileJson.length} bytes) → rejected`, outcome === "rejected", outcome);
  check(`hostile depth ${HOSTILE_DEPTH} (${label}) < 50 ms`, elapsed < 50, `${elapsed.toFixed(1)} ms`);
}

/* Acceptance 7: the error names the limit and its value. */
const tooMany = makeOffsetParamsSchema().safeParse({ filter: [{ key: "id", operation: "in", value: Array.from({ length: 201 }, (_, i) => i) }] });
const message = tooMany.success ? "" : tooMany.error.issues.map(issue => issue.message).join(" | ");
check("error text names `maxInItems (200)`", message.includes("maxInItems (200)"), message || "accepted");

console.log(`limits: ${passed} passed, ${failed} failed, ${todo} todo`);
if (failed > 0) process.exitCode = 1;
