import { QueryKitError, type SkippedCondition } from "@querykitjs/core";

/**
 * Per-repository diagnostics channel. The compilers (`where`, `order-by`) drop
 * conditions they cannot resolve — good for db-service parity, but a typo in a
 * filter key then makes an endpoint return **more** rows than intended, silently.
 * This makes each drop either visible (`onSkipped`) or fatal (`strict`).
 *
 * Shared shape with the mongoose adapter, and `SkippedCondition` /
 * `QueryKitError` come from core — so both backends report identically.
 */
export interface Diagnostics {
  /** Table name (mongoose: model name), for the report. */
  source: string;
  /** Throw `QueryKitError` instead of dropping the condition. Default `false`. */
  strict: boolean;
  onSkipped?: (info: SkippedCondition) => void;
}

/**
 * Report a dropped condition. `strict` turns it into a `QueryKitError` the
 * backend can map to a 400; otherwise the hook is called and the condition is
 * dropped exactly as before — the default path stays byte-for-byte unchanged.
 */
export function reportSkip(diag: Diagnostics | undefined, info: Omit<SkippedCondition, "source">): void {
  if (!diag) return;
  const full: SkippedCondition = { ...info, source: diag.source };
  if (diag.strict) throw new QueryKitError(full);
  diag.onSkipped?.(full);
}
