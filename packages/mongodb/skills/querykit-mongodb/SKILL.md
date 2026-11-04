---
name: querykit-mongodb
description: Use when code builds or calls a querykit repository over the official MongoDB driver (@querykitjs/mongodb) - createRegistry(client), registry.repository(collection, { schema }), filterable / sortable / limits policy, findList / findInfinite / findCursor, updateWhere / deleteWhere, scope, transactions, or explainFind from @querykitjs/mongodb/testing.
---

## Safety rules

- DO pass the document's zod object as `schema` and list ObjectId fields in `objectId` (default `["_id"]`); field types, unknown keys and casting come only from that schema.
- DO list what a client may filter on in `filterable` (field → operators, `"*"` only on purpose). Without it a client gets equality (`=`, `in`) on the projection fields only; anything else is `QueryKitError` `forbidden-key` / `forbidden-operator` before the driver runs.
- DO list sortable fields in `sortable`; the default is `_id` and the createdAt field.
- DON'T pass a plain Mongo object as a filter node from request data. Server code brands one with `raw()` from `@querykitjs/core`; an unbranded node is `forbidden-key`, and `raw()` is not checked by `filterable`.
- DON'T expect a client value to act as an operator: an object value (`{ "$where": … }`, `{ "$gt": "" }`) is `invalid-value` and never reaches MongoDB.
- DON'T send `with`: relations are not built in this version (no `$lookup`); every `with` key is `forbidden-key`, `site: "with"`.
- DO keep `maxTimeMS` (default `2000`, per registry or repository) and map `QueryKitTimeoutError` to 503/504.
- DO keep the request limits (core `DEFAULT_QUERY_LIMITS`; LIKE patterns with more than `2` wildcards are `limit-exceeded`); raise one with `limits`, never turn it off.
- DON'T call `updateWhere` / `deleteWhere` with an empty filter to mean "all rows" — it is `empty-filter`; pass `{ all: true }` on purpose.
- DO set `cursorSecret` on the registry when cursor tokens leave the server; an unsigned token is then refused.
- DO validate a write body with your zod schema first: writes store values as given.

## When to use

- A backend on the plain `mongodb` driver (no Mongoose) that serves querykit list requests from `@querykitjs/web`.
- Tenant / RBAC scoping (`scope`, `repo.scoped(...)`), soft delete, bulk writes, aggregation over one collection.
- Asserting in tests that a request uses an index (`explainFind`).

With Mongoose models use `@querykitjs/mongoose`; the request contract is the same.

## Setup

```ts
import type { MongoClient, ObjectId } from "mongodb";
import { z } from "zod";
import { createRegistry } from "@querykitjs/mongodb";

declare const client: MongoClient;

const UserSchema = z.object({ _id: z.string(), name: z.string(), status: z.enum(["active", "blocked"]), createdAt: z.date() });
type User = { _id: ObjectId; name: string; status: "active" | "blocked"; createdAt: Date };

const qk = createRegistry(client, { maxPerPage: 100 });
export const users = qk.repository(client.db("app").collection<User>("users"), {
  schema: UserSchema,
  forcedColumns: { _id: true, name: true, status: true, createdAt: true },
  filterable: { status: ["=", "in"], name: ["startsWith"] },
  sortable: ["_id", "createdAt", "name"],
});
```

## Common tasks

### Serve a list request

```ts
import type { WireOffsetParams } from "@querykitjs/core";
import type { Repository } from "@querykitjs/mongodb";

declare const users: Repository<{ _id: unknown; name: string; status: string; createdAt: Date }>;

export async function list(body: WireOffsetParams) {
  return users.findList({ ...body, withTotal: false }); // meta.total_items is null, no count query
}
```

### Scope every call to one tenant

```ts
import type { Repository } from "@querykitjs/mongodb";

declare const orders: Repository<{ _id: unknown; shop_id: unknown; total: number }>;

const shopOrders = orders.scoped({ shop_id: { in: ["65a1b2c3d4e5f60718293a4b"] } });
await shopOrders.updateWhere([{ key: "total", operation: ">", value: 0 }], { total: 0 });
```

### Check an index in a test

```ts
import { explainFind } from "@querykitjs/mongodb/testing";
import type { Repository } from "@querykitjs/mongodb";

declare const users: Repository<{ _id: unknown; name: string }>;

const plan = await explainFind(users, { filter: [{ key: "name", operation: "startsWith", value: "ali" }] });
console.log(JSON.stringify(plan).includes("IXSCAN"));
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`), snake_case meta (`total_items`, `has_next`, `next_cursor`, …). `id` means `_id`. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

## Mistakes to avoid

- Relying on an index on `(col)` alone for `findList` or `findInfinite`: they end the order on `_id`, so with no compound `(col, _id)` index MongoDB sorts in memory. `_id` does not count against `maxSortFields`; `findAll` and `findOne` do not add it.
- Forgetting `objectId` for a reference field such as `shop_id` — a 24-hex string then never matches the stored `ObjectId`.
- Expecting a numeric `id` to match: MongoDB ids are ObjectIds, so `{ key: "id", value: 2 }` is `invalid-value`.
- Opening `contains` / `endsWith` on a large collection — they cannot use an index.
- Running `registry.transaction` on a standalone `mongod` — transactions need a replica set.
- Importing `explainFind` from `@querykitjs/mongodb` — it lives only in `@querykitjs/mongodb/testing`.
