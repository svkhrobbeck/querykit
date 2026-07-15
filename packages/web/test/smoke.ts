/**
 * Pure smoke test for @querykitjs/web — no network, no React. Verifies the
 * query-building, normalization, schema→filter, URL logic and meta mapping.
 *
 *   bun run test/smoke.ts
 */
import { buildCursorParams, buildInfiniteParams, buildListParams, createFilters, createRegistry, defineListSchema } from "../src/index";
import { mapCursorMeta, mapInfiniteMeta, mapMeta } from "../src/meta"; // internal (not public — use registry `parse*`)
import { decodeSort, readListParams, schemaToFilter, setParam, setSort } from "../src/url";
import type { FieldCondition, FilterNode } from "../src/types";

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
  name: string;
  email: string;
  code: string;
  age: number;
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

/* 4. sort shorthand ["-createdAt"] / objects → always canonical [{ key, direction }] */
const sorted = buildListParams({ sort: ["-createdAt"] });
check("sort string shorthand → array", eq(sorted.sort, [{ key: "createdAt", direction: "desc" }]));
const sortedMulti = buildListParams({ sort: ["name", "-createdAt"] });
check(
  "multi-sort shorthand",
  eq(sortedMulti.sort, [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ]),
);
const sortedObj = buildListParams({ sort: [{ key: "age", direction: "desc" }] });
check("sort object form", eq(sortedObj.sort, [{ key: "age", direction: "desc" }]));

/* 5. pagination defaults */
const paged = buildListParams({ page: 2, perPage: 20 });
check("pagination fields", paged.page === 2 && paged.perPage === 20);
const defPaged = buildListParams({});
check("pagination defaults (20 from core)", defPaged.page === 1 && defPaged.perPage === 20);
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
check("readListParams (sortType → array)", read.page === 3 && read.perPage === 50 && eq(read.sort, [{ key: "createdAt", direction: "desc" }]));

/* 8. page-reset invariant on filter & sort change */
const withPage = new URLSearchParams({ page: "5", buyerName: "x" });
const afterFilter = setParam(withPage, "status", "active");
check("setParam resets page", !afterFilter.has("page") && afterFilter.get("status") === "active");
const afterSort = setSort(withPage, [{ key: "name", direction: "asc" }]);
check("setSort resets page + encodes", !afterSort.has("page") && afterSort.get("sortType") === "name");
// multi-sort round-trip: set → sortType=name,-createdAt → decode back to array
const afterMulti = setSort(withPage, ["name", "-createdAt"]);
check("setSort multi encodes to comma string", afterMulti.get("sortType") === "name,-createdAt");
check(
  "decodeSort multi round-trip",
  eq(decodeSort(afterMulti.get("sortType")), [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ]),
);

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

/* 14. registry — createRegistry + resource builders */
const qk = createRegistry({ adapter: "mongoose", defaults: { perPage: 20, sort: ["-createdAt"], cursor: { order: "asc" } }, pruneEmpty: true });
const users = qk.resource<Buyer>("users");

const lp = users.list({ filter: [users.f.contains("buyerName", "ali")], page: 2 });
check("registry list payload", lp.page === 2 && lp.perPage === 20 && Array.isArray(lp.filter));
const lp2 = users.list({});
check("registry default sort from config", eq(lp2.sort, [{ key: "createdAt", direction: "desc" }]));
const ip = users.infinite({ limit: 10, offset: 30 });
check("registry infinite payload", ip.limit === 10 && ip.offset === 30);
const cp = users.cursor({ limit: 15, cursor: "abc" });
check("registry cursor default order", cp.order === "asc" && cp.direction === "forward" && cp.cursor === "abc" && !("sort" in cp));

// adapter-aware `with` (mongoose): `select` is allowed and passes through…
const withPayload = users.list({ with: { author: { select: "name email" } } });
check("registry with (mongoose select) passthrough", eq((withPayload.with as { author?: unknown }).author, { select: "name email" }));
// …and a Drizzle-only option is a compile-time error for the mongoose adapter:
// @ts-expect-error `columns` is drizzle-only — not offered for adapter "mongoose"
users.list({ with: { author: { columns: { name: true } } } });

