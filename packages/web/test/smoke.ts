/**
 * Pure smoke test for @querykit/web — no network, no React. Verifies the
 * query-building, normalization, schema→filter, URL logic and meta mapping.
 *
 *   bun run test/smoke.ts
 */
import {
  buildCursorParams,
  buildInfiniteParams,
  buildListParams,
  createFilters,
  defineListSchema,
  mapCursorMeta,
  mapInfiniteMeta,
  mapMeta,
} from "../src/index";
import { readListParams, schemaToFilter, setParam, setSort } from "../src/url";
import type { FieldCondition } from "../src/types";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Buyer {
  id: number;
  buyerName: string;
  status: string;
  createdAt: string;
}
const f = createFilters<Buyer>();

/* 1. Both filter styles → same normalized output */
const viaBuilder = buildListParams({ filter: [f.contains("buyerName", "ali"), f.eq("status", "active")] });
const viaObject = buildListParams({
  filter: [
    { key: "buyerName", operation: "%_%", value: "ali" },
    { key: "status", operation: "=", value: "active" },
  ],
});
check("builder ≡ object filter", eq(viaBuilder.filter, viaObject.filter), JSON.stringify(viaBuilder.filter));

/* 2. Empty filters pruned; 0/false kept */
const pruned = buildListParams({
  filter: [
    { key: "a", operation: "=", value: "" },
    { key: "b", operation: "=", value: undefined },
    { key: "c", operation: "=", value: 0 },
    { key: "d", operation: "=", value: false },
    { key: "e", operation: "isNull" },
  ],
}).filter as FieldCondition[];
check(
  "prune empties, keep 0/false/isNull",
  eq(
    pruned.map(c => c.key),
    ["c", "d", "e"],
  ),
  JSON.stringify(pruned.map(c => c.key)),
);

/* 3. Values pass through as-is (no coercion) */
const raw = buildListParams({
  filter: [{ key: "ids", operation: "in", value: ["1", "2"] }],
}).filter as FieldCondition[];
check("values pass through unchanged", eq(raw[0]!.value, ["1", "2"]));

/* 4. sort "-createdAt" → { name, direction } */
const sorted = buildListParams({ sort: "-createdAt" });
check("sortType decode", eq(sorted.sort, { name: "createdAt", direction: "desc" }));
const sortedAsc = buildListParams({ sort: "name" });
check("sortType asc", eq(sortedAsc.sort, { name: "name", direction: "asc" }));

/* 5. pagination defaults */
const paged = buildListParams({ page: 2, perPage: 20 });
check("pagination fields", paged.page === 2 && paged.per_page === 20);
const defPaged = buildListParams({});
check("pagination defaults", defPaged.page === 1 && defPaged.per_page === 15);
check(
  "page < 1 (0.5 / 0 / -3) → 1",
  buildListParams({ page: 0.5 }).page === 1 && buildListParams({ page: 0 }).page === 1 && buildListParams({ page: -3 }).page === 1,
);

/* 6. defineListSchema + searchParams → IFilter[] */
const schema = defineListSchema({
  buyerName: { operation: "%_%", trim: true },
  status: { operation: "=" },
  createdAt: { range: ["fromDate", "toDate"] },
});
const sp = new URLSearchParams({ buyerName: "  ali  ", status: "", fromDate: "2026-01-01", toDate: "2026-02-01" });
const schemaFilter = schemaToFilter(schema, sp);
check(
  "schema → filter (trim, skip empty, range→2)",
  eq(schemaFilter, [
    { key: "buyerName", operation: "%_%", value: "ali" },
    { key: "createdAt", operation: ">=", value: "2026-01-01" },
    { key: "createdAt", operation: "<=", value: "2026-02-01" },
  ]),
  JSON.stringify(schemaFilter),
);

/* 7. readListParams reads page/size/sortType */
const sp2 = new URLSearchParams({ page: "3", size: "50", sortType: "-createdAt", buyerName: "x" });
const read = readListParams(schema, sp2);
check("readListParams", read.page === 3 && read.perPage === 50 && read.sort === "-createdAt");

/* 8. page-reset invariant on filter & sort change */
const withPage = new URLSearchParams({ page: "5", buyerName: "x" });
const afterFilter = setParam(withPage, "status", "active");
check("setParam resets page", !afterFilter.has("page") && afterFilter.get("status") === "active");
const afterSort = setSort(withPage, { name: "name", direction: "asc" });
check("setSort resets page + encodes", !afterSort.has("page") && afterSort.get("sortType") === "name");

/* 9. meta mappers — offset / infinite / cursor (alohida) */
const meta = mapMeta({ total_pages: 4, total_items: 73, current_page: 2, per_page: 20, has_next: true, has_prev: true });
check("mapMeta (offset)", eq(meta, { totalPages: 4, totalCount: 73, currentPage: 2, perPage: 20, hasNext: true, hasPrev: true }));
const infMeta = mapInfiniteMeta({ limit: 20, offset: 40, count: 20, has_more: true, next_offset: 60 });
check("mapInfiniteMeta", eq(infMeta, { limit: 20, offset: 40, count: 20, hasMore: true, nextOffset: 60 }));
const curMeta = mapCursorMeta({ limit: 20, has_next: true, has_prev: false, next_cursor: "eyJ", prev_cursor: null });
check("mapCursorMeta", eq(curMeta, { limit: 20, hasNext: true, hasPrev: false, nextCursor: "eyJ", prevCursor: null }));

/* 10. new operators: like/ilike/notLike + between helper */
const ops = buildListParams({
  filter: [f.like("name", "a%"), f.ilike("email", "%@x.com"), f.notLike("code", "z%"), f.between("age", 18, 65)],
}).filter as FieldCondition[];
check(
  "like/ilike/notLike/between builders",
  eq(
    ops.map(c => c.operation),
    ["like", "ilike", "notLike", "between"],
  ) && eq(ops[3]!.value, [18, 65]),
  JSON.stringify(ops.map(c => c.operation)),
);

/* 11. buildInfiniteParams */
const inf = buildInfiniteParams({ filter: [f.eq("status", "active")], limit: 20, offset: 40 });
check("buildInfiniteParams", inf.limit === 20 && inf.offset === 40 && Array.isArray(inf.filter), JSON.stringify({ limit: inf.limit, offset: inf.offset }));
const infDef = buildInfiniteParams({});
check("infinite defaults", infDef.limit === 20 && infDef.offset === 0);

/* 12. buildCursorParams (no sort; order/direction) */
const cur = buildCursorParams({ filter: [f.eq("status", "active")], limit: 30, cursor: "abc", order: "asc" });
check(
  "buildCursorParams",
  cur.limit === 30 && cur.cursor === "abc" && cur.order === "asc" && cur.direction === "forward" && !("sort" in cur),
  JSON.stringify({ limit: cur.limit, cursor: cur.cursor, order: cur.order, direction: cur.direction }),
);
const curDef = buildCursorParams({});
check("cursor defaults", curDef.limit === 20 && curDef.cursor === null && curDef.order === "asc" && curDef.direction === "forward");

/* 13. withDeleted passthrough */
const wd = buildListParams({ withDeleted: true }) as unknown as { withDeleted?: boolean };
check("withDeleted passthrough", wd.withDeleted === true);
const noWd = buildListParams({}) as unknown as { withDeleted?: boolean };
check("withDeleted omitted when unset", !("withDeleted" in noWd));

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
