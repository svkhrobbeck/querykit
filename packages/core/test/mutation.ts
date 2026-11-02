/**
 * Task 013 — bulk-mutation guards (`isAllRows`, `isEmptyFilter`, `refuseEmptyFilter`)
 * and the `withTotal: false` page. Imported by `internal.ts`; sets `process.exitCode`.
 */
import { QueryKitError } from "../src/index";
import { isAllRows, isEmptyFilter, matchesNothing, offsetPageWithoutTotal, refuseEmptyFilter, scopeConditions, scopeDefaults } from "../src/internal/index";

let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} [mutation] ${label}${extra ? ` — ${extra}` : ""}`);
}

check("{ all: true } asks for every row", isAllRows({ all: true }));
check(
  "{ all: 1 }, { all: true, x: 1 }, [] and undefined do not",
  !isAllRows({ all: 1 }) && !isAllRows({ all: true, x: 1 }) && !isAllRows([]) && !isAllRows(undefined),
);
check("undefined, null, [] and {} are empty", isEmptyFilter(undefined) && isEmptyFilter(null) && isEmptyFilter([]) && isEmptyFilter({}));
check("a condition or { and: [] } is not empty here", !isEmptyFilter([{ key: "a", value: 1 }]) && !isEmptyFilter({ and: [] }));

let refused: unknown;
try {
  refuseEmptyFilter("users", "deleteWhere");
} catch (err) {
  refused = err;
}
check(
  "refuseEmptyFilter → QueryKitError empty-filter, site mutation, key = method",
  refused instanceof QueryKitError &&
    refused.info.reason === "empty-filter" &&
    refused.info.site === "mutation" &&
    refused.info.key === "deleteWhere" &&
    refused.info.source === "users",
);

const page = offsetPageWithoutTotal([1, 2, 3, 4], 2, 3);
check(
  "withTotal: false — perPage + 1 rows → has_next, extra row dropped, totals null",
  JSON.stringify(page) ===
    JSON.stringify({ data: [1, 2, 3], meta: { total_items: null, total_pages: null, current_page: 2, per_page: 3, has_next: true, has_prev: true } }),
  JSON.stringify(page),
);
check("withTotal: false — perPage rows or fewer → no next page", offsetPageWithoutTotal([1, 2, 3], 1, 3).meta.has_next === false);

/* Task 014 P1 — scope: equality or { in: [...] }. */
const scope = { shopId: { in: [1, 2] }, tenant: "t1", meta: { in: [1], x: 1 } };
check(
  "scopeConditions: { in } → in, everything else → = (an object with more keys stays equality)",
  JSON.stringify(scopeConditions(scope)) ===
    JSON.stringify([
      { key: "shopId", operation: "in", value: [1, 2] },
      { key: "tenant", operation: "=", value: "t1" },
      { key: "meta", operation: "=", value: { in: [1], x: 1 } },
    ]),
);
check("scopeDefaults keeps equality scopes only", JSON.stringify(scopeDefaults(scope)) === JSON.stringify({ tenant: "t1", meta: { in: [1], x: 1 } }));
check("an empty in matches nothing; a filled one does", matchesNothing(scopeConditions({ a: { in: [] } })) && !matchesNothing(scopeConditions(scope)));

if (failed > 0) process.exitCode = 1;
console.log(`mutation: ${failed} failed`);
