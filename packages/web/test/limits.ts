/**
 * Request limits for @querykitjs/web: the list and infinite builders
 * refuse a payload past the offset limit or the sort-field limit (an `Error`,
 * never a silent clamp). Filter limits stay with the server (REQUIREMENTS R18):
 * the builders pass every filter case through.
 * Imported by `smoke.ts`; sets `process.exitCode` on failure.
 */
import { LIMIT_CASES, type LimitCase } from "../../core/test/conformance/cases-limits";
import { runLimitCases } from "../../core/test/conformance/limits-runner";
import { buildInfiniteParams, buildListParams, createQuery, type QueryConfig } from "../src/index";

/** The limits are built: a mismatch fails. */
const PENDING = false;

const configOf = (limits: LimitCase["limits"]): QueryConfig => ({ ...limits });

const builds = (build: () => unknown): boolean => {
  try {
    build();
    return true;
  } catch {
    return false;
  }
};

const builderJudge = (testCase: LimitCase): boolean => {
  const params = testCase.params as Record<string, never>;
  if (testCase.limits) {
    const query = createQuery(configOf(testCase.limits));
    return builds(() => (testCase.kind === "infinite" ? query.infinite(params) : query.list(params)));
  }
  return builds(() => (testCase.kind === "infinite" ? buildInfiniteParams(params) : buildListParams(params)));
};

const results = [runLimitCases("web builders", builderJudge, { pending: PENDING, cases: LIMIT_CASES.filter(c => c.kind !== "filter") })];

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

/* R18: no filter limit on the client — every filter case builds, inside or outside the limit. */
for (const testCase of LIMIT_CASES.filter(c => c.kind === "filter")) {
  const ok = builds(() => buildListParams(testCase.params as never));
  if (ok) passed++;
  else {
    failed++;
    console.log(`❌ [web] filter limits are the server's: "${testCase.name}" must build`);
  }
}

/* Acceptance 8, verbatim. */
let message = "";
try {
  buildListParams({ page: 502, perPage: 20 });
} catch (error) {
  message = error instanceof Error ? error.message : String(error);
}
check("buildListParams({ page: 502, perPage: 20 }) → Error naming `maxOffset (10000)`", message.includes("maxOffset (10000)"), message || "built");
check(
  "buildListParams({ page: 501, perPage: 20 }) → payload",
  builds(() => buildListParams({ page: 501, perPage: 20 })),
);

console.log(`limits: ${passed} passed, ${failed} failed, ${todo} todo`);
if (failed > 0) process.exitCode = 1;
