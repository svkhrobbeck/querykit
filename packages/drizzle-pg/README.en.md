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

### Requirements

|                      | Version        | Tested (`bun run test:matrix`) |
| -------------------- | -------------- | ------------------------------ |
| Node.js              | `>=22.12`      | 24                             |
| `drizzle-orm` (peer) | `>=0.44 <0.46` | 0.44.7, 0.45.4                 |

Node 20 is no longer supported (`engines`: `>=22.12`). Peer ranges cover the last two majors; both ends are tested.

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

export const usersRepository = registry.repository(
  users,
  // 4.0: filter/sort only by the columns listed here (Safe by default)
  { filterable: { email: ["="], status: ["=", "in"], age: [">=", "<="] }, sortable: ["id", "createdAt"] },
  base => ({
    findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
  }),
);
```

⚠️ The policy applies to **every** read call on the repository — the server's own filters in custom methods too (`email` is in `filterable` for `findByEmail`). When internal code must query a column you do not open to clients, build a separate, wider repository for that and never hand it to a route.

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

## Safe by default — `filterable`, `sortable`, `limits`

A client filters and sorts only by the columns the server allows, and only with the operators it allows. A refused request stops with a `QueryKitError` before it reaches the database — whatever `strict` and `onSkippedCondition` say (it is never dropped silently).

```ts
const usersRepository = db.repository(users, {
  forcedColumns: { id: true, fullName: true, status: true, createdAt: true },
  filterable: {
    status: ["=", "in"],
    createdAt: ["between", ">=", "<="],
    fullName: ["contains"], // "contains" and its token "%_%" are one operator
  },
  sortable: ["id", "createdAt", "fullName"],
  limits: { maxInItems: 500 }, // over the registry's createRegistry(..., { limits })
});
```

| Option       | When not given (default)                                                                                | When refused                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `filterable` | `allowedColumns` (else the `forcedColumns` keys, else only the primary key), with `"="` and `"in"` only | `reason: "forbidden-key"` / `"forbidden-operator"`, `site: "filter"` |
| `sortable`   | the primary key and `createdAt` (when the table has it); a client-sent `cursorKey` too                  | `reason: "forbidden-key"`, `site: "sort"` / `"cursorKey"`            |
| `limits`     | core `DEFAULT_QUERY_LIMITS` (depth 5, conditions 30, array 200, string 256, offset 10 000, sort 3)      | `reason: "limit-exceeded"`, `site: "filter"` / `"sort"` / `"page"`   |

- `aggregate`: the `filter` and every `groupBy`/`sum`/`avg`/`min`/`max` column must be in `filterable` (`site: "aggregate"`).
- `findById`: only the client `filter` is checked; `idKey` is the server's choice.
- A key the table does **not** have (`nope`) stays `unknown-key` — skipped, or an error under `strict`.
- Mutation filters (`updateMany`, `deleteMany`, …) count as server code and are not checked.
- Operator aliases are one: `["="]` also admits `eq`, `["contains"]` also `%_%`. `"*"` admits every operator.

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
// withTotal: false — no count query (large tables): perPage + 1 rows, total_items / total_pages = null
const fast = await usersRepository.findList({ page: 2, perPage: 20, withTotal: false });

// 2. Infinite scroll (limit + offset, no COUNT) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (stable under inserts) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

### Cursor: ties and signing

- The seek key is `(cursorKey, primary key)`: with a non-unique `cursorKey` (for example a shared `createdAt`) no row is skipped or repeated. When `cursorKey` is the primary key itself the seek uses that one field.
- A token (v2) holds only scalar values (string, number, boolean, ISO date) and they are cast to the field type; an object, an array or a value that does not fit → `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` (the driver is not called).
- The registry option `cursorSecret` signs tokens with HMAC-SHA256; an unsigned or altered token → `invalid-value`. Without it tokens are unsigned — a client can build one itself (still only within the allowed `sortable` keys and the filter).

```ts
export const registry = createRegistry(db, schema, { cursorSecret: process.env.CURSOR_SECRET });
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

## Bulk update and delete

`updateWhere` / `deleteWhere` are one write (no read before it) and return `{ count }`:

```ts
const { count } = await usersRepository.updateWhere([{ key: "status", value: "trial" }], { status: "expired" });
await usersRepository.deleteWhere([{ key: "status", value: "expired" }]); // { count }

// returning: { limit } — { count, rows }, at most limit rows (maxLimit, default 200)
const { rows } = await usersRepository.updateWhere(filter, patch, { returning: { limit: 50 } });

// no filter — only when you say so (the scope still applies)
await usersRepository.deleteWhere({ all: true });
```

