/**
 * Smoke test for @querykitjs/zod — validates the querykit request contract with
 * real zod. No network. `bun run test/smoke.ts`
 */
import { cursorParamsSchema, fieldConditionSchema, filterSchema, infiniteParamsSchema, offsetParamsSchema } from "../src/index";

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

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
