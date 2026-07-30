<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/prisma-pg

> A repository layer over **Prisma (PostgreSQL)** with advanced filtering and flexible pagination.

Everything you would otherwise hand-write on top of Prisma — nested filters, three pagination styles, transactions, RBAC scoping, soft-delete, bulk upserts and aggregation — behind one typed repository. Result types are inferred **automatically** from `columns`/`with`.

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

- **Advanced filters** — nested `and`/`or`/`not`, 27 operators, raw Prisma `where` escape hatch, `f` helpers.
- **Three pagination styles** — offset (`findList`), infinite scroll (`findInfinite`), cursor/keyset (`findCursor`).
- **`columns` + `with` inference** — selected fields and loaded relations are typed with no manual generics.
- **Multi-field sort**, `count`, `exists`, `aggregate` (count/sum/avg/min/max + groupBy).
- **Transactions** — `registry.transaction()`; repositories inside it join automatically.
- **Scoped repositories** — a constant base filter + insert defaults, for RBAC / multi-tenancy.
- **Soft delete** — automatic when the model has `deletedAt`; `softDelete`/`restore`/`withDeleted`.
- **Upsert / bulk** — `upsert`, `upsertMany`.
- **Framework-agnostic** — it knows nothing about HTTP: Express, Hono, NestJS, background jobs, all the same.
- **Cross-adapter parity** — the same surface and the same results as `@querykitjs/drizzle-pg` and `@querykitjs/mongoose`.

## Install

```bash
bun add @querykitjs/prisma-pg @prisma/client
# or: npm i @querykitjs/prisma-pg @prisma/client
```

`@prisma/client` (>=5) is a peer dependency. The package never **imports** your generated client: it reads model metadata off your client instance at runtime and derives types from the delegate you pass in.

## Setup

### 1. Registry (once)

```ts
// db/registry.ts
import { PrismaClient } from "@prisma/client";
import { createRegistry } from "@querykitjs/prisma-pg";

export const prisma = new PrismaClient();
export const registry = createRegistry(prisma);
// or with pagination defaults:
// export const registry = createRegistry(prisma, { defaultPerPage: 20, defaultLimit: 20 });
```

### 2. Repository (per model)

A model is taken by its **handle**, the way drizzle-pg takes a table object and mongoose takes a `Model`. Its name (the delegate key, camelCase) works too: `User` → `"user"`, `LegalEntity` → `"legalEntity"`.

```ts
// db/users.repository.ts
import { prisma, registry } from "./registry";

export const usersRepository = registry.repository(prisma.user);
// …or by name: registry.repository("user") — the two are equivalent

// with custom methods:
export const postsRepository = registry.repository("post", base => ({
  findBySlug: (slug: string) => base.findOne({ filter: [{ key: "slug", value: slug }] }),
}));

// with repository options (RBAC / projection):
export const safeUsers = registry.repository("user", {
  forcedColumns: { id: true, name: true, email: true }, // a password can never leak
});
```

## Framework-agnostic: Express, Hono, NestJS

This package knows nothing about HTTP. Parse and validate the request in your app (`@querykitjs/zod` or `@querykitjs/class-validator`); the repository call is identical everywhere.

**Express**

```ts
import express from "express";
import { offsetParamsSchema } from "@querykitjs/zod";
import { usersRepository } from "./db/users.repository";

const app = express();
app.post("/users/list", express.json(), async (req, res) => {
  const params = offsetParamsSchema.parse(req.body);
  res.json(await usersRepository.findList(params));
});
```

**Hono**

```ts
import { Hono } from "hono";
import { offsetParamsSchema } from "@querykitjs/zod";
import { usersRepository } from "./db/users.repository";

const app = new Hono();
app.post("/users/list", async c => {
  const params = offsetParamsSchema.parse(await c.req.json());
  return c.json(await usersRepository.findList(params));
});
```

**NestJS**

```ts
import { Body, Controller, Post } from "@nestjs/common";
import { OffsetParamsDto } from "@querykitjs/class-validator";
import { usersRepository } from "./db/users.repository";

@Controller("users")
export class UsersController {
  @Post("list")
  list(@Body() params: OffsetParamsDto) {
    return usersRepository.findList(params);
  }
}
```

A validated payload goes into the repository params with **no cast** — the contract is closed through `@querykitjs/core`.

## Advanced filters

A filter is a tree of field conditions and logical groups (`and`/`or`/`not`). A flat array is implicit `AND`.

```ts
import { createFilters } from "@querykitjs/prisma-pg";
const f = createFilters<typeof prisma.user>(); // field-name autocomplete

await usersRepository.findAll({
  filter: f.and(f.eq("status", "active"), f.or(f.gte("age", 18), f.in("role", ["admin", "owner"])), f.not(f.isNull("deletedAt"))),
});

// object form (no helpers):
await usersRepository.findAll({
  filter: [
    { key: "status", operation: "=", value: "active" },
    { key: "name", operation: "%_%", value: "ali" },
  ],
});
```

