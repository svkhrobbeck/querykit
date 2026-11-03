/**
 * Interop with Hono's Standard Schema validator (`@hono/standard-validator`),
 * offline through `app.request()`: a valid body reaches the handler cleaned; a
 * 6-level filter is answered 400 before the handler runs. Imported by
 * `smoke.ts`; sets `process.exitCode` on failure.
 */
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { makeOffsetParamsSchema } from "../src/index";

const DEPTH_6 = { and: [{ and: [{ and: [{ and: [{ and: [{ key: "name", operation: "=", value: "a" }] }] }] }] }] };

let handled = 0;
const app = new Hono().post("/list", sValidator("json", makeOffsetParamsSchema()), c => {
  handled++;
  return c.json(c.req.valid("json"));
});

const post = (body: unknown) => app.request("/list", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const problems: string[] = [];

const ok = await post({ page: 1, withDeleted: true });
const okBody: unknown = await ok.json();
if (ok.status !== 200 || JSON.stringify(okBody) !== JSON.stringify({ page: 1 })) problems.push(`valid body: ${ok.status} ${JSON.stringify(okBody)}`);

const before = handled;
const deep = await post({ filter: DEPTH_6 });
if (deep.status !== 400 || handled !== before) problems.push(`depth 6: ${deep.status}, handler calls ${handled - before}`);

for (const problem of problems) console.log(`❌ [standard-schema hono] ${problem}`);
console.log(`${problems.length ? "❌" : "✅"} [standard-schema hono] 2 requests, ${problems.length} failed`);
if (problems.length) process.exitCode = 1;
