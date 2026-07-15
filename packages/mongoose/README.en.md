<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/mongoose

[![npm](https://img.shields.io/npm/v/@querykitjs/mongoose.svg)](https://www.npmjs.com/package/@querykitjs/mongoose) [![license](https://img.shields.io/npm/l/@querykitjs/mongoose.svg)](./LICENSE)

> Advanced filtering + flexible pagination repository layer for Mongoose (MongoDB).

Collapses the code you'd otherwise hand-write on top of Mongoose — complex filters, three pagination styles, transactions, RBAC scoping, soft-delete, bulk/aggregation — into one typed repository. Result types are inferred automatically from `with`/`columns`. The public surface mirrors [`@querykitjs/drizzle-pg`](https://www.npmjs.com/package/@querykitjs/drizzle-pg), so the **same frontend contract** ([`@querykitjs/web`](https://www.npmjs.com/package/@querykitjs/web)) drives both a Postgres and a MongoDB backend.

## Quick start

```ts
import mongoose, { Schema } from "mongoose";
import { createRegistry, createFilters } from "@querykitjs/mongoose";

// 1. a normal Mongoose model
interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  age: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
const User = mongoose.model<IUser>("User", new Schema<IUser>({ name: String, email: String, age: Number, status: String }, { timestamps: true }));

// 2. connect, then build the registry from the connection
await mongoose.connect(process.env.MONGO_URL!);
export const registry = createRegistry(mongoose.connection);

// 3. one typed repository per model
export const usersRepository = registry.repository(User);

// 4. query — filters, sort, pagination, all typed
const f = createFilters<IUser>();
const { data, meta } = await usersRepository.findList({
  page: 2,
  perPage: 20,
  filter: f.and(f.eq("status", "active"), f.gte("age", 18)),
  sort: [{ key: "createdAt", direction: "desc" }],
});
//    ^? data: IUser[]   meta: { total_items, total_pages, has_next, ... }
```

## Features

- **Advanced filters** — nested `and`/`or`/`not`, 25+ operators, raw Mongo query escape hatch, `f` helpers. SQL three-valued-logic parity (negation excludes null/missing).
- **3 pagination styles** — offset (`findList`), infinite scroll (`findInfinite`), cursor/keyset (`findCursor`, default key `_id`).
- **`with` + `columns` inference** — populated relations & selected fields typed with no manual generics.
- **Multi-field sort**, `count`, `exists`, `aggregate` (count/sum/avg/min/max + groupBy).
- **Transactions** — `registry.transaction()`; repositories inside auto-join it (requires a replica set).
- **Scoped repository** — permanent base filter + create defaults for RBAC / multi-tenancy.
- **Soft-delete** — automatic when a `deletedAt` path exists; `softDelete`/`restore`/`withDeleted`.
- **Upsert / bulk** — `upsert`, `upsertMany` (auto-chunked, input-order results).
- `id` ↔ `_id` aliasing so the wire contract stays identical across adapters; reads return plain POJOs (`.lean()`).

## Install

```bash
bun add @querykitjs/mongoose mongoose
# or: npm i @querykitjs/mongoose mongoose
```

`mongoose` (>= 8) is a peer dependency.

## Setup

### 1. Registry (once)

```ts
// db/registry.ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";

export const registry = createRegistry(mongoose.connection);
// or configure pagination defaults:
// export const registry = createRegistry(mongoose.connection, { defaultPerPage: 20, defaultLimit: 20 });
```

`defaultPerPage` (findList) / `defaultLimit` (infinite/cursor) fall back to `@querykitjs/core`'s **20** when omitted. The `connection` is passed in (so transactions share the right session).

### 2. Per-model repositories

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { User } from "../models/user.model";

export const usersRepository = registry.repository(User, base => ({
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

## MongoDB specifics

- **`id` ↔ `_id`.** Use `"id"` anywhere (filters, `columns`, `idKey`, `cursorKey`) — it resolves to Mongo's `_id`, so the wire contract is identical to the SQL adapter. String ids from the frontend cast to `ObjectId` automatically:
  ```ts
  await usersRepository.findById("665f0e...b3a"); // string → ObjectId
  await usersRepository.findAll({ filter: [{ key: "id", operation: "in", value: [id1, id2] }] });
  ```
- **Value casting.** Wire strings are cast by the schema — an ISO date string → `Date`, a hex string → `ObjectId` — consistently in `find`, `aggregate` `$match`, and cursor tokens.
- **Reads are `.lean()`** — plain POJOs (not hydrated Mongoose documents), matching the SQL adapter's rows.
- **Cursor** keys on `_id` by default (override with `cursorKey`) — stable under inserts.
- **Transactions need a replica set** — a single-node one is enough for local dev (`mongod --replSet rs0` then `rs.initiate()`, or [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server) in tests).

## Advanced filters

A filter is a tree of field conditions and logical groups (`and`/`or`/`not`). A flat array is treated as implicit `AND`. `id` resolves to `_id`.

```ts
import { createFilters } from "@querykitjs/mongoose";
const f = createFilters<IUser>(); // field-name autocomplete

await usersRepository.findAll({
  filter: f.and(f.eq("status", "active"), f.or(f.gte("age", 18), f.in("role", ["admin", "owner"])), f.not(f.isNull("deletedAt"))),
});
```

**Operators:** `= != > >= < <=` (and `eq ne gt gte lt lte`), `like ilike notLike`, `contains startsWith endsWith` (case-insensitive), `in notIn`, `between notBetween` (`value: [min, max]`), `isNull isNotNull`. A raw Mongo query object can be dropped in anywhere. Values pass through as-is; wire strings (dates / ObjectIds) are cast by the schema. Negation operators (`ne`/`notIn`/`notLike`/`notBetween`, and single-field `not`) exclude null/missing to match SQL three-valued logic.

## Multi-field sort

```ts
sort: [
  { key: "name", direction: "asc" },
  { key: "createdAt", direction: "desc" },
]; // { name: 1, createdAt: -1 }
```

Sort is always a `{ key, direction }[]` array — the same shape across `@querykitjs/web` and every adapter.

Falls back to `createdAt DESC`, then `_id DESC`, when no sort is given — a deterministic order so pagination stays stable.

## Pagination — three strategies

```ts
// 1. Offset — total_items / total_pages
const page = await usersRepository.findList({ page: 2, perPage: 20, filter, sort });

// 2. Infinite scroll (limit + offset) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (stable under inserts, keyed on `_id` by default) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

## Typed relations & field selection

Read methods infer their return type from `with` (populate) and `columns` — no manual generics:

```ts
const post = await postsRepository.findById(id, { with: { author: true } });
post?.author.name; // populated

const rows = await usersRepository.findAll({ columns: { id: true, name: true } });
rows[0].id; // ObjectId
rows[0].email; // ❌ type error — not selected
```

To type populated relations at runtime, pass the referenced models: `registry.repository(Post, { relations: { author: User } })`.

## Transactions

```ts
await registry.transaction(async () => {
  await dispatchesRepository.create({ ... });
  await stockRepository.updateById(stockId, { qty: next });
}); // throws -> full rollback
```

Repositories used inside automatically use the transaction session (ambient context). **MongoDB transactions require a replica set** (a single-node replica set is enough for local dev). Nesting reuses the outer session.

## Scoped repository (RBAC / multi-tenancy)

```ts
const mine = roadmapsRepository.scoped({ supervisorId: user.id });
await mine.findList({ page: 1 }); // { supervisorId: user.id, ... }
await mine.create({ ... });        // supervisorId forced to user.id
```

## Soft-delete

Auto-enabled when the schema has a `deletedAt` path. Reads exclude soft-deleted docs by default; `withDeleted: true` includes them. When the schema has no `{ timestamps: true }` but a manual `updatedAt` path, it is bumped on every update.

```ts
await postsRepository.softDelete(id);
await postsRepository.restore(id);
await postsRepository.findAll({ withDeleted: true });
```

## Upsert, bulk & aggregation

```ts
await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });
await productsRepository.upsertMany(rows, { target: "externalId" }); // chunked, returns in input order
await visitsRepository.aggregate({ count: true, groupBy: "supervisorId" });
await ordersRepository.aggregate({ sum: "amount", groupBy: "region" });
```

## API reference

| Method                                                         | Returns                      |
| -------------------------------------------------------------- | ---------------------------- |
| `findAll(params?)`                                             | `Row[]`                      |
| `findOne(params?)` / `findById(id, params?)`                   | `Row \| undefined`           |
| `findList(params?)`                                            | `{ data, meta }` offset      |
| `findInfinite(params?)`                                        | `{ data, meta }` infinite    |
| `findCursor(params?)`                                          | `{ data, meta }` cursor      |
| `count(filter?)` / `exists(filter?)`                           | `number` / `boolean`         |
| `aggregate(spec)`                                              | `AggregateRow[]`             |
| `create(values)` / `createMany(values)`                        | `Row` / `Row[]`              |
| `upsert(values, opts)` / `upsertMany(values, opts)`            | `Row` / `Row[]`              |
| `updateById(id, patch, idKey?)` / `updateWhere(filter, patch)` | `Row \| undefined` / `Row[]` |
| `deleteById(id, idKey?)` / `deleteWhere(filter)`               | `Row \| undefined` / `Row[]` |
| `softDelete(id)` / `restore(id)`                               | `Row \| undefined`           |
| `scoped(scope)`                                                | scoped `Repository`          |
| `registry.transaction(fn)`                                     | result of `fn`               |

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run build       # tsup -> dist (ESM + CJS + .d.ts)
bun run --filter @querykitjs/mongoose test:smoke   # in-memory replica set (mongodb-memory-server)
```

## License

MIT © Suhrobbek Soatov
