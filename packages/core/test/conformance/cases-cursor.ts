/**
 * Cursor tie-break cases (task 012): 25 rows that share one `createdAt`.
 * With `cursorKey: "createdAt"` alone a keyset seek skips or repeats rows on
 * the tie; with the `(cursorKey, primaryKey)` seek every row appears once.
 */
import type { ConformanceCase } from "./case-types";
import type { ConformanceRow } from "./fixtures";

/** A raw token body, base64url — the shape a client could send. */
const rawToken = (body: unknown): string => Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
const BAD_TOKEN = { error: { site: "cursorKey", key: "createdAt", reason: "invalid-value" } } as const;
const WEB = "a cursor token is decoded by the repository, not built by web";

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
  {
    name: "columns without id: page 2 still seeks on (createdAt, id), the id is not added to the rows",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 3, order: "asc", columns: { name: true } }, followNext: true },
    expect: { names: ["dave", "Eve_Ann", "Frank"], ordered: true, keys: ["createdAt", "name"] },
  },
  {
    name: "A3: a token value that is an object ({ $ne: null }) → invalid-value, cursorKey",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", cursor: rawToken({ v: 2, k: { $ne: null }, id: 1 }) } },
    expect: BAD_TOKEN,
    notBuiltByWeb: WEB,
  },
  {
    name: "A5: an old v1 token → invalid-value, cursorKey",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", cursor: rawToken({ v: "2026-03-20T09:00:00.000Z" }) } },
    expect: BAD_TOKEN,
    notBuiltByWeb: WEB,
  },
  {
    name: "A6: a date cursorKey with a value that is not a date → invalid-value, cursorKey",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", cursor: rawToken({ v: 2, k: "not-a-date", id: 1 }) } },
    expect: BAD_TOKEN,
    notBuiltByWeb: WEB,
  },
  {
    name: "A4: with cursorSecret the signed tokens walk all 25 rows",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", order: "asc" }, walk: "forward-back" },
    options: { rows: TIED, cursorSecret: "s" },
    expect: { walk: { ids: 25, pages: [10, 10, 5, 10, 10] } },
    notBuiltByWeb: "a multi-page walk is a repository-level check",
  },
  {
    name: "A4: with cursorSecret an unsigned token → invalid-value, cursorKey",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 10, cursorKey: "createdAt", cursor: rawToken({ v: 2, k: "2026-03-01T09:00:00.000Z", id: 1 }) } },
    options: { cursorSecret: "s" },
    expect: BAD_TOKEN,
    notBuiltByWeb: WEB,
  },
];
