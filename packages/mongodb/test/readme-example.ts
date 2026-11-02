/**
 * The README "Quick start" example (task 017 acceptance 8), kept compiling: `test:types`
 * (and the package typecheck) compiles it. It is never run — it needs a live MongoDB.
 */
import { MongoClient, type ObjectId } from "mongodb";
import { z } from "zod";

import { createRegistry } from "../src/index";

const WalletSchema = z.object({
  _id: z.string(),
  shop_id: z.string(),
  owner: z.string(),
  status: z.enum(["active", "blocked"]),
  balance: z.number(),
  created_at: z.date(),
});
type Wallet = { _id: ObjectId; shop_id: ObjectId; owner: string; status: "active" | "blocked"; balance: number; created_at: Date };

export async function quickStart() {
  const client = await MongoClient.connect(process.env.MONGO_URL!);
  const qk = createRegistry(client, { timestamps: { createdAt: "created_at" }, cursorSecret: process.env.CURSOR_SECRET });

  const wallets = qk.repository(client.db("app").collection<Wallet>("wallets"), {
    schema: WalletSchema,
    objectId: ["_id", "shop_id"],
    forcedColumns: { _id: true, owner: true, status: true, balance: true, created_at: true },
    filterable: { status: ["=", "in"], owner: ["=", "startsWith"], created_at: ["between", ">=", "<="] },
    sortable: ["_id", "created_at", "balance"],
  });

  const shopWallets = wallets.scoped({ shop_id: { in: ["65a1b2c3d4e5f60718293a4b"] } });
  const { data, meta } = await shopWallets.findList({ page: 1, perPage: 20, filter: [{ key: "status", value: "active" }] });
  const total: number | null = meta.total_items;
  const owner: string | undefined = data[0]?.owner;

  await qk.transaction(async () => {
    await wallets.updateById("65a1b2c3d4e5f60718293a4b", { balance: 90 });
  });
  return { total, owner };
}