### Operators

| Group      | Operators                                                                        |
| ---------- | -------------------------------------------------------------------------------- |
| Comparison | `=`/`eq`, `!=`/`ne`, `>`/`gt`, `>=`/`gte`, `<`/`lt`, `<=`/`lte`                  |
| Text       | `contains`/`%_%`, `startsWith`/`%_`, `endsWith`/`_%`, `like`, `ilike`, `notLike` |
| Set        | `in`, `notIn`, `between`, `notBetween`                                           |
| NULL       | `isNull`, `isNotNull`                                                            |

`contains`/`startsWith`/`endsWith` are case-**insensitive** (`mode: "insensitive"`), `like` is case-**sensitive**, `ilike` is insensitive — exactly as in the drizzle-pg adapter.

> **LIKE patterns.** Prisma has no raw SQL `LIKE` inside `where`, so the pattern is translated — **exactly**, so any pattern returns the same rows as on drizzle-pg: `%ali%` → `contains`, `ali%` → `startsWith`, `%ali` → `endsWith`, no wildcard → `equals`. Interior `%` and `_` are handled with two identities — `LIKE 'A%S'` ≡ `LIKE 'A%S%' AND LIKE '%S'`, and for a pattern with no `%`, `LIKE 'P'` ≡ `LIKE 'P%' AND NOT LIKE 'P_%'` (which pins the length). Only a **malformed** pattern (a dangling trailing `\`) is dropped and reported.

### Raw `where` escape hatch

For anything the DSL cannot express (relation predicates, JSON filters), pass a Prisma `where` object as a filter node:

```ts
await usersRepository.findAll({ filter: { posts: { some: { title: { contains: "querykit" } } } } });

await usersRepository.findAll({
  filter: f.or(f.eq("role", "admin"), { posts: { some: { published: true } } }),
});
```

### Unknown keys: watch, then enforce

An unknown filter/sort key is **dropped silently** (legacy parity). That widens results, so you can make it visible:

```ts
// step 1: watch (behaviour unchanged)
createRegistry(prisma, { onSkippedCondition: info => logger.warn({ querykit: info }, "condition dropped") });

// step 2: once the log is clean — enforce
createRegistry(prisma, { strict: true });
```

```ts
import { QueryKitError } from "@querykitjs/core";

try {
  return await usersRepository.findList(params);
} catch (err) {
  if (err instanceof QueryKitError) return res.status(400).json({ error: err.message, info: err.info });
  throw err;
}
```

A `scope` or `cursorKey` key is **always** fatal regardless of `strict` — those are the server's own, and dropping them silently would be a security hole.

## Multi-field sort

```ts
await usersRepository.findAll({
  sort: [
    { key: "role", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
});
```

Unknown keys are skipped; if no valid sort remains it falls back to `createdAt desc`, then `<id> desc`, so pagination stays stable.

## Pagination — three strategies

```ts
// 1) Offset — with total_items/total_pages
const list = await usersRepository.findList({ page: 2, perPage: 20 });
list.meta; // { total_items, total_pages, current_page, per_page, has_next, has_prev }

// 2) Infinite scroll — no COUNT
const feed = await postsRepository.findInfinite({ limit: 20, offset: 40 });
feed.meta; // { limit, offset, count, has_more, next_offset }

// 3) Cursor (keyset) — stable under inserts
const p1 = await postsRepository.findCursor({ limit: 20, order: "desc" });
const p2 = await postsRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
p1.meta; // { limit, has_next, has_prev, next_cursor, prev_cursor }
```

`perPage`/`limit` are **capped** (`DEFAULT_MAX_PER_PAGE` = 200) — the repository clamps even if validation was bypassed.

> Cursor tokens are **byte-identical** to the drizzle-pg and mongoose adapters', so an old token keeps working if the backend swaps ORMs.

## Typed `columns` and `with`

```ts
const picked = await usersRepository.findAll({ columns: { id: true, email: true } });
//    ^? { id: number; email: string }[]   — `name` is not even in the type

const withPosts = await usersRepository.findAll({ with: { posts: true } });
withPosts[0].posts[0].title; // the relation is typed

const both = await usersRepository.findAll({ columns: { id: true }, with: { posts: true } });
//    ^? { id: number; posts: Post[] }[]
```

> ⚠️ Prisma rejects `select` and `include` **at the same level**. The adapter handles it: when both are given, relations are placed inside a single `select`. You never see the difference.

A `with` value may be `true` or a Prisma relation config:

```ts
await usersRepository.findAll({ with: { posts: { select: { title: true }, take: 5, orderBy: { createdAt: "desc" } } } });
```

## Transactions

```ts
await registry.transaction(async () => {
  const user = await usersRepository.create({ name: "Ali", email: "ali@example.com" });
  await postsRepository.create({ title: "Hello", authorId: user.id });
});
```

Repositories inside pick up the transaction client through ambient context (AsyncLocalStorage) — no `tx` threading. Any throw rolls everything back.

> ⚠️ Prisma has no savepoints, so a **nested** `transaction()` reuses the current one instead of opening another. The mongoose adapter behaves the same; drizzle-pg creates a real savepoint.

## Scoped repositories (RBAC / multi-tenancy)

```ts
const mine = postsRepository.scoped({ authorId: user.id });
await mine.findList({ page: 1 }); // only this user's posts
await mine.create({ title: "New" }); // authorId filled in automatically
```

The scope is `AND`ed into every read/write and merged into inserts (scope wins). If a scope key does not resolve on the model, building the repository **throws** — dropping it silently would remove the filter.

## Projection guards

```ts
registry.repository("user", { forcedColumns: { id: true, name: true } }); // client `columns` ignored
registry.repository("user", { allowedColumns: ["id", "name", "email"] }); // client selection intersected
```

An empty intersection yields the allowlist, **never** the full row. The guard also covers `aggregate`, and reading a forbidden field through `cursorKey` is prevented.

> ⚠️ Guards affect **read** methods only. Write methods return the full `Row` by type contract — re-read with `findById` before handing a write result to a client.

## Soft delete

Enabled automatically when the model has a `deletedAt` field:

```ts
await postsRepository.softDelete(id); // deletedAt = now()
await postsRepository.findAll({}); // deleted rows are excluded
await postsRepository.findAll({ withDeleted: true }); // everything
await postsRepository.restore(id); // deletedAt = null
```

An `updatedAt` field is bumped on every update (unless it is `@updatedAt`, which Prisma maintains itself — the adapter then stays out of the way).

## Upsert, bulk and aggregation

```ts
await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });
await usersRepository.upsertMany(rows, { target: "externalId" });

await postsRepository.aggregate({ count: true, groupBy: "authorId" });
// → [{ authorId: 1, count: 12 }, …]
await ordersRepository.aggregate({ sum: "amount", avg: "amount", groupBy: "region" });
// → [{ region: "TAS", sum_amount: 900, avg_amount: 75 }, …]
```

> **Compound unique.** A multi-field `target` uses Prisma's generated name: `{ target: ["a", "b"] }` → `where: { a_b: { a, b } }`. For a constraint declared with `@@unique(name: "...")`, use the raw client.
>
> **Bulk.** Prisma has no bulk upsert, so `upsertMany` issues sequential `upsert`s (input order preserved). Wrap large imports in `registry.transaction()`.

## Limitations

- `updateById` / `deleteById` / `softDelete` / `restore` require a **single-field `@id`**. Prisma's `update`/`delete` accept only a unique `where`, while querykit's predicate also carries the scope and soft-delete guards. With a composite `@@id`, use `updateWhere`/`deleteWhere`.
- Filter/sort keys are **Prisma field names** (`createdAt`), not DB columns (`created_at`) — Prisma's own `where` does not accept a `@map`ped name either.
- Text operators only apply to `String` fields; on any other type the condition is dropped and reported.

These are pinned by `test/contract.ts`, which asserts all three adapters agree on the same payload.

## API reference

| Method                                       | Description                            |
| -------------------------------------------- | -------------------------------------- |
| `findAll(params?)`                           | All matching rows                      |
| `findOne(params?)` / `findById(id, params?)` | One row or `undefined`                 |
| `findList(params?)`                          | Offset pagination — `{ data, meta }`   |
| `findInfinite(params?)`                      | Infinite scroll — `{ data, meta }`     |
| `findCursor(params?)`                        | Cursor/keyset — `{ data, meta }`       |
| `count(filter?)` / `exists(filter?)`         | Count / existence                      |
| `create` / `createMany`                      | Insert                                 |
| `upsert` / `upsertMany`                      | Insert or update on conflict           |
| `updateById` / `updateWhere`                 | Update (+ `updatedAt` bump)            |
| `deleteById` / `deleteWhere`                 | Hard delete                            |
| `softDelete` / `restore`                     | Soft delete / restore                  |
| `aggregate(spec)`                            | count/sum/avg/min/max + groupBy        |
| `scoped(scope)`                              | A new repository with a constant scope |

`createRegistry(prisma, options?)` — `defaultPerPage`, `defaultLimit`, `maxPerPage`, `maxLimit`, `strict`, `onSkippedCondition`.

## Development

```bash
bun run build
bun run typecheck
bun run test:generate   # fixture Prisma client (no database needed)
bun run test:query      # compiler tests (no database)
bun run test:contract   # cross-adapter + web contract audit (no database)
bun run test:types      # type-inference test
DATABASE_URL=postgres://user:pass@localhost:5432/db bun run test:smoke
```

## License

MIT
