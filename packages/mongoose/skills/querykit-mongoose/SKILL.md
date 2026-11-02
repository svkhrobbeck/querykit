---
name: querykit-mongoose
description: Use when code builds or calls a querykit repository over Mongoose models (@querykitjs/mongoose) - createRegistry(mongoose.connection), registry.repository(Model, options), filterable / sortable / limits policy, maxTimeMS, forcedColumns / allowedColumns, relations and with (populate), findList / findInfinite / findCursor, updateWhere / deleteWhere, scoped, softDelete, upsert, aggregate, or registry.transaction.
---

## Safety rules

- DO list what a client may filter on in `filterable` (field → operators). `"*"` admits every operator, so DON'T put `"*"` on a secret field. Without `filterable` a client gets only `=` / `in` on `allowedColumns` (else the `forcedColumns` keys, else only `_id`). Anything else is `QueryKitError` `forbidden-key` / `forbidden-operator` before MongoDB is called.
- DO list sortable fields in `sortable`. The default is `_id` and `createdAt`, and a client `cursorKey` must be in it too.
- DO declare `forcedColumns` (always these fields) or `allowedColumns` (the client may narrow them) on the repository. They guard reads only.
- DON'T pass a plain Mongo object from request data as a filter node. Server code brands one with `raw()` from `@querykitjs/core`; an unbranded object (`{ $where: … }`, `{ $expr: … }`) is `forbidden-key`. `raw()` skips `filterable`.
- DO list every relation a client may populate in `relations` as `{ model, columns }` (a list, or `"*"` on purpose). The shorthand `{ author: User }` only types the result: `with: { author: true }` is still `forbidden-key`, `site: "with"`.
- DO keep the request limits. They are core `DEFAULT_QUERY_LIMITS`: depth `5`, conditions `30`, array items `200`, string length `256`, offset `10000`, sort fields `3`, LIKE wildcards `2`. Page size is capped at `200` (`maxPerPage` / `maxLimit`). Raise one with `limits` on the registry or the repository. DON'T hard-code your own checks.
- DO keep `maxTimeMS` (default `2000`, per registry or repository) and map `QueryKitTimeoutError` to 503/504.
- DO set `strict: true` (a dropped condition throws) or `onSkippedCondition` (a dropped condition is reported). By default an unknown key is skipped silently.
- DON'T call `updateWhere` / `deleteWhere` without a filter to mean "all rows": that is `empty-filter`. Pass `{ all: true }` on purpose. The scope still applies.
- DO set `cursorSecret` on the registry when cursor tokens leave the server. Unsigned or altered tokens are then `invalid-value`.
- DON'T call HTTP, queues or email inside `registry.transaction`: the callback may run again, and only database work rolls back.

## When to use

- A Node backend on Mongoose models that serves list requests from `@querykitjs/web`.
- Offset, infinite and cursor pages, RBAC / tenant scoping, soft delete, bulk writes, upserts, aggregation and populated relations over one model.
- Typed results: `columns` and `with` infer the row type. Reads are `.lean()` plain objects.

With the plain `mongodb` driver use `@querykitjs/mongodb`; the request contract is the same.

## Setup

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { User } from "@querykitjs/mongoose/skill-prelude";

export const registry = createRegistry(mongoose.connection, {
  strict: true,
  maxTimeMS: 2000,
  cursorSecret: process.env.CURSOR_SECRET,
  limits: { maxInItems: 100 },
});

export const usersRepo = registry.repository(User, {
  forcedColumns: { _id: true, name: true, age: true, createdAt: true },
  filterable: { name: ["=", "startsWith"], age: [">=", "<=", "between"], createdAt: ["between"] },
  sortable: ["_id", "name", "createdAt"],
});
```

## Common tasks

### Filter with the typed helper

```ts
import mongoose from "mongoose";
import { createFilters, createRegistry } from "@querykitjs/mongoose";
import { User, type IUser } from "@querykitjs/mongoose/skill-prelude";

const usersRepo = createRegistry(mongoose.connection).repository(User, { filterable: { age: [">=", "isNull"], name: ["startsWith"] } });
const f = createFilters<IUser>();

