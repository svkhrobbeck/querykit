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

> ⚠️ Pass `createRegistry` the **same** schema object you passed to
> `drizzle(client, { schema })`. A table is looked up by **object identity** (that
> is how drizzle keys `db.query`), so importing the schema through two different
> paths — a monorepo duplicate, a bundler, a second `* as schema` — fails with
> "table was not found". The error message says so when that is the cause.

**`createRegistry` options** — identical to the mongoose adapter:

| Option               | Default                           | Meaning                                                      |
| -------------------- | --------------------------------- | ------------------------------------------------------------ |
| `defaultPerPage`     | core `DEFAULT_PER_PAGE` (20)      | `findList` page size                                         |
| `defaultLimit`       | core `DEFAULT_LIMIT` (20)         | `findInfinite`/`findCursor` limit                            |
| `maxPerPage`         | core `DEFAULT_MAX_PER_PAGE` (200) | upper bound for `perPage` (`Infinity` disables it)           |
| `maxLimit`           | core `DEFAULT_MAX_LIMIT` (200)    | upper bound for `limit`                                      |
| `strict`             | `false`                           | unknown key → `QueryKitError` (400) instead of a silent drop |
| `onSkippedCondition` | —                                 | callback for every dropped condition                         |

`maxPerPage`/`maxLimit` are a **second layer**: even if validation
(`@querykitjs/zod` factories) is bypassed, the repository clamps.

### 2. Per-table repositories

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { users } from "../schema";

export const usersRepository = registry.repository(users, base => ({
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

`repository()` takes four shapes (the same as the mongoose adapter):

```ts
registry.repository(users);                            // plain
registry.repository(users, base => ({ … }));           // + custom methods
registry.repository(users, options);                   // + per-repo options
registry.repository(users, options, base => ({ … }));  // both
```

### 3. Projection guards (`RepositoryOptions`)

`columns` can arrive straight from the client, so the safe selection is declared
on the **repository** — where `scope` (RBAC) already lives:

```ts
export const usersRepository = registry.repository(users, {
  forcedColumns: { id: true, fullName: true, email: true }, // password can never come out
});

// or softer: the client picks, but only from this list
export const postsRepository = registry.repository(posts, {
  allowedColumns: ["id", "title", "createdAt"],
});
```

| Option           | Behaviour                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| `forcedColumns`  | the client's `columns` is **ignored entirely**                                |
| `allowedColumns` | the client's selection is **intersected**; empty intersection → the allowlist |
| `scope`          | constant equality filter on every read/write (also available via `scoped()`)  |

Details worth knowing:

- An empty intersection yields the allowlist, **not the full row** — so asking for
  a forbidden column is useless rather than dangerous.
- `aggregate` is guarded too: `min("password")` or `groupBy: "password"` leaks as
  much as a projection.
- `cursorKey` comes from the client and the cursor column must be selected for
  pagination — under a guard it stays in the query but is **stripped** from the
  rows you get back.
- `forcedColumns: {}` or `allowedColumns: []` **throws** when the repository is
  built, because a projection that selects nothing means "select everything".
- ⚠️ The guard affects **read** methods only (`findAll`/`findOne`/`findById`/
  `findList`/`findInfinite`/`findCursor` + `aggregate`). Write methods (`create`,
  `upsert`, `updateById`, `softDelete`, …) return the **full row** by type
  contract. Re-read with `findById`, or map it yourself, before handing a write
  result to a client.

That removes the `{ ...params, columns: SAFE_COLUMNS }` trick from routes — along
with the chance of writing the spread the wrong way round.

### 4. Bad conditions: watch them, or refuse them

An unknown filter/sort key is **dropped silently** by default (db-service
parity). The catch: a filter is meant to _narrow_ a result set, so a mistyped key
that vanishes makes the endpoint return **more** data than intended.

```ts
// step 1: watch (behaviour unchanged)
createRegistry(db, schema, {
  onSkippedCondition: info => logger.warn({ querykit: info }, "condition dropped"),
});

// step 2: once the log is clean — strict mode
createRegistry(db, schema, { strict: true });
```

With `strict: true` a `QueryKitError` is thrown:

```ts
import { QueryKitError } from "@querykitjs/core";

try {
  return await usersRepository.findList(params);
} catch (err) {
  if (err instanceof QueryKitError) return c.json({ error: err.message, info: err.info }, 400);
  throw err;
}
```

A `scope` or `cursorKey` key is **always** fatal, regardless of `strict` — those
are the server's own, and dropping them silently would be a security defect.

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

Sort is always a `{ key, direction }[]` array — the same shape across `@querykitjs/web` and every adapter.

Falls back to `createdAt DESC`, then `id DESC`, when no sort is given — a deterministic order so pagination stays stable.

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

A scope can also be given as `registry.repository(table, { scope })`. An unknown
scope key **throws** when the repository is built — dropping it silently would
remove the RBAC filter.

## Wire (JSON) values and migrating from DbService

A request body is JSON, so a date always arrives as a **string**. The adapter
casts it according to the column type:

```json
{ "key": "createdAt", "operation": "<=", "value": "2026-07-28T12:00:00.000Z" }
```

- `timestamp`/`date` columns (`mode: "date"` — drizzle's default) get the ISO
  string cast to a `Date`. `mode: "string"` columns are left alone.
- `in`/`notIn` arrays and `between`/`notBetween` tuples are covered too.
- So are cursor tokens: `cursorKey: "createdAt"` paginates correctly.
- Text-pattern operators (`like`/`ilike`/`contains`/…) are **not** cast on a date
  column — Postgres renders the timestamp as text and `ILIKE`s it. Mongo cannot
  regex a `Date` path, so the mongoose adapter skips such a condition instead —
  a **deliberately documented divergence**; neither adapter crashes.
- An unparseable value (`"not-a-date"`) drops the condition (or 400s under
  `strict`). **One** bad element in an `in` list drops the whole condition, since
  a half-applied filter would silently widen the result set.

**Migrating from DbService:** the old wire's `type: "date"` field is no longer
needed — `@querykitjs/zod` strips it (without erroring) and coercion happens
server-side from the column type. Helpers like `coerceDateFilters` can go.

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
