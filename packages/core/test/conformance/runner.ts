/**
 * Runs the conformance table against one adapter harness and reports per case.
 * A harness runs a repository call against that adapter's fake driver; the
 * runner owns the comparison, so every adapter is judged the same way.
 */
import type { SkippedCondition } from "../../src/types";

import { cloneRows, driverCalls, useRows } from "./fixtures";
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

/** The rows left and the driver calls made — read after every call. */
export interface After {
  remaining: string[];
  calls: string[];
}

export type Outcome =
  | ({ kind: "ok"; result: HarnessResult; skipped: SkippedCondition[] } & Partial<After>)
  | ({ kind: "error"; info: SkippedCondition; skipped: SkippedCondition[] } & Partial<After>)
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
  useRows(options.rows);
  const after = (): After => ({ remaining: cloneRows().map(row => row.name), calls: [...driverCalls] });
  try {
    if (call.method === "findCursor" && call.walk) return { kind: "ok", result: await walk(harness, call, options, onSkipped), skipped };
    let result = await harness.run(call, options, onSkipped);
    if (call.method === "findCursor" && call.followNext) {
      const cursor = result.meta?.next_cursor as string | null | undefined;
      result = await harness.run({ method: "findCursor", params: { ...call.params, cursor } }, options, onSkipped);
    }
    return { kind: "ok", result, skipped, ...after() };
  } catch (err) {
    const info = asQueryKitError(err);
    if (info) return { kind: "error", info, skipped, ...after() };
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
export function compare(testCase: ConformanceCase, outcome: Outcome, adapter?: AdapterName): string[] {
  const expect = (adapter && testCase.expectFor?.[adapter]) ?? testCase.expect;
  if (outcome.kind === "crash") return [`crashed: ${outcome.message}`];
  const problems: string[] = [];
  if (expect.remaining) {
    const got = [...(outcome.remaining ?? [])].sort();
    if (canonical(got) !== canonical([...expect.remaining].sort()))
      problems.push(`rows left ${canonical(got)}, expected ${canonical([...expect.remaining].sort())}`);
  }
  if (expect.calls) {
    const got = [...(outcome.calls ?? [])].sort();
    if (canonical(got) !== canonical([...expect.calls].sort())) problems.push(`driver calls ${canonical(outcome.calls)}, expected ${canonical(expect.calls)}`);
  }
  if (expect.error) {
    if (outcome.kind !== "error") return [`expected QueryKitError ${skipLabel(expect.error)}, got rows`, ...problems];
    const got = skipLabel(outcome.info);
    return got === skipLabel(expect.error) ? problems : [`expected QueryKitError ${skipLabel(expect.error)}, got ${got}`, ...problems];
  }
  if (outcome.kind === "error") return [`unexpected QueryKitError ${skipLabel(outcome.info)}`];

  if (expect.returned !== undefined && outcome.result.rows.length !== expect.returned)
    problems.push(`returned ${outcome.result.rows.length} rows, expected ${expect.returned}`);
  const { rows, meta } = outcome.result;
  if (expect.names) {
    const names = rows.map(row => String(row.name));
    const got = expect.ordered ? names : [...names].sort();
    const want = expect.ordered ? [...expect.names] : [...expect.names].sort();
    if (canonical(got) !== canonical(want)) problems.push(`rows ${canonical(names)}, expected ${canonical(expect.names)}`);
  }
  if (expect.walk) {
    const ids = new Set(rows.map(row => String(row.id)));
    const pages = (meta?.pages as number[] | undefined) ?? [];
    if (ids.size !== expect.walk.ids) problems.push(`walk collected ${ids.size} distinct ids, expected ${expect.walk.ids}`);
    if (canonical(pages) !== canonical(expect.walk.pages)) problems.push(`walk pages ${canonical(pages)}, expected ${canonical(expect.walk.pages)}`);
  }
  if (expect.keys) {
    const want = canonical([...expect.keys].sort());
    const bad = rows.find(row => canonical(Object.keys(row).sort()) !== want);
    if (bad) problems.push(`row keys ${canonical(Object.keys(bad).sort())}, expected ${want}`);
  }
  if (expect.meta && canonical(tokenKeys(meta)) !== canonical(tokenKeys(expect.meta)))
    problems.push(`meta ${canonical(meta)}, expected ${canonical(expect.meta)}`);
  const gotSkipped = sortedLabels(outcome.skipped);
  const wantSkipped = sortedLabels(expect.skipped ?? []);
  if (canonical(gotSkipped) !== canonical(wantSkipped)) problems.push(`skipped ${canonical(gotSkipped)}, expected ${canonical(wantSkipped)}`);
  return problems;
}

/** Runs every case on one harness and prints a line per failure or known difference. */
export async function runConformance(harness: Harness, cases: readonly ConformanceCase[] = CASES): Promise<Summary> {
  const summary: Summary = { adapter: harness.name, passed: 0, failed: 0, known: 0 };
  for (const testCase of cases) {
    const problems = compare(testCase, await execute(harness, testCase.call, testCase.options), harness.name);
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

/**
 * Follow `next_cursor` to the end, then — for `forward-back` — follow
 * `prev_cursor` from the last page back to the first. Rows of every page are
 * collected; `meta.pages` lists the page sizes, forward then back.
 */
async function walk(
  harness: Harness,
  call: Extract<Call, { method: "findCursor" }>,
  options: CaseOptions,
  onSkipped: (info: SkippedCondition) => void,
): Promise<HarnessResult> {
  const rows: Record<string, unknown>[] = [];
  const pages: number[] = [];
  let cursor: string | null | undefined = call.params.cursor;
  let last: HarnessResult | undefined;
  for (let guard = 0; guard < 50; guard++) {
    last = await harness.run({ method: "findCursor", params: { ...call.params, cursor, direction: "forward" } }, options, onSkipped);
    rows.push(...last.rows);
    pages.push(last.rows.length);
    cursor = last.meta?.next_cursor as string | null | undefined;
    if (!cursor) break;
  }
  if (call.walk === "forward-back") {
    let back = last?.meta?.prev_cursor as string | null | undefined;
    for (let guard = 0; back && guard < 50; guard++) {
      const page = await harness.run({ method: "findCursor", params: { ...call.params, cursor: back, direction: "backward" } }, options, onSkipped);
      rows.push(...page.rows);
      pages.push(page.rows.length);
      back = page.meta?.prev_cursor as string | null | undefined;
    }
  }
  return { rows, meta: { pages } };
}

/**
 * Cursor tokens compared by their cursor value `k` only: the tie-break `id`
 * is the adapter's own primary key (a number, or a Mongo ObjectId), so it differs by design.
 */
function tokenKeys(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const k = (token: unknown) => {
    if (typeof token !== "string") return token;
    try {
      return { k: (JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { k?: unknown }).k };
    } catch {
      return token;
    }
  };
  return { ...meta, next_cursor: k(meta.next_cursor), prev_cursor: k(meta.prev_cursor) };
}
