---
name: querykit-drizzle-pg
description: Use when code builds or calls a querykit repository over Drizzle ORM and PostgreSQL (@querykitjs/drizzle-pg) - createRegistry(db, schema), registry.repository(table, options), filterable / sortable / limits policy, forcedColumns / allowedColumns, relations and with, findList / findInfinite / findCursor, updateWhere / deleteWhere, scoped, softDelete, upsert, aggregate, or registry.transaction.
---

## Safety rules

- DO list what a client may filter on in `filterable` (column → operators). `"*"` admits every operator, so DON'T put `"*"` on a secret column. Without `filterable` a client gets only `=` / `in` on `allowedColumns` (else the `forcedColumns` keys, else only the primary key). Anything else is `QueryKitError` `forbidden-key` / `forbidden-operator` before SQL runs.
- DO list sortable columns in `sortable`. The default is the primary key and `createdAt`, and a client `cursorKey` must be in it too.
- DO declare `forcedColumns` (always these columns) or `allowedColumns` (the client may narrow them) on the repository. They guard reads only.
- DON'T pass a plain object from request data as a filter node. A raw node is either a Drizzle `SQL` built in server code, or a value branded with `raw()` from `@querykitjs/core`. `raw()` skips `filterable`.
- DO list every relation a client may load in `relations`, with its `columns` (a list, or `"*"` on purpose). An unlisted relation, column or nested `with` is `forbidden-key`, `site: "with"`.
- DO keep the request limits. They are core `DEFAULT_QUERY_LIMITS`: depth `5`, conditions `30`, array items `200`, string length `256`, offset `10000`, sort fields `3`, LIKE wildcards `2`. Page size is capped at `200` (`maxPerPage` / `maxLimit`). Raise one with `limits` on the registry or the repository. DON'T hard-code your own checks.
- DO set `strict: true` (a dropped condition throws) or `onSkippedCondition` (a dropped condition is reported). By default an unknown key is skipped silently.
- DON'T call `updateWhere` / `deleteWhere` without a filter to mean "all rows": that is `empty-filter`. Pass `{ all: true }` on purpose. The scope still applies.
- DO set `cursorSecret` on the registry when cursor tokens leave the server. Unsigned or altered tokens are then `invalid-value`.
- DON'T call HTTP, queues or email inside `registry.transaction`: the callback may run again, and only database work rolls back.

## When to use

- A Node backend on Drizzle ORM + PostgreSQL (`drizzle(client, { schema })`) that serves list requests from `@querykitjs/web`.
- Offset, infinite and cursor pages, RBAC / tenant scoping, soft delete, bulk writes, upserts and aggregation over one table.
- Typed results: `columns` and `with` infer the row type.

## Setup

```ts
import { createRegistry, type AnyDb } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const db: AnyDb; // drizzle(client, { schema }) — pass createRegistry the same schema object
const schema = { users };

export const registry = createRegistry(db, schema, {
  strict: true,
  cursorSecret: process.env.CURSOR_SECRET,
  limits: { maxInItems: 100 },
});

export const usersRepo = registry.repository(users, {
  forcedColumns: { id: true, name: true, age: true, createdAt: true },
  filterable: { name: ["contains", "="], age: [">=", "<=", "between"], createdAt: ["between"] },
  sortable: ["id", "name", "createdAt"],
});
```

## Common tasks

### Filter with the typed helper

```ts
import { createFilters, type Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const usersRepo: Repository<typeof users>;
const f = createFilters<typeof users>();

const adults = await usersRepo.findAll({
  filter: f.and(f.gte("age", 18), f.or(f.contains("name", "ali"), f.isNull("age"))),
});
```

### Offset page with a multi-field sort

```ts
import type { Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const usersRepo: Repository<typeof users>;

const page = await usersRepo.findList({
  page: 2,
  perPage: 20,
  sort: [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
  withTotal: false, // no COUNT query: total_items / total_pages are null, has_next still works
});
console.log(page.meta.has_next);
```

### Infinite scroll

