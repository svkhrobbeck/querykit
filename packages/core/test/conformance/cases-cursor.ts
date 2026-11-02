/**
 * Cursor tie-break cases (task 012): 25 rows that share one `createdAt`.
 * With `cursorKey: "createdAt"` alone a keyset seek skips or repeats rows on
 * the tie; with the `(cursorKey, primaryKey)` seek every row appears once.
 */
import type { ConformanceCase } from "./case-types";
import type { ConformanceRow } from "./fixtures";

const SAME_TIME = new Date("2026-03-01T09:00:00.000Z");
const TIED: readonly ConformanceRow[] = Array.from({ length: 25 }, (_, index) => ({
  id: index + 1,
  name: `Row${String(index + 1).padStart(2, "0")}`,
  email: `row${index + 1}@example.com`,
  age: 20 + (index % 5),
  createdAt: SAME_TIME,
}));

export const CURSOR_CASES: readonly ConformanceCase[] = [
  {
    name: "A1: 25 rows with one createdAt, limit 10 → pages 10 + 10 + 5, every id once",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", order: "asc" }, walk: "forward" },
    options: { rows: TIED },
    expect: { walk: { ids: 25, pages: [10, 10, 5] } },
    notBuiltByWeb: "a multi-page walk is a repository-level check",
  },
  {
    name: "A1: forward to the end, then backward to the start, still 25 ids",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", order: "asc" }, walk: "forward-back" },
    options: { rows: TIED },
    expect: { walk: { ids: 25, pages: [10, 10, 5, 10, 10] } },
    notBuiltByWeb: "a multi-page walk is a repository-level check",
  },
];
