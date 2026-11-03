/**
 * Filter compilation for @querykitjs/mongodb — no database.
 *
 *   bun --preload ./test/bun-v8-shim.ts test/where.ts
 *
 * Values are cast by the zod field kind; an object value never reaches the driver (see
 * `test/policy.ts`); an unbranded raw node is refused and a branded one passes (R19).
 * Imported by `smoke`-free test runs; sets `process.exitCode` on failure.
 */
import { ObjectId } from "mongodb";
import { z } from "zod";
import { QueryKitError, raw, type SkippedCondition } from "@querykitjs/core";

import { shapeFromSchema } from "../src/internal/fields";
import { buildWhere } from "../src/internal/where";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} [where] ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const json = (value: unknown) => JSON.stringify(value);

const shape = shapeFromSchema(
  "users",
  z.object({ name: z.string(), age: z.number().optional(), createdAt: z.date(), status: z.enum(["active", "blocked"]), shopId: z.string() }),
  ["_id", "shopId"],
);
const skipped: SkippedCondition[] = [];
const diag = { source: "users", strict: false, onSkipped: (info: SkippedCondition) => skipped.push(info) };
const where = (filter: unknown) => {
  skipped.length = 0;
  return buildWhere(shape, filter as never, diag);
};

/* casts by field kind */
check("number field: '30' → 30", json(where([{ key: "age", operation: "=", value: "30" }])) === json({ age: { $eq: 30 } }));
const created = where([{ key: "createdAt", operation: ">=", value: "2026-01-01T00:00:00.000Z" }]) as { createdAt: { $gte: unknown } };
check("date field: ISO string → Date", created.createdAt.$gte instanceof Date);
const byId = where([{ key: "id", operation: "=", value: "65a1b2c3d4e5f60718293a4b" }]) as { _id: { $eq: unknown } };
check("id → _id as ObjectId", byId._id.$eq instanceof ObjectId);
const shop = where([{ key: "shopId", operation: "in", value: ["65a1b2c3d4e5f60718293a4b"] }]) as { shopId: { $in: unknown[] } };
check("objectId option field: in → ObjectId[]", shop.shopId.$in[0] instanceof ObjectId);
check("enum outside its values → dropped, invalid-value", where([{ key: "status", value: "gone" }]) === undefined && skipped[0]?.reason === "invalid-value");
check("unknown key → dropped, unknown-key", where([{ key: "secret", value: "x" }]) === undefined && skipped[0]?.reason === "unknown-key");

/* T-2: an object value is never an operator */
check(
  "{ $where: 'sleep(1000)' } as a value → dropped, invalid-value",
  where([{ key: "name", operation: "=", value: { $where: "sleep(1000)" } }]) === undefined && skipped[0]?.reason === "invalid-value",
  json(skipped),
);
check(
  "{ $gt: '' } as a value → dropped, invalid-value",
  where([{ key: "name", value: { $gt: "" } }]) === undefined && skipped[0]?.reason === "invalid-value",
  json(skipped),
);
check("object inside an in list → dropped", where([{ key: "age", operation: "in", value: [1, { $gt: 0 }] }]) === undefined);
check("text operator with an object → dropped", where([{ key: "name", operation: "contains", value: { $regex: ".*" } }]) === undefined);

/* R19: raw nodes */
let refused: unknown;
try {
  where({ secret: { $regex: "^a" } });
} catch (error) {
  refused = error;
}
check(
  "unbranded raw node → QueryKitError forbidden-key, site filter",
  refused instanceof QueryKitError && refused.info.reason === "forbidden-key" && refused.info.site === "filter",
);
check("raw() node → used as-is", json(where(raw({ $expr: { $gt: ["$age", 1] } }))) === json({ $expr: { $gt: ["$age", 1] } }));

console.log(`where: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
