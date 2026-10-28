/**
 * Request limits (task 008) for @querykitjs/class-validator: the shared limit
 * table through the pure core (`validateFilter` / `validateSort`) and through
 * the DTOs, the hostile-depth payload and the en/ru/uz messages. Imported by
 * `smoke.ts`; sets `process.exitCode` on failure.
 */
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { HOSTILE_DEPTH, LIMIT_CASES, notChain, type LimitCase } from "../../core/test/conformance/cases-limits";
import { runLimitCases } from "../../core/test/conformance/limits-runner";
import {
  InfiniteParamsDto,
  OffsetParamsDto,
  QUERYKIT_LOCALES,
  localizeIssue,
  makeInfiniteParamsDto,
  makeOffsetParamsDto,
  validateFilter,
  validateSort,
  type ParamsDtoOptions,
  type QueryFilterOptions,
  type QuerySortOptions,
} from "../src/index";

/** Limits are not built yet (phase 01): every mismatch is a todo, not a failure. */
const PENDING = true;

/* Until the limit options exist they travel untyped. */
const dtoOptions = (limits: LimitCase["limits"]): ParamsDtoOptions => ({ limits }) as object as ParamsDtoOptions;
const filterOptions = (limits: LimitCase["limits"]): QueryFilterOptions => ({ ...limits }) as object as QueryFilterOptions;
const sortOptions = (limits: LimitCase["limits"]): QuerySortOptions => ({ ...limits }) as object as QuerySortOptions;

const accepts = (cls: new () => object, payload: unknown): boolean => validateSync(plainToInstance(cls, payload) as object).length === 0;

/** The pure core judges only what it owns: filter and sort. */
const coreJudge = (testCase: LimitCase): boolean => {
  if (testCase.kind === "filter") return validateFilter(testCase.params.filter, filterOptions(testCase.limits)).length === 0;
  return validateSort(testCase.params.sort, sortOptions(testCase.limits)).length === 0;
};

const factoryJudge = (testCase: LimitCase): boolean => {
  const options = dtoOptions(testCase.limits);
  return accepts(testCase.kind === "infinite" ? makeInfiniteParamsDto(options) : makeOffsetParamsDto(options), testCase.params);
};

const staticJudge = (testCase: LimitCase): boolean => accepts(testCase.kind === "infinite" ? InfiniteParamsDto : OffsetParamsDto, testCase.params);

const results = [
  runLimitCases("class-validator core", coreJudge, { pending: PENDING, cases: LIMIT_CASES.filter(c => c.kind === "filter" || c.kind === "sort") }),
  runLimitCases("class-validator factory DTO", factoryJudge, { pending: PENDING }),
  runLimitCases("class-validator static DTO", staticJudge, { pending: PENDING, cases: LIMIT_CASES.filter(c => !c.limits) }),
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

/* T-1: the walk stops at the depth limit — 10 000 levels are rejected fast, without a stack overflow. */
const started = performance.now();
let outcome: string;
try {
  outcome = validateFilter(notChain(HOSTILE_DEPTH)).length > 0 ? "rejected" : "accepted";
} catch (error) {
  outcome = error instanceof RangeError ? "RangeError" : `threw ${String(error)}`;
}
const elapsed = performance.now() - started;
check(`hostile depth ${HOSTILE_DEPTH} → rejected`, outcome === "rejected", outcome);
check(`hostile depth ${HOSTILE_DEPTH} < 50 ms`, elapsed < 50, `${elapsed.toFixed(1)} ms`);

/* Acceptance 7: every message names the limit and its value, in all three catalogs. */
const inIssue = validateFilter([{ key: "id", operation: "in", value: Array.from({ length: 201 }, (_, i) => i) }])[0];
for (const [locale, catalog] of Object.entries(QUERYKIT_LOCALES)) {
  const text = inIssue ? localizeIssue(inIssue, catalog) : "";
  check(`${locale}: maxInItems message names \`maxInItems (200)\``, text.includes("maxInItems (200)"), text || "no issue");
}
const depthIssue = validateFilter(notChain(6))[0];
check("en: maxDepth message names `maxDepth (5)`", depthIssue?.message.includes("maxDepth (5)") ?? false, depthIssue?.message ?? "no issue");

console.log(`limits: ${passed} passed, ${failed} failed, ${todo} todo`);
if (failed > 0) process.exitCode = 1;
