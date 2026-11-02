<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/mongodb

[![npm](https://img.shields.io/npm/v/@querykitjs/mongodb.svg)](https://www.npmjs.com/package/@querykitjs/mongodb) [![license](https://img.shields.io/npm/l/@querykitjs/mongodb.svg)](./LICENSE)

> Advanced filtering + flexible pagination repository layer for the official MongoDB driver.

For projects on the plain `mongodb` driver (no Mongoose): one typed repository per collection with complex filters, three pagination styles, transactions, RBAC scoping, soft-delete, bulk writes and aggregation. Field types come from your **zod** schema. The public surface is the same as [`@querykitjs/mongoose`](https://www.npmjs.com/package/@querykitjs/mongoose), [`@querykitjs/drizzle-pg`](https://www.npmjs.com/package/@querykitjs/drizzle-pg) and [`@querykitjs/prisma-pg`](https://www.npmjs.com/package/@querykitjs/prisma-pg), so the **same frontend contract** ([`@querykitjs/web`](https://www.npmjs.com/package/@querykitjs/web)) drives every backend.

## Quick start

```ts
import { MongoClient, type ObjectId } from "mongodb";
import { z } from "zod";
import { createRegistry } from "@querykitjs/mongodb";

const WalletSchema = z.object({
  _id: z.string(),
  shop_id: z.string(),
  owner: z.string(),
  status: z.enum(["active", "blocked"]),
  balance: z.number(),
  created_at: z.date(),
});
type Wallet = { _id: ObjectId; shop_id: ObjectId; owner: string; status: "active" | "blocked"; balance: number; created_at: Date };

const client = await MongoClient.connect(process.env.MONGO_URL!);
const qk = createRegistry(client, { timestamps: { createdAt: "created_at" }, cursorSecret: process.env.CURSOR_SECRET });

export const wallets = qk.repository(client.db("app").collection<Wallet>("wallets"), {
  schema: WalletSchema,
  objectId: ["_id", "shop_id"], // 24-hex strings from the wire → ObjectId
  forcedColumns: { _id: true, owner: true, status: true, balance: true, created_at: true },
  filterable: { status: ["=", "in"], owner: ["=", "startsWith"], created_at: ["between", ">=", "<="] },
  sortable: ["_id", "created_at", "balance"],
});

// one tenant's wallets, newest first, 20 per page
const shopWallets = wallets.scoped({ shop_id: { in: ["65a1b2c3d4e5f60718293a4b"] } });
const { data, meta } = await shopWallets.findList({ page: 1, perPage: 20, filter: [{ key: "status", value: "active" }] });
```

## Install

```bash
bun add @querykitjs/mongodb mongodb zod
# or: npm i @querykitjs/mongodb mongodb zod
```

### Requirements

- Node.js `>= 22.12` (or Bun).
- Peers: `mongodb` `^6.21 || ^7.7`, `zod` `^4`.
- Transactions need a replica set or a sharded cluster (a single-node replica set is enough locally, or `mongodb-memory-server` in tests).

## Setup

- `createRegistry(client, options)` — defaults once: `defaultPerPage`, `defaultLimit`, `maxPerPage`, `maxLimit`, `strict`, `onSkippedCondition`, `limits`, `maxTimeMS` (default 2 000), `cursorSecret`, `timestamps`. The same names as every querykit adapter.
- `qk.repository(collection, options)` — one per collection. `schema` is **required**: the driver has no schema of its own, so the zod object is the one source of field types, unknown keys and the default `filterable`.
- `objectId` — the fields stored as `ObjectId` (default `["_id"]`). They arrive from JSON as 24-hex strings and are cast here; a malformed id is `invalid-value`.
- `forcedColumns` / `allowedColumns` — projection guards (the client's `columns` is ignored / intersected).
- A third argument extends the repository: `qk.repository(collection, options, base => ({ findActive: () => base.findAll({ filter: [{ key: "status", value: "active" }] }) }))`.

## Safe by default — `filterable`, `sortable`, `limits`

A client filters and sorts only by the fields the server allows, with the operators it allows. A refused request stops with a `QueryKitError` before it reaches MongoDB, whatever `strict` says.

| Option       | When not given (default)                                                                           | When refused                                                         |
| ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `filterable` | `allowedColumns` (else the `forcedColumns` keys, else only `_id`), with `"="` and `"in"` only      | `reason: "forbidden-key"` / `"forbidden-operator"`, `site: "filter"` |
| `sortable`   | `_id` and the createdAt field                                                                      | `reason: "forbidden-key"`, `site: "sort"` / `"cursorKey"`            |
| `limits`     | core `DEFAULT_QUERY_LIMITS` (depth 5, conditions 30, array 200, string 256, offset 10 000, sort 3) | `reason: "limit-exceeded"`, `site: "filter"` / `"sort"` / `"page"`   |

- **Values are cast by the schema** — `z.number()` takes `30` or `"30"`, `z.date()` an ISO string, an `objectId` field a 24-hex string, a `z.enum` only its values. An object value (`{ "$where": "…" }`, `{ "$gt": "" }`) is never an operator: `invalid-value`, and nothing reaches the driver.
- An unbranded raw Mongo filter from a JSON body is `forbidden-key`. Server code brands one with `raw({ ... })` from `@querykitjs/core`; ⚠️ `raw()` is not checked by `filterable`.
- LIKE patterns: more than `maxLikeWildcards` (2) `%`/`_` → `limit-exceeded`.
- Every read (`find`, `countDocuments`, `aggregate`) carries `maxTimeMS` (default 2 000); past it ⇒ `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`) — map it to 503/504, not 400.
- **Indexes.** `startsWith` is an anchored, case-insensitive regex — MongoDB uses an index poorly for it; on a large collection keep a lowercase shadow field. `contains`, `endsWith`, `!=` and `notIn` cannot use an index — open them only for small collections.

## Pagination — three strategies

- `findList({ page, perPage, withTotal })` — offset pages; `withTotal: false` skips the count (`total_items` / `total_pages` are `null`).
- `findInfinite({ limit, offset })` — infinite scroll (`has_more`, `next_offset`).
- `findCursor({ cursorKey, limit, cursor, order, direction })` — keyset; ties on `cursorKey` are broken by `_id`, so no row is skipped or repeated; with `cursorSecret` the tokens are signed and an unsigned one is refused.

## Relations (`with`)

Not in this version: `$lookup` is not built, so any `with` is `forbidden-key` (`site: "with"`). Load related documents with a second repository call.

## Bulk update and delete

`updateWhere(filter, patch)` is one `updateMany` and `deleteWhere(filter)` one `deleteMany` — no read before the write; they return `{ count }` (`{ count, rows }` with `returning: { limit }`). An empty filter is refused (`empty-filter`, `site: "mutation"`) unless you pass `{ all: true }`. Writes store values as given — validate the request with your zod schema first; the driver casts nothing.

## Transactions

```ts
await qk.transaction(async () => {
  await wallets.updateById(fromId, { balance: 90 });
  await wallets.updateById(toId, { balance: 110 });
});
```

`client.withSession` + `withTransaction`; repositories called inside join the transaction, nested calls join the outer one. ⚠️ MongoDB retries a transaction body on a transient error — keep side effects (HTTP calls, emails) outside it.

## Scoped repository, soft delete, upsert, aggregation

- `scope` (option) / `repo.scoped(scope)` — added to every read and write; a value may be `{ in: [...] }`; equality values are forced on insert.
- Soft delete: a schema with `deletedAt` (or `timestamps.deletedAt`) hides deleted documents; `softDelete`, `restore`, `withDeleted: true`.
- `upsert` / `upsertMany` (`target`, `set`), `aggregate({ count, sum, avg, min, max, groupBy, filter })` — one `$match` + `$group`.

## Testing helper

```ts
import { explainFind } from "@querykitjs/mongodb/testing";

const plan = await explainFind(wallets, { filter: [{ key: "owner", operation: "startsWith", value: "ali" }] });
```

The query plan of `findAll(params)` with the same checks — assert that a request uses an index. Only in the `/testing` subpath, never in the main bundle.

## API reference

| Export                                      | What                                       |
| ------------------------------------------- | ------------------------------------------ |
| `createRegistry(client, options)`           | registry: `repository(...)`, `transaction` |
| `buildRepository(runtime, collection, opt)` | a repository without a registry            |
| `createFilters<T>()` / `f`                  | typed / untyped filter builders            |
| `explainFind(repo, params)` (`/testing`)    | the query plan of a `findAll`              |

## Development

```bash
bun run --filter @querykitjs/mongodb test:unit   # offline: filter compile + attack tests
bun run --filter @querykitjs/mongodb test:smoke  # real mongod (mongodb-memory-server)
```

## License

MIT
