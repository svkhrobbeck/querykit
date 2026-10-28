/**
 * Runs the conformance table against one adapter harness and reports per case.
 * A harness runs a repository call against that adapter's fake driver; the
 * runner owns the comparison, so every adapter is judged the same way.
 */
import type { SkippedCondition } from "../../src/types";

import { CASES, type AdapterName, type Call, type CaseOptions, type ConformanceCase, type SkipExpectation } from "./cases";

export interface HarnessResult {
  rows: Record<string, unknown>[];
  meta?: Record<string, unknown>;
}

export interface Harness {
  name: AdapterName;
  /** One repository call; skipped conditions go to `onSkipped` (the registry's `onSkippedCondition`). */
  run(call: Call, options: CaseOptions, onSkipped: (info: SkippedCondition) => void): Promise<HarnessResult>;
}

export type Outcome =
  | { kind: "ok"; result: HarnessResult; skipped: SkippedCondition[] }
  | { kind: "error"; info: SkippedCondition; skipped: SkippedCondition[] }
  | { kind: "crash"; message: string };

export interface Summary {
  adapter: AdapterName;
  passed: number;
  failed: number;
  known: number;
}

/**
 * Adapters import `@querykitjs/core` through the workspace link (built `dist`),
 * this file from `src` — two `QueryKitError` classes, so match on the stable code.
 */
function asQueryKitError(err: unknown): SkippedCondition | undefined {
  const candidate = err as { code?: unknown; info?: SkippedCondition } | null;
  return candidate?.code === "QUERYKIT_INVALID_CONDITION" ? candidate.info : undefined;
}

/** Runs a case's call (twice for `followNext`: the second page is read from the first page's `next_cursor`). */
export async function execute(harness: Harness, call: Call, options: CaseOptions = {}): Promise<Outcome> {
  const skipped: SkippedCondition[] = [];
  const onSkipped = (info: SkippedCondition) => skipped.push(info);
  try {
    let result = await harness.run(call, options, onSkipped);
    if (call.method === "findCursor" && call.followNext) {
      const cursor = result.meta?.next_cursor as string | null | undefined;
      result = await harness.run({ method: "findCursor", params: { ...call.params, cursor } }, options, onSkipped);
    }
    return { kind: "ok", result, skipped };
  } catch (err) {
    const info = asQueryKitError(err);
    if (info) return { kind: "error", info, skipped };
    return { kind: "crash", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Order-insensitive deep equality via a canonical JSON form. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

const skipLabel = (info: SkipExpectation) => `${info.site}:${info.key}:${info.reason}`;
const sortedLabels = (list: readonly SkipExpectation[]) => list.map(skipLabel).sort();

/** Every way the outcome differs from the case's expectation (empty = conforms). */
export function compare(testCase: ConformanceCase, outcome: Outcome): string[] {
  const { expect } = testCase;
  if (outcome.kind === "crash") return [`crashed: ${outcome.message}`];
  if (expect.error) {
    if (outcome.kind !== "error") return [`expected QueryKitError ${skipLabel(expect.error)}, got rows`];
    const got = skipLabel(outcome.info);
    return got === skipLabel(expect.error) ? [] : [`expected QueryKitError ${skipLabel(expect.error)}, got ${got}`];
  }
  if (outcome.kind === "error") return [`unexpected QueryKitError ${skipLabel(outcome.info)}`];

  const problems: string[] = [];
  const { rows, meta } = outcome.result;
  if (expect.names) {
    const names = rows.map(row => String(row.name));
    const got = expect.ordered ? names : [...names].sort();
    const want = expect.ordered ? [...expect.names] : [...expect.names].sort();
    if (canonical(got) !== canonical(want)) problems.push(`rows ${canonical(names)}, expected ${canonical(expect.names)}`);
  }
  if (expect.keys) {
    const want = canonical([...expect.keys].sort());
    const bad = rows.find(row => canonical(Object.keys(row).sort()) !== want);
    if (bad) problems.push(`row keys ${canonical(Object.keys(bad).sort())}, expected ${want}`);
  }
  if (expect.meta && canonical(meta) !== canonical(expect.meta)) problems.push(`meta ${canonical(meta)}, expected ${canonical(expect.meta)}`);
  const gotSkipped = sortedLabels(outcome.skipped);
  const wantSkipped = sortedLabels(expect.skipped ?? []);
  if (canonical(gotSkipped) !== canonical(wantSkipped)) problems.push(`skipped ${canonical(gotSkipped)}, expected ${canonical(wantSkipped)}`);
  return problems;
}

/** Runs every case on one harness and prints a line per failure or known difference. */
export async function runConformance(harness: Harness, cases: readonly ConformanceCase[] = CASES): Promise<Summary> {
  const summary: Summary = { adapter: harness.name, passed: 0, failed: 0, known: 0 };
  for (const testCase of cases) {
    const problems = compare(testCase, await execute(harness, testCase.call, testCase.options));
    const known = testCase.knownDifference?.[harness.name];
    if (problems.length === 0 && known) {
      summary.failed++;
      console.log(`❌ [${harness.name}] ${testCase.name} — marked knownDifference ("${known}") but conforms; remove the mark`);
    } else if (problems.length === 0) {
      summary.passed++;
    } else if (known) {
      summary.known++;
      console.log(`⚠️  [${harness.name}] ${testCase.name} — known difference: ${known}`);
    } else {
      summary.failed++;
      console.log(`❌ [${harness.name}] ${testCase.name} — ${problems.join("; ")}`);
    }
  }
  console.log(`${harness.name}: ${summary.passed} passed, ${summary.known} known differences, ${summary.failed} failed (${cases.length} cases)`);
  return summary;
}

/** Entry point for an adapter's `test/conformance.ts`. */
export async function runConformanceCli(harness: Harness): Promise<void> {
  const summary = await runConformance(harness);
  if (summary.failed > 0) process.exitCode = 1;
}
