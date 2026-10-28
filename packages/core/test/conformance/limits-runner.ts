/**
 * Runs the request-limit table (`cases-limits.ts`) against one package's judge.
 * A judge answers "accepted?" for one case. `pending` marks a package whose
 * limits are not built yet: mismatches are printed as `⏳ todo` and do not fail.
 */
import { LIMIT_CASES, type LimitCase } from "./cases-limits";

export type LimitJudge = (testCase: LimitCase) => boolean;

export interface LimitRunResult {
  passed: number;
  failed: number;
  todo: number;
}

export function runLimitCases(label: string, judge: LimitJudge, options: { pending?: boolean; cases?: readonly LimitCase[] } = {}): LimitRunResult {
  const result: LimitRunResult = { passed: 0, failed: 0, todo: 0 };
  for (const testCase of options.cases ?? LIMIT_CASES) {
    const accepted = judge(testCase);
    const ok = accepted === (testCase.verdict === "ok");
    const name = `[${label}] ${testCase.name}`;
    if (ok) {
      result.passed++;
      console.log(`✅ ${name}`);
    } else if (options.pending) {
      result.todo++;
      console.log(`⏳ todo ${name} — ${accepted ? "accepted" : "rejected"}, expected ${testCase.verdict}`);
    } else {
      result.failed++;
      console.log(`❌ ${name} — ${accepted ? "accepted" : "rejected"}, expected ${testCase.verdict}`);
    }
  }
  return result;
}
