/**
 * Pure smoke test for @querykitjs/core — no deps. Verifies the filter builder
 * emits the right operations/tokens and the tree/group shapes.
 *
 *   bun run test/smoke.ts
 */
import { createFilters, f } from "../src/index";
import type { FieldCondition } from "../src/types";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* typed builder */
const uf = createFilters<"name" | "status" | "age" | "createdAt">();

check(
  "eq/contains emit tokens",
  eq(uf.eq("status", "active"), { key: "status", operation: "=", value: "active" }) && uf.contains("name", "a").operation === "%_%",
);
check("startsWith/endsWith tokens", uf.startsWith("name", "a").operation === "%_" && uf.endsWith("name", "a").operation === "_%");
check(
  "like/ilike/notLike",
  uf.like("name", "a%").operation === "like" && uf.ilike("name", "a").operation === "ilike" && uf.notLike("name", "a").operation === "notLike",
);
check("between → [min,max]", eq(uf.between("age", 18, 65).value, [18, 65]));
check(
  "range → two conditions",
  eq(uf.range("createdAt", "x", "y"), [
    { key: "createdAt", operation: ">=", value: "x" },
    { key: "createdAt", operation: "<=", value: "y" },
  ]),
);
check("isNull value-less", uf.isNull("age").operation === "isNull" && uf.isNull("age").value === undefined);

/* groups */
const tree = uf.and(uf.eq("status", "active"), uf.or(uf.gte("age", 18), uf.isNull("age")));
const orNode = tree.and[1] as { or?: unknown[] };
check("and/or nesting", "and" in tree && tree.and.length === 2 && Array.isArray(orNode.or) && orNode.or.length === 2);
const notNode = uf.not(uf.eq("status", "x"));
check("not group", "not" in notNode);

/* untyped f */
check("untyped f works", (f.eq("k", 1) as FieldCondition).operation === "=");

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
