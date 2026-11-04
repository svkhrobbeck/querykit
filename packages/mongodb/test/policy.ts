/**
 * Attack tests for @querykitjs/mongodb (REQUIREMENTS R13) —
 * no database: each attack payload must end in the expected `QueryKitError` (or a dropped
 * condition) with the driver not called.
 *
 *   bun --preload ./test/bun-v8-shim.ts test/policy.ts
 */
import type { MongoClient } from "mongodb";
import { z } from "zod";
import { QueryKitError, raw } from "@querykitjs/core";

import { driverCalls } from "../../core/test/conformance/fixtures";
import * as main from "../src/index";
import { createRegistry } from "../src/index";
import { explainFind } from "../src/testing";
import { fakeCollection } from "./conformance";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} [policy] ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

const WalletSchema = z.object({ name: z.string(), email: z.string(), age: z.number().nullable(), createdAt: z.date(), secret: z.string() });
const registry = createRegistry({} as MongoClient);
const wallets = registry.repository(fakeCollection, { schema: WalletSchema, filterable: { name: ["=", "%_"] } });

/** The QueryKitError a call throws, and whether the driver was called. */
async function attack(run: () => Promise<unknown>): Promise<{ info?: QueryKitError["info"]; calls: number }> {
  driverCalls.length = 0;
  try {
    await run();
    return { calls: driverCalls.length };
  } catch (error) {
    return { info: error instanceof QueryKitError ? error.info : undefined, calls: driverCalls.length };
  }
}

/* A2 — K1: a field outside `filterable` */
const k1 = await attack(() => wallets.findAll({ filter: [{ key: "secret", operation: "startsWith", value: "a" }] }));
check(
  "K1: startsWith on secret → forbidden-key, site filter, find not called",
  k1.info?.reason === "forbidden-key" && k1.info.site === "filter" && k1.calls === 0,
  JSON.stringify(k1),
);

/* A3 — an operator object as a value never reaches the driver */
const open = registry.repository(fakeCollection, { schema: WalletSchema, filterable: { name: "*", age: "*" } });
for (const value of [{ $where: "sleep(1000)" }, { $gt: "" }]) {
  const skipped: string[] = [];
  const strictRepo = createRegistry({} as MongoClient, { strict: true }).repository(fakeCollection, { schema: WalletSchema, filterable: { name: "*" } });
  const thrown = await attack(() => strictRepo.findAll({ filter: [{ key: "name", operation: "=", value: value as never }] }));
  check(
    `${JSON.stringify(value)} as a value (strict) → invalid-value, driver not called`,
    thrown.info?.reason === "invalid-value" && thrown.calls === 0,
    JSON.stringify(thrown),
  );
  const lenient = createRegistry({} as MongoClient, { onSkippedCondition: info => skipped.push(info.reason) }).repository(fakeCollection, {
    schema: WalletSchema,
    filterable: { name: "*" },
  });
  await lenient.findAll({ filter: [{ key: "name", operation: "=", value: value as never }] });
  check(`${JSON.stringify(value)} as a value → dropped as invalid-value`, skipped.includes("invalid-value"));
}

/* A3a — R19 */
const unbranded = await attack(() => open.findAll({ filter: { age: { $gt: 0 } } as never }));
check("unbranded raw node → forbidden-key, driver not called", unbranded.info?.reason === "forbidden-key" && unbranded.calls === 0, JSON.stringify(unbranded));
const branded = await attack(() => open.findAll({ filter: raw({ age: { $gt: 0 } }) as never }));
check("raw() node → the driver runs it", branded.info === undefined && branded.calls === 1, JSON.stringify(branded));

/* A4 — like limit (core maxLikeWildcards) */
const like = await attack(() => open.findAll({ filter: [{ key: "name", operation: "like", value: "%a%a%b" }] }));
check("like '%a%a%b' → limit-exceeded, driver not called", like.info?.reason === "limit-exceeded" && like.calls === 0, JSON.stringify(like));

/* with — no $lookup in this version */
const withRel = await attack(() => open.findAll({ with: { wallet: true } }));
check("with on any relation → forbidden-key, site with", withRel.info?.reason === "forbidden-key" && withRel.info.site === "with" && withRel.calls === 0);

/* A9 — explainFind only in /testing */
check("main entry has no explainFind", !("explainFind" in main));
let notRepo = "";
try {
  await explainFind({} as never);
} catch (error) {
  notRepo = error instanceof Error ? error.message : String(error);
}
check("explainFind refuses a non-mongodb repository", notRepo.includes("not a @querykitjs/mongodb repository"), notRepo);

/* List order on a schema with no createdAt field: `_id` is the default sort and is not repeated. */
{
  const sorts: unknown[] = [];
  const spied = {
    collectionName: "plain",
    find: (_filter: unknown, options: { sort?: unknown }) => (sorts.push(options.sort), { toArray: async () => [] }),
    countDocuments: async () => 0,
  } as unknown as typeof fakeCollection;
  const plain = registry.repository(spied, { schema: z.object({ name: z.string() }), sortable: ["name"] });
  await plain.findList({});
  check("list order: no createdAt → _id once", JSON.stringify(sorts.at(-1)) === JSON.stringify({ _id: -1 }), JSON.stringify(sorts.at(-1)));
  await plain.findInfinite({ sort: [{ key: "name", direction: "desc" }] });
  check(
    "list order: _id follows the first key's direction",
    JSON.stringify(sorts.at(-1)) === JSON.stringify({ name: -1, _id: -1 }),
    JSON.stringify(sorts.at(-1)),
  );
}

console.log(`policy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