- An empty filter (`undefined`, `{}`, `[]`) or one whose every condition was skipped (for example only an unknown key) → `QueryKitError` `reason: "empty-filter"`, `site: "mutation"` — the driver is not called, the table is never wiped silently.
- A mutation filter passes `filterable` and `limits` like a read's (`forbidden-key`, `forbidden-operator`, `limit-exceeded`) — the server's own filters too.
- `rows` come from the same single `UPDATE … RETURNING` / `DELETE … RETURNING` (atomic), cut to `limit`.

## Transactions

> ⚠️ Only **database work** inside the callback. External effects (HTTP calls, messages, email) go through an outbox: the driver may retry the transaction, and an external effect would run again and cannot be rolled back.

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

## Values, NULL order and parity

All three adapters (drizzle-pg, prisma-pg, mongoose) return the same result (task 021):

- **Literal value operators.** `contains`, `startsWith` and `endsWith` match their value literally: `startsWith "%"` finds only rows starting with `%`, `contains "_"` a real `_`. Wildcards belong to `like` / `ilike` / `notLike` only.
- **Type casting.** Every value is cast to its field type (number, boolean, date, uuid, enum). A mismatch (`age = "abc"`) is `invalid-value`: the condition is dropped and `onSkippedCondition` is called, a `QueryKitError` under `strict`; the driver is not called.
- **`not`** follows SQL three-valued logic: `not(and(…))` / `not(or(…))` over a NULL field agree on every adapter.
- **NULL order.** NULL first on `asc`, last on `desc` (MongoDB's order). drizzle-pg emits `NULLS FIRST` / `NULLS LAST` — ⚠️ the opposite of PostgreSQL's default.
- **A malformed sort item** (`null`, `{}`) is dropped and reported as `invalid-value` (`site: "sort"`), an error under `strict`.

## Migrating to 4.0

In 4.0 a repository without a policy is **narrow**: `=` and `in` on `allowedColumns` / `forcedColumns` / the primary key only, sorting by the primary key and `createdAt`. To bring back the 3.x behaviour (any column, any operator) for one repository on purpose:

```ts
const open = db.repository(users, {
  filterable: { id: "*", fullName: "*", email: "*", status: "*", createdAt: "*" },
  sortable: ["id", "fullName", "email", "status", "createdAt"],
});
```

- First collect from `onSkippedCondition` logs which fields and operators are in use, then narrow `filterable` to exactly those — `"*"` is a stopgap.
- New `QueryKitError` reasons: `forbidden-key`, `forbidden-operator`, `limit-exceeded`; new site: `page`. Return them as 400.
- Pages deeper than offset 10 000 are now refused — use `findCursor`, or raise it with `limits: { maxOffset }`.
- Cursor tokens are v2 now (task 012): an old (v1) `next_cursor` / `prev_cursor` is refused with `invalid-value` — after the upgrade start paging from the first page again.
- `updateWhere` / `deleteWhere` return `{ count }` instead of `Row[]` (task 013); for rows pass `{ returning: { limit } }` → `{ count, rows }`.
- A filterless `updateWhere` / `deleteWhere` is `empty-filter`; write `{ all: true }` for every row. A mutation filter now passes the `filterable` policy.
- `OffsetMeta.total_items` / `total_pages` are typed `number | null` (`null` with `withTotal: false`).

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

| Method                                                                   | Returns                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `findAll(params?)`                                                       | `Row[]`                                                               |
| `findOne(params?)` / `findById(id, params?)`                             | `Row \| undefined`                                                    |
| `findList(params?)`                                                      | `{ data, meta }` offset                                               |
| `findInfinite(params?)`                                                  | `{ data, meta }` infinite                                             |
| `findCursor(params?)`                                                    | `{ data, meta }` cursor                                               |
| `count(filter?)` / `exists(filter?)`                                     | `number` / `boolean`                                                  |
| `aggregate(spec)`                                                        | `AggregateRow[]`                                                      |
| `create(values)` / `createMany(values)`                                  | `Row` / `Row[]`                                                       |
| `upsert(values, opts)` / `upsertMany(values, opts)`                      | `Row` / `Row[]`                                                       |
| `updateById(id, patch, idKey?)` / `updateWhere(filter, patch, options?)` | `Row \| undefined` / `{ count }` (`{ count, rows }` with `returning`) |
| `deleteById(id, idKey?)` / `deleteWhere(filter, options?)`               | `Row \| undefined` / `{ count }` (`{ count, rows }` with `returning`) |
| `softDelete(id)` / `restore(id)`                                         | `Row \| undefined`                                                    |
| `scoped(scope)`                                                          | scoped `Repository`                                                   |
| `registry.transaction(fn)`                                               | result of `fn`                                                        |

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
