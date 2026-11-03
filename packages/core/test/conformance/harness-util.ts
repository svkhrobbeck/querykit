/**
 * Shared by the adapter harnesses: a `Call` → repository arguments, and a repository
 * result → `HarnessResult`.
 */
import type { Call } from "./case-types";
import type { HarnessResult } from "./runner";

type Row = Record<string, unknown>;

/** Arguments for `repository[call.method](...)`. */
export function callArgs(call: Call): unknown[] {
  switch (call.method) {
    case "updateWhere":
      return [call.params.filter, call.params.patch, call.params.options];
    case "deleteWhere":
      return [call.params.filter, call.params.options];
    default:
      return [call.params];
  }
}

/** Rows (`Row[]`), a page (`{ data, meta }`) or a mutation result (`{ count, rows? }` → meta `{ count }`). */
export function toResult(result: unknown, normalize: (row: Row) => Row = row => row): HarnessResult {
  if (Array.isArray(result)) return { rows: (result as Row[]).map(normalize) };
  const shaped = result as { data?: Row[]; meta?: Row; count?: number; rows?: Row[] };
  if (shaped.data) return { rows: shaped.data.map(normalize), meta: shaped.meta };
  return { rows: (shaped.rows ?? []).map(normalize), meta: { count: shaped.count } };
}