```ts
import type { Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const usersRepo: Repository<typeof users>;

const feed = await usersRepo.findInfinite({ limit: 20, offset: 40 });
console.log(feed.meta.has_more, feed.meta.next_offset);
```

### Cursor (keyset) pages

```ts
import type { Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const usersRepo: Repository<typeof users>;

const first = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc" });
const next = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc", cursor: first.meta.next_cursor });
const back = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc", cursor: next.meta.prev_cursor, direction: "backward" });
console.log(back.data.length);
```

### Relations with `with`

```ts
import { relations } from "drizzle-orm";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createRegistry, type AnyDb } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

const posts = pgTable("posts", { id: serial("id").primaryKey(), title: text("title").notNull(), authorId: integer("author_id").notNull() });
const postsRelations = relations(posts, ({ one }) => ({ author: one(users, { fields: [posts.authorId], references: [users.id] }) }));
declare const db: AnyDb;

const registry = createRegistry(db, { users, posts, postsRelations });
const postsRepo = registry.repository(posts, { relations: { author: { columns: ["id", "name"] } } });

const post = await postsRepo.findById(1, { with: { author: true } });
console.log(post?.author.name);
```

### Scope every call to some tenants

```ts
import type { Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const usersRepo: Repository<typeof users>;
declare const allowedIds: number[];

const mine = usersRepo.scoped({ id: { in: allowedIds } }); // { in: [] } matches no row
await mine.findList({ page: 1 });
```

### Bulk update / delete, upsert

```ts
import type { Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const usersRepo: Repository<typeof users>;

const { count } = await usersRepo.updateWhere([{ key: "age", operation: "<", value: 18 }], { age: 18 });
const { rows } = await usersRepo.deleteWhere([{ key: "age", operation: "isNull" }], { returning: { limit: 50 } });
await usersRepo.deleteWhere({ all: true }); // every row inside the scope — on purpose only
await usersRepo.upsert({ name: "Ali", email: "ali@example.com", createdAt: new Date() }, { target: "email" });
console.log(count, rows.length);
```

### Soft delete

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createRegistry, type AnyDb } from "@querykitjs/drizzle-pg";

const notes = pgTable("notes", { id: serial("id").primaryKey(), body: text("body").notNull(), deletedAt: timestamp("deleted_at") });
declare const db: AnyDb;

const notesRepo = createRegistry(db, { notes }).repository(notes); // a deletedAt column turns soft delete on
await notesRepo.softDelete(1);
await notesRepo.restore(1);
const all = await notesRepo.findAll({ withDeleted: true });
console.log(all.length);
```

### Aggregate and transaction

```ts
import type { Registry, Repository } from "@querykitjs/drizzle-pg";
import { users } from "@querykitjs/drizzle-pg/skill-prelude";

declare const registry: Registry<{ users: typeof users }>;
declare const usersRepo: Repository<typeof users>;

const byAge = await usersRepo.aggregate({ count: true, groupBy: "age" }); // groupBy / sum / … columns must be in filterable
await registry.transaction(async () => {
  await usersRepo.create({ name: "Vali", email: "vali@example.com", createdAt: new Date() });
  await usersRepo.updateById(1, { age: 30 });
}); // a throw rolls both back
console.log(byAge);
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`). Meta is snake_case: `total_items`, `total_pages`, `has_next`, `has_more`, `next_offset`, `next_cursor`, `prev_cursor`. The body types are `WireOffsetParams`, `WireInfiniteParams` and `WireCursorParams`; validate with `@querykitjs/zod` or `@querykitjs/class-validator`, then pass the body as is. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

## Mistakes to avoid

- Giving `createRegistry` a different schema object than `drizzle(client, { schema })`: tables are matched by identity, so the repository fails with "table was not found".
- Expecting a custom repository method to bypass `filterable`: the policy checks server filters too. Build a separate, wider repository for internal code and never hand it to a route.
- Using `contains` / `like` on a non-text column: it is skipped as `invalid-value` (Postgres has no LIKE on a timestamp or a number).
- Putting a client string into `sql` template text: build raw `SQL` from server values only, with bound parameters.
- Writing a relation without `columns`: the relation stays closed.