// search preset — OR of contains across fields
const searchFilter = users.search("ali", ["buyerName", "status"]);
check(
  "registry search preset",
  eq(searchFilter, {
    or: [
      { key: "buyerName", operation: "%_%", value: "ali" },
      { key: "status", operation: "%_%", value: "ali" },
    ],
  }),
);

// operator-per-field-type (C5): comparison ok on numbers, string-match rejected on numbers
users.f.gte("age", 18);
// @ts-expect-error `contains` is string-only; `age` is a number
users.f.contains("age", "x");

// fromSearchParams (SSR / no-hook): build a list payload straight from the URL
const ssrSchema = users.schema({ status: { key: "status" }, buyerName: { key: "buyerName", operation: "%_%" } });
const ssr = users.fromSearchParams(new URLSearchParams({ status: "active", page: "3" }), { schema: ssrSchema });
check("registry fromSearchParams (SSR)", ssr.page === 3 && (ssr.filter as FieldCondition[]).some(c => c.key === "status" && c.value === "active"));

/* 15. registry — query keys */
check("registry keys", eq(users.keys.list(lp), ["users", "list", lp]) && eq(users.keys.detail(5), ["users", "detail", 5]) && eq(users.keys.all, ["users"]));

/* 16. registry — parse* (meta snake→camel) */
const parsed = users.parseList({
  data: [{ id: 1 }] as unknown as Buyer[],
  meta: { total_pages: 3, total_items: 50, current_page: 2, per_page: 20, has_next: true, has_prev: true },
});
check("registry parseList maps meta", parsed.data.length === 1 && parsed.meta.totalPages === 3 && parsed.meta.currentPage === 2 && parsed.meta.hasNext);
const pInf = users.parseInfinite({ data: [], meta: { limit: 20, offset: 40, count: 20, has_more: true, next_offset: 60 } });
check("registry parseInfinite", pInf.meta.hasMore && pInf.meta.nextOffset === 60);
const pCur = users.parseCursor({ data: [], meta: { limit: 20, has_next: true, has_prev: false, next_cursor: "n", prev_cursor: null } });
check("registry parseCursor", pCur.meta.hasNext && pCur.meta.nextCursor === "n");
check("registry-level parseList (entity-agnostic)", qk.parseList({ data: [1, 2], meta: { total_items: 2 } }).meta.totalCount === 2);

/* 17. schema enhancements — default / trim / split / between / search */
const sch = users.schema({
  status: { operation: "=", default: "active" },
  ids: { operation: "in", split: true },
  q: { search: ["buyerName", "status"] },
  price: { between: ["minPrice", "maxPrice"] },
  createdAt: { range: ["fromDate", "toDate"] },
  buyerName: { operation: "%_%", trim: true },
});

const s1 = schemaToFilter(sch, new URLSearchParams({ buyerName: "  ali  " })) as FieldCondition[];
check(
  "schema default value (absent status→active)",
  s1.some(c => c.key === "status" && c.value === "active"),
);
check(
  "schema trim",
  s1.some(c => c.key === "buyerName" && c.value === "ali"),
);
// empty `?status=` means "cleared" → prune, do NOT re-inject the default
const s1b = schemaToFilter(sch, new URLSearchParams({ status: "" })) as FieldCondition[];
check("schema empty param prunes (no default re-inject)", !s1b.some(c => c.key === "status"));

const s2 = schemaToFilter(sch, new URLSearchParams({ ids: "1, 2 ,3" })) as FieldCondition[];
const idsC = s2.find(c => c.key === "ids");
check("schema split → array", eq(idsC?.value, ["1", "2", "3"]) && idsC?.operation === "in");

const s3 = schemaToFilter(sch, new URLSearchParams({ minPrice: "10", maxPrice: "99" })) as FieldCondition[];
const priceC = s3.find(c => c.key === "price");
check("schema between → 2-tuple", priceC?.operation === "between" && eq(priceC?.value, ["10", "99"]));

const s4 = schemaToFilter(sch, new URLSearchParams({ q: "ali", status: "x" }));
check(
  "schema search → or-group tree",
  !Array.isArray(s4) && "and" in s4 && (s4 as { and: FilterNode[] }).and.some(n => typeof n === "object" && n !== null && "or" in n),
);

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