const adults = await usersRepo.findAll({
  filter: f.and(f.gte("age", 18), f.or(f.startsWith("name", "ali"), f.isNull("age"))),
});
console.log(adults.length);
```

### Offset page with a multi-field sort

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { User } from "@querykitjs/mongoose/skill-prelude";

const usersRepo = createRegistry(mongoose.connection).repository(User, { sortable: ["_id", "name", "createdAt"] });

const page = await usersRepo.findList({
  page: 2,
  perPage: 20,
  sort: [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
  withTotal: false, // no countDocuments: total_items / total_pages are null, has_next still works
});
console.log(page.meta.has_next);
```

### Infinite scroll

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { User } from "@querykitjs/mongoose/skill-prelude";

const usersRepo = createRegistry(mongoose.connection).repository(User);

const feed = await usersRepo.findInfinite({ limit: 20, offset: 40 });
console.log(feed.meta.has_more, feed.meta.next_offset);
```

### Cursor (keyset) pages

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { User } from "@querykitjs/mongoose/skill-prelude";

const usersRepo = createRegistry(mongoose.connection).repository(User);

const first = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc" });
const next = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc", cursor: first.meta.next_cursor });
const back = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc", cursor: next.meta.prev_cursor, direction: "backward" });
console.log(back.data.length);
```

### Relations with `with` (populate)

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { Post, User } from "@querykitjs/mongoose/skill-prelude";

const postsRepo = createRegistry(mongoose.connection).repository(Post, {
  relations: { author: { model: User, columns: ["name"] } },
});

const post = await postsRepo.findOne({ with: { author: true } });
console.log(post?.author.name);
```

### Scope every call to some owners

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { Post } from "@querykitjs/mongoose/skill-prelude";

declare const authorIds: string[];
const postsRepo = createRegistry(mongoose.connection).repository(Post);

const mine = postsRepo.scoped({ author: { in: authorIds } }); // { in: [] } matches no document
await mine.findList({ page: 1 });
```

### Bulk update / delete, upsert

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { User } from "@querykitjs/mongoose/skill-prelude";

const usersRepo = createRegistry(mongoose.connection).repository(User, { filterable: { age: ["<", "isNull"] } });

const { count } = await usersRepo.updateWhere([{ key: "age", operation: "<", value: 18 }], { age: 18 });
const { rows } = await usersRepo.deleteWhere([{ key: "age", operation: "isNull" }], { returning: { limit: 50 } });
await usersRepo.upsert({ name: "Ali", email: "ali@example.com" }, { target: "email" });
console.log(count, rows.length);
```

### Soft delete, aggregate and transaction

```ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";
import { Post } from "@querykitjs/mongoose/skill-prelude";

const registry = createRegistry(mongoose.connection);
const postsRepo = registry.repository(Post, { filterable: { author: ["="] } }); // a deletedAt path turns soft delete on

await postsRepo.softDelete("665f0e9a1c2b3a4d5e6f7a8b");
await postsRepo.restore("665f0e9a1c2b3a4d5e6f7a8b");
const perAuthor = await postsRepo.aggregate({ count: true, groupBy: "author" }); // groupBy / sum / … fields must be in filterable
await registry.transaction(async () => {
  await postsRepo.updateWhere([{ key: "author", value: "665f0e9a1c2b3a4d5e6f7a8b" }], { title: "moved" });
}); // needs a replica set; a throw rolls back
console.log(perAuthor);
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`). Meta is snake_case: `total_items`, `total_pages`, `has_next`, `has_more`, `next_offset`, `next_cursor`, `prev_cursor`. The body types are `WireOffsetParams`, `WireInfiniteParams` and `WireCursorParams`; validate with `@querykitjs/zod` or `@querykitjs/class-validator`, then pass the body as is. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

## Mistakes to avoid

- Opening `contains`, `endsWith`, `!=` or `notIn` on a large collection: they cannot use an index (COLLSCAN). `startsWith` is a case-insensitive regex and uses an index poorly; keep a lowercase shadow field (`nameLower`) and give that `=` / `startsWith`.
- Using a text operator on a Date path: it is skipped as `invalid-value`.
- Running `registry.transaction` on a standalone `mongod`: transactions need a replica set.
- Expecting hydrated documents: reads are `.lean()` plain objects. `"id"` in a filter, `columns` or `cursorKey` means `_id`, and a 24-hex string is cast to `ObjectId`.
- Writing `relations: { author: User }` and expecting `with` to work: give `{ model: User, columns: [...] }`.
