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

### Requirements

|                   | Version            | Tested (`bun run test:matrix`) |
| ----------------- | ------------------ | ------------------------------ |
| Node.js           | `>=22.12`          | 24                             |
| `mongoose` (peer) | `^8.24 \|\| ^9.11` | 8.24.7, 9.11.4                 |

Node 20 is no longer supported (`engines`: `>=22.12`). Peer ranges cover the last two majors; both ends are tested.

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

The `connection` is passed in (so transactions share the right session).

**`createRegistry` options** — identical to the drizzle-pg adapter:

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

`timestamps` — the createdAt / deletedAt field names (for example in a snake_case project): the default sort and the default `sortable` use that `createdAt`, soft delete (`softDelete`, `restore`, `withDeleted`) uses that `deletedAt`.

```ts
export const registry = createRegistry(mongoose.connection, { timestamps: { createdAt: "created_at", deletedAt: "deleted_at" } });
```

### 2. Per-model repositories

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { User } from "../models/user.model";

export const usersRepository = registry.repository(User, base => ({
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

`repository()` takes four shapes (the same as the drizzle-pg adapter):

```ts
registry.repository(User);                            // plain
registry.repository(User, base => ({ … }));           // + custom methods
registry.repository(User, options);                   // + per-repo options
registry.repository(User, options, base => ({ … }));  // both
```

### 3. Projection guards (`RepositoryOptions`)

`columns` can arrive straight from the client, so the safe selection is declared
on the **repository** — where `scope` (RBAC) already lives:

```ts
export const usersRepository = registry.repository(User, {
  forcedColumns: { _id: true, fullName: true, email: true }, // password can never come out
});

// or softer: the client picks, but only from this list
export const postsRepository = registry.repository(Post, {
  allowedColumns: ["_id", "title", "createdAt"],
});
```

| Option           | Behaviour                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| `forcedColumns`  | the client's `columns` is **ignored entirely**                                |
| `allowedColumns` | the client's selection is **intersected**; empty intersection → the allowlist |
| `scope`          | constant equality filter on every read/write (also available via `scoped()`)  |
| `relations`      | populatable relations (type-only — drives `with` inference)                   |

Details worth knowing:

- An empty intersection yields the allowlist, **not the full document**.
- `aggregate` is guarded too: `min("password")` or `groupBy: "password"` leaks as
  much as a projection.
- `cursorKey` comes from the client and the cursor field must be selected for
  pagination — under a guard it stays in the query but is **stripped** from the
  documents you get back.
- `forcedColumns: {}` or `allowedColumns: []` **throws** when the repository is built.
- ⚠️ The guard affects **read** methods only (`findAll`/`findOne`/`findById`/
  `findList`/`findInfinite`/`findCursor` + `aggregate`). Write methods (`create`,
  `upsert`, `updateById`, `softDelete`, …) return the **full document** by type
  contract. Re-read with `findById`, or map it yourself, before handing a write
  result to a client.

### 4. Bad conditions: watch them, or refuse them

An unknown filter/sort key is **dropped silently** by default. The catch: a filter
is meant to _narrow_ a result set, so a mistyped key that vanishes makes the
endpoint return **more** data than intended.

```ts
// step 1: watch (behaviour unchanged)
createRegistry(mongoose.connection, {
  onSkippedCondition: info => logger.warn({ querykit: info }, "condition dropped"),
});

// step 2: once the log is clean — strict mode
createRegistry(mongoose.connection, { strict: true });
```

```ts
import { QueryKitError } from "@querykitjs/core";

try {
  return await usersRepository.findList(params);
} catch (err) {
  if (err instanceof QueryKitError) return c.json({ error: err.message, info: err.info }, 400);
  throw err;
}
```

A `scope` or `cursorKey` key is **always** fatal, regardless of `strict`.

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

- **Indexes and operators.** `startsWith` is an anchored (`^`) but case-insensitive (`i`) regex: MongoDB uses an index poorly for it. On a large collection keep a lowercase shadow field (`nameLower`) and give that `=` / `startsWith`. `contains`, `endsWith`, `!=` and `notIn` cannot use an index (COLLSCAN) — closed in the default `filterable`, open them only for small collections. Use `in` for enum fields.

## Safe by default — `filterable`, `sortable`, `limits`

A client filters and sorts only by the paths the server allows, and only with the operators it allows. A refused request stops with a `QueryKitError` before it reaches MongoDB — whatever `strict` and `onSkippedCondition` say. Option names, defaults and `reason`/`site` are the same as drizzle-pg's and prisma-pg's (`id` ≡ `_id`).

```ts
const usersRepository = registry.repository(User, {
  forcedColumns: { _id: true, name: true, status: true, createdAt: true },
  filterable: {
    status: ["=", "in"],
    createdAt: ["between", ">=", "<="],
    name: ["startsWith"], // open only where listed
  },
  sortable: ["_id", "createdAt", "name"],
  limits: { maxInItems: 500 },
  maxTimeMS: 1000,
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
- An unbranded raw Mongo filter (`{ $where: … }`, `{ secret: { $regex: … } }`, `{ $expr: … }`) can come from a JSON body — `forbidden-key`, nothing is sent (R19). Server code brands it with `raw({...})`; ⚠️ `raw()` is not checked by `filterable`.
- LIKE patterns: more than `maxLikeWildcards` (2) `%`/`_` → `limit-exceeded`; a run of `%%` counts once.
- Every read (`find`, `findOne`, `countDocuments`, `aggregate`) carries `maxTimeMS` (default 2 000); past it ⇒ `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`) — map it to 503/504, not 400.

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
// withTotal: false — no count query (large tables): perPage + 1 rows, total_items / total_pages = null
const fast = await usersRepository.findList({ page: 2, perPage: 20, withTotal: false });

// 2. Infinite scroll (limit + offset) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (stable under inserts, keyed on `_id` by default) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

### Cursor: ties and signing

- The seek key is `(cursorKey, _id)`: with a non-unique `cursorKey` (for example a shared `createdAt`) no row is skipped or repeated. When `cursorKey` is the primary key itself the seek uses that one field.
- A token (v2) holds only scalar values (string, number, boolean, ISO date) and they are cast to the field type; an object, an array or a value that does not fit → `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` (the driver is not called).
- The registry option `cursorSecret` signs tokens with HMAC-SHA256; an unsigned or altered token → `invalid-value`. Without it tokens are unsigned — a client can build one itself (still only within the allowed `sortable` keys and the filter).

```ts
export const registry = createRegistry(mongoose.connection, { cursorSecret: process.env.CURSOR_SECRET });
```

## Typed relations & field selection

A client `with` opens only the relations listed in `relations` (task 014, R21):

```ts
const postsRepository = registry.repository(Post, {
  relations: { author: { model: User, columns: ["name"] } }, // model — for typing only
});
await postsRepository.findAll({ with: { author: true } }); // author with name only
```

- `columns` is required — a list or an explicit `"*"`. `with: { rel: true }` also selects only those columns.
- An unlisted relation, column, filter field or nested relation → `QueryKitError` `reason: "forbidden-key"`, `site: "with"`, `key` `relation` or `relation.field`; the driver is not called.
- Allowed options: `select`, a nested `populate` (with `nested`), `match` (its fields in `filterable`; no `$where` / `$expr`), `options.limit` / `options.skip`.
- The shorthand `{ author: User }` is for typing only: `with: { author: … }` → `forbidden-key`.

Read methods infer their return type from `with` (populate) and `columns` — no manual generics:

```ts
const post = await postsRepository.findById(id, { with: { author: true } });
post?.author.name; // populated

const rows = await usersRepository.findAll({ columns: { id: true, name: true } });
rows[0].id; // ObjectId
rows[0].email; // ❌ type error — not selected
```

To type and open populated relations, give the referenced model inside the rule: `registry.repository(Post, { relations: { author: { model: User, columns: ["name"] } } })` (the shorthand `{ author: User }` only types — it does not allow `with`).

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
- `rows` are **not** atomic: `updateWhere` reads them right **after** the update with the same filter (if the patch changes a filtered field, other documents may show up); `deleteWhere` reads them just **before** the delete. `count` is `matchedCount` / `deletedCount`.

## Transactions

> ⚠️ Only **database work** inside the callback. External effects (HTTP calls, messages, email) go through an outbox: the driver may retry the transaction, and an external effect would run again and cannot be rolled back.

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

A scope can also be given as `registry.repository(Model, { scope })`. An unknown
scope key **throws** when the repository is built — dropping it silently would
remove the RBAC filter.

A scope value may also be a list (task 014): `{ shopId: { in: [1, 2] } }` limits every read and write to those values; an empty list (`{ in: [] }`) matches no row (not an error). `create` fills in the equality scopes only.

```ts
const mine = repository.scoped({ shopId: { in: user.shopIds } });
```

## Values, NULL order and parity

All three adapters (drizzle-pg, prisma-pg, mongoose) return the same result (task 021):

- **Literal value operators.** `contains`, `startsWith` and `endsWith` match their value literally: `startsWith "%"` finds only rows starting with `%`, `contains "_"` a real `_`. Wildcards belong to `like` / `ilike` / `notLike` only.
- **Type casting.** Every value is cast to its field type (number, boolean, date, ObjectId, enum). A mismatch (`age = "abc"`) is `invalid-value`: the condition is dropped and `onSkippedCondition` is called, a `QueryKitError` under `strict`; the driver is not called.
- **`not`** follows SQL three-valued logic: `not(and(…))` / `not(or(…))` over a NULL field agree on every adapter.
- **NULL order.** NULL first on `asc`, last on `desc` (MongoDB's order).
- **A malformed sort item** (`null`, `{}`) is dropped and reported as `invalid-value` (`site: "sort"`), an error under `strict`.

## Migrating to 3.0

In 3.0 a repository without a policy is **narrow**: `=` and `in` on `allowedColumns` / `forcedColumns` / `_id` only, sorting by `_id` and `createdAt`. To bring back the 2.x behaviour for one repository on purpose:

```ts
const open = registry.repository(User, {
  filterable: { _id: "*", name: "*", email: "*", status: "*", createdAt: "*" },
  sortable: ["_id", "name", "email", "status", "createdAt"],
});
```

A raw Mongo filter now needs `raw()` (R19):

```ts
import { raw } from "@querykitjs/core";

// 2.x — forbidden-key in 3.0:
// await usersRepository.findAll({ filter: { age: { $gt: 18 } } });

// 3.0:
await usersRepository.findAll({ filter: raw({ age: { $gt: 18 } }) });
```

- New reasons: `forbidden-key`, `forbidden-operator`, `limit-exceeded`; new site: `page` — return them as 400.
- Pages deeper than offset 10 000 are refused — use `findCursor`, or raise `limits: { maxOffset }`.
- Every read runs with `maxTimeMS: 2000`; raise `maxTimeMS` on the repository for long report queries. A timeout throws `QueryKitTimeoutError`.
- A LIKE pattern with more than 2 wildcards is refused (`maxLikeWildcards`).
- Cursor tokens are v2 now (task 012): an old (v1) `next_cursor` / `prev_cursor` is refused with `invalid-value` — after the upgrade start paging from the first page again.
- `updateWhere` / `deleteWhere` return `{ count }` instead of `Row[]` (task 013); for rows pass `{ returning: { limit } }` → `{ count, rows }`.
- A filterless `updateWhere` / `deleteWhere` is `empty-filter`; write `{ all: true }` for every row. A mutation filter now passes the `filterable` policy.
- `OffsetMeta.total_items` / `total_pages` are typed `number | null` (`null` with `withTotal: false`).
- `with` now needs the `relations` allow-list (task 014): on a repository without it `with` is `forbidden-key`, `site: "with"`.
- `relations: { author: User }` → `relations: { author: { model: User, columns: ["name"] } }` (the shorthand no longer allows `with`).
- A scope value may be `{ in: [...] }`; the registry option `timestamps` names the createdAt / deletedAt fields.

## Wire (JSON) values and migrating from DbService

A request body is JSON, so a date always arrives as a **string**. The adapter
casts it according to the schema path:

```json
{ "key": "createdAt", "operation": "<=", "value": "2026-07-28T12:00:00.000Z" }
```

- `Date` paths get the ISO string cast to a `Date`. The scope is **deliberately**
  the same as drizzle-pg's: each adapter only judges the types it maps through JS
  and leaves the rest to the database.
- `in`/`notIn` arrays, `between`/`notBetween` tuples and cursor tokens are covered
  too (`cursorKey: "createdAt"` paginates correctly).
- Mongo cannot `$regex` a `Date` path (`Can't use $options with Date`), so a
  text-pattern operator (`contains`/`ilike`/…) on a date field is **skipped** as
  `invalid-value` and reported in `onSkippedCondition` — the SQL adapters do the same.
- An unparseable value (`"not-a-date"`) drops the condition (or 400s under
  `strict`). **One** bad element in an `in` list drops the whole condition.

**Migrating from DbService:** the old wire's `type: "date"` field is no longer
needed — `@querykitjs/zod` strips it (without erroring) and coercion happens
server-side from the path type.

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
bun run --filter @querykitjs/mongoose test:smoke   # in-memory replica set (mongodb-memory-server)
```

## License

MIT © Suhrobbek Soatov
