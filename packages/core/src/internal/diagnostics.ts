/**
 * Skip diagnostics shared by every adapter: a condition the adapter cannot apply
 * (unknown key, uncastable value) is reported through `onSkippedCondition`, or —
 * under `strict` — thrown as a `QueryKitError`, so all adapters fail the same way.
 */
import { QueryKitError } from "../errors";
import type { SkippedCondition } from "../types";

export interface Diagnostics {
  /** Table (drizzle), model (prisma, mongoose) — reported as `source`. */
  source: string;
  strict: boolean;
  onSkipped?: (info: SkippedCondition) => void;
}

export function reportSkip(diag: Diagnostics | undefined, info: Omit<SkippedCondition, "source">): void {
  if (!diag) return;
  const full: SkippedCondition = { ...info, source: diag.source };
  if (diag.strict) throw new QueryKitError(full);
  diag.onSkipped?.(full);
}
