---
name: querykit-prisma-pg
description: Use when code builds or calls a querykit repository over Prisma 6.19 / 7 and PostgreSQL (@querykitjs/prisma-pg) - createRegistry(prisma), registry.repository(prisma.model, options), filterable / sortable / limits policy, fields overrides, forcedColumns / allowedColumns, relations and with, findList / findInfinite / findCursor, updateWhere / deleteWhere, scoped, softDelete, upsert, aggregate, or registry.transaction.
---

## Safety rules

- DO list what a client may filter on in `filterable` (field → operators; a relation field is `"posts.title"`). `"*"` admits every operator, so DON'T put `"*"` on a secret field. Without `filterable` a client gets only `=` / `in` on `allowedColumns` (else the `forcedColumns` keys, else only the `@id` field). Anything else is `QueryKitError` `forbidden-key` / `forbidden-operator` before Prisma is called.
- DO list sortable fields in `sortable`. The default is the `@id` field and `createdAt`, and a client `cursorKey` must be in it too.
- DO declare `forcedColumns` (always these fields) or `allowedColumns` (the client may narrow them) on the repository. They guard reads only.
- DON'T pass a plain Prisma `where` object from request data as a filter node. Server code brands one with `raw()` from `@querykitjs/core`; an unbranded object is `forbidden-key`. `raw()` skips `filterable`.
- DO list every relation a client may load in `relations`, with its `columns` (a list, or `"*"` on purpose). An unlisted relation, column, filter field or nested relation is `forbidden-key`, `site: "with"`.
- DO keep the request limits. They are core `DEFAULT_QUERY_LIMITS`: depth `5`, conditions `30`, array items `200`, string length `256`, offset `10000`, sort fields `3`, LIKE wildcards `2`. Page size is capped at `200` (`maxPerPage` / `maxLimit`). Raise one with `limits` on the registry or the repository. DON'T hard-code your own checks.
- DO set `strict: true` (a dropped condition throws) or `onSkippedCondition` (a dropped condition is reported). By default an unknown key is skipped silently.
- DON'T call `updateWhere` / `deleteWhere` without a filter to mean "all rows": that is `empty-filter`. Pass `{ all: true }` on purpose. The scope still applies.
- DO set `cursorSecret` on the registry when cursor tokens leave the server. Unsigned or altered tokens are then `invalid-value`.
- DO declare in `fields` what the Prisma runtime model does not say: `nativeType: "Uuid"` (else a malformed uuid reaches PostgreSQL as a driver error) and `isRequired: false` for optional fields on Prisma 7 (else NULL order stays PostgreSQL's).
- DON'T call HTTP, queues or email inside `registry.transaction`: the callback may run again, and only database work rolls back.

## When to use

- A Node backend on Prisma 6.19 or 7 with PostgreSQL (`prisma-client` generator + `@prisma/adapter-pg`) that serves list requests from `@querykitjs/web`.
- Offset, infinite and cursor pages, RBAC / tenant scoping, soft delete, bulk writes, upserts and aggregation over one model.
- Typed results: `columns` and `with` infer the row type.

## Setup

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient; // new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

export const registry = createRegistry(prisma, { strict: true, cursorSecret: process.env.CURSOR_SECRET, limits: { maxInItems: 100 } });

export const usersRepo = registry.repository(prisma.user, {
  forcedColumns: { id: true, name: true, age: true, createdAt: true },
  filterable: { name: ["contains", "="], age: [">=", "<=", "between"], createdAt: ["between"] },
  sortable: ["id", "name", "createdAt"],
  fields: [{ name: "age", isRequired: false }],
});
```

## Common tasks

### Filter with the helper and a raw `where`

```ts
import { raw } from "@querykitjs/core";
import { createFilters, createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const f = createFilters<typeof prisma.user>(); // field-name autocomplete, raw() nodes allowed
const usersRepo = createRegistry(prisma).repository(prisma.user, { filterable: { age: [">="], name: ["contains"] } });

const adults = await usersRepo.findAll({
  filter: f.and(f.gte("age", 18), f.or(f.contains("name", "ali"), raw({ posts: { some: { title: "querykit" } } }))),
});
```

### Offset page with a multi-field sort

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const usersRepo = createRegistry(prisma).repository(prisma.user, { sortable: ["id", "name", "createdAt"] });

const page = await usersRepo.findList({
  page: 2,
  perPage: 20,
  sort: [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
  withTotal: false, // no count query: total_items / total_pages are null, has_next still works
});
console.log(page.meta.has_next);
```

### Infinite scroll

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const usersRepo = createRegistry(prisma).repository(prisma.user);

const feed = await usersRepo.findInfinite({ limit: 20, offset: 40 });
console.log(feed.meta.has_more, feed.meta.next_offset);
```

### Cursor (keyset) pages

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const usersRepo = createRegistry(prisma).repository(prisma.user);

const first = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc" });
const next = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc", cursor: first.meta.next_cursor });
const back = await usersRepo.findCursor({ limit: 20, cursorKey: "createdAt", order: "desc", cursor: next.meta.prev_cursor, direction: "backward" });
console.log(back.data.length);
```

### Relations with `with`

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const usersRepo = createRegistry(prisma).repository(prisma.user, {
  relations: { posts: { columns: ["id", "title"] } },
});

const rows = await usersRepo.findAll({ columns: { id: true, name: true }, with: { posts: { take: 5 } } });
console.log(rows[0]?.posts[0]?.title);
```

### Scope every call to some owners

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
declare const authorIds: number[];
const postsRepo = createRegistry(prisma).repository(prisma.post);

const mine = postsRepo.scoped({ authorId: { in: authorIds } }); // { in: [] } matches no row
await mine.findList({ page: 1 });
```

### Bulk update / delete, upsert

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const usersRepo = createRegistry(prisma).repository(prisma.user, { filterable: { age: ["<", "isNull"] } });

const { count } = await usersRepo.updateWhere([{ key: "age", operation: "<", value: 18 }], { age: 18 });
const { rows } = await usersRepo.deleteWhere([{ key: "age", operation: "isNull" }], { returning: { limit: 50 } });
await usersRepo.upsert({ name: "Ali", email: "ali@example.com" }, { target: "email" });
console.log(count, rows.length);
```

### Soft delete, aggregate and transaction

```ts
import { createRegistry } from "@querykitjs/prisma-pg";
import type { PrismaClient } from "@querykitjs/prisma-pg/skill-prelude";

declare const prisma: PrismaClient;
const registry = createRegistry(prisma);
const postsRepo = registry.repository(prisma.post, { filterable: { authorId: ["="] } }); // a deletedAt field turns soft delete on

await postsRepo.softDelete(1);
await postsRepo.restore(1);
const perAuthor = await postsRepo.aggregate({ count: true, groupBy: "authorId" }); // groupBy / sum / … fields must be in filterable
await registry.transaction(async () => {
  await postsRepo.create({ title: "Hello", authorId: 1 });
  await postsRepo.updateById(1, { title: "Hello again" });
}); // a throw rolls both back
console.log(perAuthor);
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`). Meta is snake_case: `total_items`, `total_pages`, `has_next`, `has_more`, `next_offset`, `next_cursor`, `prev_cursor`. The body types are `WireOffsetParams`, `WireInfiniteParams` and `WireCursorParams`; validate with `@querykitjs/zod` or `@querykitjs/class-validator`, then pass the body as is. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

## Mistakes to avoid

- An unescaped `_` in `like` / `ilike`: Prisma has no one-character wildcard, so it is `invalid-value`. Write `\\_` for a literal underscore.
- Using the database column name (`created_at`) as a key: keys are Prisma field names (`createdAt`).
- Using a text operator on a non-`String` field: it is skipped as `invalid-value`.
- Calling `updateById` / `deleteById` / `softDelete` / `restore` on a composite `@@id`: use `updateWhere` / `deleteWhere`.
- Expecting `?schema=` in the connection string to work with the driver adapter: pass `{ schema }` to `PrismaPg` instead.
