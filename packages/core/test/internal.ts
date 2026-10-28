/**
 * `@querykitjs/core/internal` — the pieces every adapter shares.
 *
 *   bun run test/internal.ts
 */
import { QueryKitError, type SkippedCondition } from "../src/index";
import {
  clampOffset,
  clampPage,
  clampPageSize,
  createContextStore,
  cursorPage,
  decodeCursor,
  encodeCursor,
  infinitePage,
  normalizeSort,
  offsetMeta,
  reportSkip,
} from "../src/internal/index";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* cursor */
const date = new Date("2026-03-20T09:00:00.000Z");
check("cursor token is base64url of {v}", encodeCursor(5) === Buffer.from('{"v":5}').toString("base64url"));
check("a date cursor round-trips as an ISO string", decodeCursor(encodeCursor(date)) === date.toISOString());
check("an undecodable cursor is undefined", decodeCursor("%%%") === undefined && decodeCursor(null) === undefined);

/* diagnostics */
const seen: SkippedCondition[] = [];
reportSkip({ source: "users", strict: false, onSkipped: info => seen.push(info) }, { site: "filter", key: "nope", reason: "unknown-key" });
check("non-strict reports through the hook with the source", same(seen, [{ site: "filter", key: "nope", reason: "unknown-key", source: "users" }]));
let thrown: unknown;
try {
  reportSkip({ source: "users", strict: true }, { site: "sort", key: "nope", reason: "unknown-key" });
} catch (err) {
  thrown = err;
}
check("strict throws QueryKitError", thrown instanceof QueryKitError && thrown.info.site === "sort");

/* context */
const store = createContextStore<{ executor?: string }>();
const inside = store.run({ executor: "tx" }, () => store.get()?.executor);
check("context is visible inside run and gone outside", inside === "tx" && store.get() === undefined);

/* sort */
check(
  "normalizeSort defaults direction and drops keyless items",
  same(normalizeSort([{ key: "a" }, null as never, { key: "" } as never, { key: "b", direction: "desc" }]), [
    { key: "a", direction: "asc" },
    { key: "b", direction: "desc" },
  ]),
);

/* pagination */
check(
  "clampPageSize: default, truncate, min 1, max",
  clampPageSize(undefined, 20, 200) === 20 && clampPageSize(2.9, 20, 200) === 2 && clampPageSize(0, 20, 200) === 1 && clampPageSize(500, 20, 200) === 200,
);
check("clampPage / clampOffset", clampPage(undefined) === 1 && clampPage(-3) === 1 && clampOffset(undefined) === 0 && clampOffset(4.7) === 4);
check("offsetMeta", same(offsetMeta(2, 3, 7), { total_items: 7, total_pages: 3, current_page: 2, per_page: 3, has_next: true, has_prev: true }));
const infinite = infinitePage([1, 2, 3], 2, 4);
check("infinitePage drops the probe row", same(infinite, { data: [1, 2], meta: { limit: 2, offset: 4, count: 2, has_more: true, next_offset: 6 } }));
const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
const forward = cursorPage(rows, { limit: 2, direction: "forward", hasCursor: false, cursorField: "id" });
check(
  "cursorPage forward",
  same(forward.data, [{ id: 1 }, { id: 2 }]) &&
    same(forward.meta, { limit: 2, has_next: true, has_prev: false, next_cursor: encodeCursor(2), prev_cursor: null }),
);
const backward = cursorPage([{ id: 5 }, { id: 4 }, { id: 3 }], { limit: 2, direction: "backward", hasCursor: true, cursorField: "id" });
check(
  "cursorPage backward flips to display order",
  same(backward.data, [{ id: 4 }, { id: 5 }]) && backward.meta.has_prev && backward.meta.has_next && backward.meta.prev_cursor === encodeCursor(4),
);

console.log(`\ncore/internal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
