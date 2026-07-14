<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/drizzle-pg

> Advanced filtering + flexible pagination repository layer for Drizzle ORM (PostgreSQL).

Collapses the code you'd otherwise hand-write on top of Drizzle — complex filters, three pagination styles, transactions, RBAC scoping, soft-delete, bulk/aggregation — into one typed repository. Result types are inferred automatically from `with`/`columns`.

```ts
const { data, meta } = await usersRepository.findList({
  page: 2,
  perPage: 20,
  filter: f.and(f.eq("status", "active"), f.gte("age", 18)),
  sort: [{ key: "createdAt", direction: "desc" }],
});
//    ^? data: User[]   meta: { total_items, total_pages, has_next, ... }
```

## Features

- **Advanced filters** — nested `and`/`or`/`not`, 25+ operators, raw SQL escape hatch, `f` helpers.
- **3 pagination styles** — offset (`findList`), infinite scroll (`findInfinite`), cursor/keyset (`findCursor`).
- **`with` + `columns` inference** — relations & selected fields typed with no manual generics.
- **Multi-field sort**, `count`, `exists`, `aggregate` (count/sum/avg/min/max + groupBy).
- **Transactions** — `registry.transaction()`; repositories inside auto-join it (savepoint nesting).
- **Scoped repository** — permanent base filter + create defaults for RBAC / multi-tenancy.
- **Soft-delete** — automatic when a `deletedAt` column exists; `softDelete`/`restore`/`withDeleted`.
- **Upsert / bulk** — `upsert`, `upsertMany` (auto-chunked).
- Fully **TypeScript**; `db` + `schema` are injected (drop-in for any Drizzle project).

## Install

```bash
bun add @querykitjs/drizzle-pg drizzle-orm
# or: npm i @querykitjs/drizzle-pg drizzle-orm
```

`drizzle-orm` is a peer dependency.

## Setup

### 1. Registry (once)

```ts
// db/registry.ts
import { createRegistry } from "@querykitjs/drizzle-pg";
import { db } from "./index"; // drizzle(client, { schema })
import * as schema from "./schema";

export const registry = createRegistry(db, schema);
// or configure pagination defaults:
// export const registry = createRegistry(db, schema, { defaultPerPage: 20, defaultLimit: 20 });
```

`defaultPerPage` (findList) / `defaultLimit` (infinite/cursor) fall back to `@querykitjs/core`'s **20** when omitted.

### 2. Per-table repositories

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { users } from "../schema";

export const usersRepository = registry.repository(users, base => ({
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

## Advanced filters

A filter is a tree of field conditions and logical groups (`and`/`or`/`not`). A flat array is treated as implicit `AND`.

```ts
import { createFilters } from "@querykitjs/drizzle-pg";
const f = createFilters<typeof users>(); // column-name autocomplete

await usersRepository.findAll({
  filter: f.and(f.eq("status", "active"), f.or(f.gte("age", 18), f.in("role", ["admin", "owner"])), f.not(f.isNull("deletedAt"))),
});
```

**Operators:** `= != > >= < <=` (and `eq ne gt gte lt lte`), `like ilike notLike`, `contains startsWith endsWith` (case-insensitive), `in notIn`, `between notBetween` (`value: [min, max]`), `isNull isNotNull`. Raw Drizzle `SQL` can be dropped in anywhere. Values are passed through as-is (no automatic type coercion).

## Multi-field sort

```ts
sort: [
  { key: "name", direction: "asc" },
  { key: "createdAt", direction: "desc" },
]; // ORDER BY name ASC, created_at DESC
```

Falls back to `created_at DESC` when no sort is given.

## Pagination — three strategies

```ts
// 1. Offset — total_items / total_pages
const page = await usersRepository.findList({ page: 2, perPage: 20, filter, sort });

// 2. Infinite scroll (limit + offset, no COUNT) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (stable under inserts) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

## Typed relations & column selection

Read methods infer their return type from `with` and `columns` — no manual generics:

```ts
const post = await postsRepository.findById(id, { with: { author: true } });
post?.author.name; // string

const rows = await usersRepository.findAll({ columns: { id: true, name: true } });
rows[0].id; // number
rows[0].email; // ❌ type error — not selected
```

## Transactions

```ts
await registry.transaction(async () => {
  await dispatchesRepository.create({ ... });
  await stockRepository.updateById(stockId, { qty: next });
}); // throws -> full rollback
```

Repositories used inside automatically use the transaction connection (ambient context). Nesting creates savepoints.

## Scoped repository (RBAC / multi-tenancy)

```ts
const mine = roadmapsRepository.scoped({ supervisorId: user.id });
await mine.findList({ page: 1 }); // WHERE supervisor_id = user.id
await mine.create({ ... });        // supervisor_id forced to user.id
```

## Soft-delete

Auto-enabled when the table has a `deletedAt` column. Reads exclude soft-deleted rows by default; `withDeleted: true` includes them. A `updatedAt` column, if present, is bumped on every update.

```ts
await postsRepository.softDelete(id);
await postsRepository.restore(id);
await postsRepository.findAll({ withDeleted: true });
```

## Upsert, bulk & aggregation

```ts
await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });
await productsRepository.upsertMany(rows, { target: "externalId" });
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
DATABASE_URL=... bun run --filter @querykitjs/drizzle-pg test:smoke
```

## License

MIT © Suhrobbek Soatov
