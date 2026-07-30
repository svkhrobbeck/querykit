/**
 * Smoke test for @querykitjs/zod — validates the querykit request contract with
 * real zod. No network. `bun run test/smoke.ts`
 */
import {
  cursorParamsSchema,
  fieldConditionSchema,
  filterSchema,
  infiniteParamsSchema,
  makeCursorParamsSchema,
  makeInfiniteParamsSchema,
  makeOffsetParamsSchema,
  offsetParamsSchema,
} from "../src/index";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

/* 1. Nested filter with new operators (and/or/not, between, isNull) */
const nested = {
  and: [
    { key: "status", operation: "=", value: "active" },
    {
      or: [
        { key: "age", operation: "between", value: [18, 65] },
        { key: "role", operation: "in", value: ["admin", "owner"] },
      ],
    },
    { not: { key: "deletedAt", operation: "isNull" } },
  ],
};
check("nested and/or/not + between/in/isNull", filterSchema.safeParse(nested).success);

/* 2. Flat array (implicit AND) */
check(
  "flat filter array",
  filterSchema.safeParse([
    { key: "name", operation: "%_%", value: "ali" },
    { key: "status", operation: "=", value: "active" },
  ]).success,
);

/* 3. New operators accepted: like/ilike/notLike/notIn/notBetween/isNotNull */
for (const op of ["like", "ilike", "notLike", "notIn", "notBetween", "isNotNull", "startsWith", "endsWith", "contains"]) {
  const r = fieldConditionSchema.safeParse({ key: "x", operation: op, value: "v" });
  if (!r.success) check(`operator ${op} accepted`, false);
}
check("all new operators accepted", true);

/* 4. Legacy `type` field is ignored (stripped), not rejected */
const withType = fieldConditionSchema.safeParse({ key: "createdAt", operation: ">=", value: "2026-01-01", type: "date" });
check(
  "legacy `type` ignored (stripped)",
  withType.success && !("type" in (withType.data ?? {})),
  withType.success ? JSON.stringify(withType.data) : "parse failed",
);

/* 5. Invalid operator rejected */
check("invalid operator rejected", !fieldConditionSchema.safeParse({ key: "x", operation: "LIKESQL", value: "v" }).success);
check("missing key rejected", !fieldConditionSchema.safeParse({ operation: "=", value: "v" }).success);

/* 6. Offset params */
const offset = offsetParamsSchema.safeParse({
  filter: [{ key: "name", operation: "%_%", value: "a" }],
  sort: [{ key: "createdAt", direction: "desc" }],
  page: 2,
  perPage: 20,
  with: { author: true },
});
check("offset params valid", offset.success, offset.success ? "" : JSON.stringify(offset.error?.issues?.[0]));
check("offset rejects perPage < 1", !offsetParamsSchema.safeParse({ perPage: 0 }).success);

/* 7. Infinite params */
const inf = infiniteParamsSchema.safeParse({ filter: nested, limit: 20, offset: 40, withDeleted: true });
check("infinite params valid", inf.success);

/* 8. Cursor params (cursor null, order/direction) */
const cur = cursorParamsSchema.safeParse({ limit: 20, cursor: null, cursorKey: "id", order: "asc", direction: "forward" });
check("cursor params valid", cur.success);
check("cursor rejects bad direction", !cursorParamsSchema.safeParse({ direction: "sideways" }).success);

/* 9. sort — `{ key, direction }[]` only */
check("sort array valid", offsetParamsSchema.safeParse({ sort: [{ key: "name", direction: "asc" }] }).success);
check("sort string rejected", !offsetParamsSchema.safeParse({ sort: "-createdAt" }).success);
check("sort object (non-array) rejected", !offsetParamsSchema.safeParse({ sort: { key: "createdAt", direction: "desc" } }).success);

/* 10. realistic full list payload (querykit contract) */
const payload = {
  filter: [
    { key: "buyerName", operation: "%_%", value: "ali" },
    { key: "createdAt", operation: ">=", value: "2026-01-01" },
    { key: "createdAt", operation: "<=", value: "2026-02-01" },
  ],
  sort: [{ key: "createdAt", direction: "desc" }],
  page: 1,
  perPage: 15,
  with: { supervisor: true },
};
check("realistic list payload valid", offsetParamsSchema.safeParse(payload).success);

