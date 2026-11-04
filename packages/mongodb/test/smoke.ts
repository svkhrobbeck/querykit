/**
 * Database smoke test for @querykitjs/mongodb — a real `mongod` (mongodb-memory-server
 * replica set, so transactions work). Not in the offline gate (R8); run by hand:
 *
 *   bun run test:smoke
 *
 * Covers what a fake Collection cannot: the driver's own option handling, the
 * (createdAt, _id) cursor walk over 25 equal timestamps,
 * updateWhere as one updateMany, scope { in }, and registry.transaction.
 */
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { z } from "zod";

import { checkListWalk, type WalkableRepository } from "../../core/test/conformance/list-walk";
import { createRegistry } from "../src/index";
import { explainFind } from "../src/testing";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

const OrderSchema = z.object({ _id: z.string(), shop_id: z.string(), status: z.enum(["new", "paid"]), total: z.number(), created_at: z.date() });
type Order = { _id: ObjectId; shop_id: ObjectId; status: "new" | "paid"; total: number; created_at: Date };

const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const client = await MongoClient.connect(server.getUri());
try {
  const orders = client.db("qk_mongodb_smoke").collection<Order>("orders");
  await orders.deleteMany({});
  const shops = [new ObjectId(), new ObjectId(), new ObjectId()];
  const sameTime = new Date("2026-03-01T09:00:00.000Z");
  await orders.insertMany(
    Array.from({ length: 25 }, (_, index) => ({
      _id: new ObjectId(),
      shop_id: shops[index % 3]!,
      status: index % 2 === 0 ? ("new" as const) : ("paid" as const),
      total: index,
      created_at: sameTime,
    })),
  );
  await orders.createIndex({ created_at: 1, _id: 1 });

  const qk = createRegistry(client, { timestamps: { createdAt: "created_at" } });
  const repo = qk.repository(orders, {
    schema: OrderSchema,
    objectId: ["_id", "shop_id"],
    filterable: { status: ["=", "in"], shop_id: ["=", "in"], total: "*" },
  });

  /* A5: 25 equal created_at, limit 10 → 25 unique ids */
  const seen = new Set<string>();
  let cursor: string | null | undefined;
  for (let page = 0; page < 5; page++) {
    const result = await repo.findCursor({ cursorKey: "created_at", limit: 10, cursor });
    for (const row of result.data) seen.add(String(row._id));
    cursor = result.meta.next_cursor;
    if (!result.meta.has_next) break;
  }
  check("cursor walk over 25 equal created_at → 25 unique rows", seen.size === 25, String(seen.size));

  const list = await repo.findList({ page: 1, perPage: 10, filter: [{ key: "status", value: "paid" }] });
  check("findList: 12 paid, page of 10", list.meta.total_items === 12 && list.data.length === 10);

  const scoped = repo.scoped({ shop_id: { in: [shops[0]!.toHexString()] } } as never);
  check("scope { in } limits a read to that shop", (await scoped.count()) === 9);

  const updated = await repo.updateWhere([{ key: "status", value: "new" }], { status: "paid" });
  check("updateWhere → count of matched rows", updated.count === 13);

  await qk.transaction(async () => {
    await repo.updateWhere({ all: true }, { total: 0 });
  });
  check("transaction commits", (await repo.count([{ key: "total", value: 0 }])) === 25);

  const plan = await explainFind(repo, { sort: [{ key: "created_at", direction: "asc" }] });
  check("explainFind returns a query plan", JSON.stringify(plan).includes("queryPlanner"));

  // Offset pages over one repeated value: nothing repeats or goes missing.
  const sameRows = client.db("qk_mongodb_smoke").collection<{ _id: ObjectId; title: string }>("same_rows");
  await sameRows.deleteMany({});
  await sameRows.insertMany(Array.from({ length: 205 }, () => ({ _id: new ObjectId(), title: "same" })));
  const sameRepo = qk.repository(sameRows, {
    schema: z.object({ _id: z.string(), title: z.string() }),
    objectId: ["_id"],
    filterable: { title: "*" },
    sortable: ["title"],
  });
  await checkListWalk(sameRepo as unknown as WalkableRepository, {
    key: "title",
    idKey: "_id",
    filter: [{ key: "title", operation: "=" as const, value: "same" }],
    rows: 205,
    check,
  });
} finally {
  await client.close();
  await server.stop();
}

console.log(`\nmongodb smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
