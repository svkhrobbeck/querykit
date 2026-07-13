/**
 * Pure smoke test for @querykit/web — no network, no React. Verifies the
 * query-building, normalization, schema→filter, URL logic and meta mapping.
 *
 *   bun run test/smoke.ts
 */
import { buildListParams, createFilters, defineListSchema, mapMeta } from "../src/index";
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

/* 3. Type coercion */
const coerced = buildListParams({
  filter: [
    { key: "createdAt", operation: ">=", value: "2026-01-15", type: "date" },
    { key: "age", operation: "=", value: "18", type: "number" },
    { key: "active", operation: "=", value: "true", type: "boolean" },
    { key: "ids", operation: "in", value: ["1", "2"], type: "number" },
  ],
}).filter as FieldCondition[];
check("date → ISO", String(coerced[0]!.value).endsWith("T00:00:00.000Z") || String(coerced[0]!.value).includes("2026-01-15"), String(coerced[0]!.value));
check("number coercion", coerced[1]!.value === 18);
check("boolean coercion", coerced[2]!.value === true);
check("in array number coercion", eq(coerced[3]!.value, [1, 2]));

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

/* 6. defineListSchema + searchParams → IFilter[] */
const schema = defineListSchema({
  buyerName: { operation: "%_%", trim: true },
  status: { operation: "=" },
  createdAt: { type: "date", range: ["fromDate", "toDate"] },
});
const sp = new URLSearchParams({ buyerName: "  ali  ", status: "", fromDate: "2026-01-01", toDate: "2026-02-01" });
const schemaFilter = schemaToFilter(schema, sp);
check(
  "schema → filter (trim, skip empty, range→2)",
  eq(schemaFilter, [
    { key: "buyerName", operation: "%_%", value: "ali" },
    { key: "createdAt", operation: ">=", value: "2026-01-01", type: "date" },
    { key: "createdAt", operation: "<=", value: "2026-02-01", type: "date" },
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

/* 9. mapMeta snake → camel */
const meta = mapMeta({ total_pages: 4, total_items: 73, current_page: 2, per_page: 20 });
check("mapMeta", eq(meta, { totalPages: 4, totalCount: 73, currentPage: 2, perPage: 20 }));
check("mapMeta empty → zeros", eq(mapMeta(), { totalPages: 0, totalCount: 0, currentPage: 0, perPage: 0 }));

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