/* ------------------------------- factories -------------------------------- */
/* 11. perPage/limit cap — DoS himoyasi (P1-3) */
const listSchema = makeOffsetParamsSchema();
check("factory: perPage 1_000_000 rejected (default cap 200)", !listSchema.safeParse({ perPage: 1_000_000 }).success);
check("factory: perPage 200 accepted", listSchema.safeParse({ perPage: 200 }).success);
check("factory: perPage 201 rejected", !listSchema.safeParse({ perPage: 201 }).success);
check("factory: perPage 0 still rejected", !listSchema.safeParse({ perPage: 0 }).success);

const cappedSchema = makeOffsetParamsSchema({ maxPerPage: 50 });
check("factory: maxPerPage 50 → 51 rejected", !cappedSchema.safeParse({ perPage: 51 }).success);
check("factory: maxPerPage 50 → 50 accepted", cappedSchema.safeParse({ perPage: 50 }).success);
check("factory: maxPerPage Infinity disables the cap", makeOffsetParamsSchema({ maxPerPage: Infinity }).safeParse({ perPage: 1_000_000 }).success);

check("factory: infinite limit capped at 200", !makeInfiniteParamsSchema().safeParse({ limit: 100_000 }).success);
check("factory: infinite offset still nonnegative", makeInfiniteParamsSchema().safeParse({ offset: 0 }).success);
check("factory: cursor limit capped at 200", !makeCursorParamsSchema().safeParse({ limit: 100_000 }).success);
check("factory: cursor maxLimit honored", makeCursorParamsSchema({ maxLimit: 10 }).safeParse({ limit: 10 }).success);

/* 12. server-owned maydonlar default'da schema'ga kirmaydi (P1-4, 1-qatlam) */
const serverOwned = listSchema.safeParse({ columns: { password: true }, with: { secrets: true }, withDeleted: true, page: 1 });
check("factory: server-owned payload still parses", serverOwned.success);
check("factory: `columns` stripped by default", serverOwned.success && !("columns" in serverOwned.data));
check("factory: `with` stripped by default", serverOwned.success && !("with" in serverOwned.data));
check("factory: `withDeleted` stripped by default", serverOwned.success && !("withDeleted" in serverOwned.data));
check("factory: legitimate fields survive alongside", serverOwned.success && serverOwned.data.page === 1);

/* 13. opt-in orqali ataylab ochish */
const adminSchema = makeOffsetParamsSchema({ allow: ["withDeleted"] });
const admin = adminSchema.safeParse({ withDeleted: true, columns: { password: true } });
check("factory: allow:[withDeleted] keeps withDeleted", admin.success && admin.data.withDeleted === true);
check("factory: allow:[withDeleted] still strips columns", admin.success && !("columns" in admin.data));

const projSchema = makeOffsetParamsSchema({ allow: ["columns", "with"] });
const proj = projSchema.safeParse({ columns: { name: true }, with: { author: true }, withDeleted: true });
check("factory: allow:[columns,with] keeps both", proj.success && Boolean(proj.data.columns) && Boolean(proj.data.with));
check("factory: allow:[columns,with] still strips withDeleted", proj.success && !("withDeleted" in proj.data));

/* 14. cursor factory'da `sort` yo'q (konstanta bilan bir xil) */
const curFactory = makeCursorParamsSchema().safeParse({ sort: [{ key: "createdAt", direction: "desc" }], limit: 5 });
check("factory: cursor drops sort", curFactory.success && !("sort" in curFactory.data));

/* 15. filter/sort validatsiyasi factory'da ham ishlaydi */
check("factory: invalid operator rejected", !listSchema.safeParse({ filter: [{ key: "x", operation: "NOPE" }] }).success);
check("factory: sort string rejected", !listSchema.safeParse({ sort: "-createdAt" }).success);
check("factory: realistic payload valid", listSchema.safeParse({ ...payload, with: undefined }).success);

/* 16. REGRESSIYA: mavjud konstantalar ataylab o'zgarmagan (legacy parity) */
check("legacy: offsetParamsSchema has NO cap", offsetParamsSchema.safeParse({ perPage: 1_000_000 }).success);
const legacy = offsetParamsSchema.safeParse({ columns: { a: true }, with: { b: true }, withDeleted: true });
check(
  "legacy: offsetParamsSchema still accepts columns/with/withDeleted",
  legacy.success && Boolean(legacy.data.columns) && Boolean(legacy.data.with) && legacy.data.withDeleted === true,
);
check("legacy: infiniteParamsSchema has NO cap", infiniteParamsSchema.safeParse({ limit: 1_000_000 }).success);
check("legacy: cursorParamsSchema has NO cap", cursorParamsSchema.safeParse({ limit: 1_000_000 }).success);

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
